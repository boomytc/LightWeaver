import { useEffect, useRef, useState } from "react";
import {
  CaptionTrack,
  CreativePlan,
  LibraryVersion,
  MediaAssetVersion,
  ProjectDocument,
  ProjectRevision,
  Proposal,
  ProviderDescriptor,
  RunRecord,
  Scene,
  reconcileSceneReferences,
  refKey,
  z,
} from "@lightweaver/weaver/contracts";
import { api, ApiError, requestId } from "../api";
import type { ClientStore, DraftBackup } from "../client/state";
import { onStudioCommand, runCommand, shortcutCommand } from "../commands";
import { desktop, type QuitDecision, type QuitIntent } from "../desktop";
import { Context, type Context as ProjectContext } from "../domain/context";
import { RunDetail } from "../domain/run";
import { saveFate } from "../domain/save";
import { useRunStream } from "../jobs/useRunStream";
import type { ToastItem } from "../ui/ToastStack";
import { currentRoute, routeUrl } from "./route";

type LeaveChoice = "save" | "keep" | "discard" | "cancel";
type CreativePlanValue = z.infer<typeof CreativePlan>;
export type ProjectSessionIdentity = {
  readonly projectId: string;
  readonly generation: number;
};
type AssetEditSession = ProjectSessionIdentity & {
  draftSequence: number;
  assets: ProjectDocument["assets"];
};
type StableRequest = {
  readonly requestId: string;
  readonly expectedRevision?: string;
};

const Capabilities = z.object({
  providers: z.array(ProviderDescriptor),
  defaultVlm: z.string(),
});

export const AssetImportResult = z.object({
  asset: MediaAssetVersion,
  revision: ProjectRevision,
});

export function useProjectSession(client: ClientStore) {
  const [route, setRoute] = useState(currentRoute);
  const [projects, setProjects] = useState<z.infer<typeof ProjectRevision>[]>([]);
  const [library, setLibrary] = useState<z.infer<typeof LibraryVersion>[]>([]);
  const [ctx, setCtx] = useState<ProjectContext | null>(null);
  const [draft, setDraft] = useState<ProjectDocument | null>(null);
  const [base, setBase] = useState("");
  const [dirty, setDirty] = useState(false);
  const [planDraft, setPlanDraft] = useState<CreativePlanValue | null>(null);
  const [planDirty, setPlanDirty] = useState(false);
  const [error, setErrorState] = useState("");
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const pushToast = (message: string, tone: ToastItem["tone"]) => {
    const text = message.trim();
    if (!text) return;
    const scope = projectRef.current ? { projectId: projectRef.current, generation: epoch.current } : null;
    setToasts((items) => [{ id: crypto.randomUUID(), message: text, tone, scope }, ...items].slice(0, 4));
  };
  const setError = (message: string) => {
    setErrorState(message);
    if (message.trim()) pushToast(message, "danger");
  };
  const setNotice = (message: string) => pushToast(message, "ok");
  const dismissToast = (id: string) => setToasts((items) => items.filter((item) => item.id !== id));
  const [conflict, setConflict] = useState<z.infer<typeof ProjectRevision> | null>(null);
  const [busy, setBusy] = useState(false);
  const [locale, setLocale] = useState("zh");
  const [providers, setProviders] = useState<z.infer<typeof ProviderDescriptor>[]>([]);
  const [defaultVlm, setDefaultVlm] = useState("modelbest-vlm");
  const [plan, setPlan] = useState<unknown>(null);
  const [activeRun, setActiveRun] = useState("");
  const [runDetail, setRunDetail] = useState<z.infer<typeof RunDetail> | null>(null);
  const [events, setEvents] = useState<unknown[]>([]);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [jobsOpen, setJobsOpen] = useState(false);
  const [findOpen, setFindOpen] = useState(false);

  const baseRef = useRef(base);
  baseRef.current = base;
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const planDraftRef = useRef(planDraft);
  planDraftRef.current = planDraft;
  const draftSeq = useRef(0);
  const planSeq = useRef(0);
  const listSeq = useRef(0);
  const capabilitiesSeq = useRef(0);
  const refreshSeq = useRef(0);
  const epoch = useRef(0);
  const dirtyRef = useRef(false);
  const planDirtyRef = useRef(false);
  const projectRef = useRef(route.projectId);
  const routeRef = useRef(route);
  routeRef.current = route;
  const clientRef = useRef(client);
  clientRef.current = client;
  const leaveWait = useRef<((choice: LeaveChoice) => void) | null>(null);
  const leaveInProgress = useRef(false);
  const quitAttempt = useRef<symbol | null>(null);
  const jobsWait = useRef<((stop: boolean) => void) | null>(null);
  const urlRef = useRef(routeUrl(route));
  const recoveryDraft = useRef<DraftBackup | null>(null);
  const recoveryClock = useRef(0);
  const activeAction = useRef<{ generation: number } | null>(null);
  const saveRetry = useRef<{
    projectId: string;
    generation: number;
    draftSequence: number;
    planSequence: number;
    includePlan: boolean;
    expectedRevision: string;
    requestId: string;
  } | null>(null);
  const buildRetry = useRef<{ projectId: string; generation: number; revision: string; requestId: string } | null>(null);
  const stableRequests = useRef(new Map<string, StableRequest>());
  const assetImportReceipts = useRef(new Map<string, { requestId: string; revision: string; assetKey: string }>());

  const fail = (
    reason: unknown,
    message = reason instanceof Error ? reason.message : String(reason),
  ) => {
    setError(message);
    if (reason instanceof ApiError && reason.protocol.code === "REVISION_CONFLICT") {
      const details = reason.protocol.details;
      if (details && typeof details === "object" && "current" in details) {
        const parsed = ProjectRevision.safeParse(details.current);
        if (parsed.success) setConflict(parsed.data);
      }
    }
  };
  const handleError = (reason: unknown, message?: string) => {
    fail(reason, message);
  };
  const isSessionCurrent = (identity: ProjectSessionIdentity) =>
    projectRef.current === identity.projectId &&
    routeRef.current.projectId === identity.projectId &&
    epoch.current === identity.generation;
  const stableRequest = (key: string, expectedRevision?: string) => {
    const current = stableRequests.current.get(key);
    if (current) return current;
    const next: StableRequest = {
      requestId: requestId(),
      ...(expectedRevision ? { expectedRevision } : {}),
    };
    stableRequests.current.set(key, next);
    return next;
  };
  const rotateStableRequest = (key: string, previous: StableRequest, expectedRevision = previous.expectedRevision) => {
    const current = stableRequests.current.get(key);
    if (current && current.requestId !== previous.requestId) return current;
    const next: StableRequest = { requestId: requestId(), ...(expectedRevision ? { expectedRevision } : {}) };
    stableRequests.current.set(key, next);
    return next;
  };
  const completeStableRequest = (key: string, attempt: StableRequest) => {
    if (stableRequests.current.get(key)?.requestId === attempt.requestId)
      stableRequests.current.delete(key);
    if (assetImportReceipts.current.get(key)?.requestId === attempt.requestId)
      assetImportReceipts.current.delete(key);
  };
  const assetImportReceipt = (key: string, attempt: StableRequest) => {
    const receipt = assetImportReceipts.current.get(key);
    return receipt?.requestId === attempt.requestId ? receipt : undefined;
  };
  const rememberAssetImport = (key: string, attempt: StableRequest, result: z.infer<typeof AssetImportResult>) => {
    assetImportReceipts.current.set(key, {
      requestId: attempt.requestId, revision: result.revision.id, assetKey: refKey(result.asset),
    });
  };

  const refreshLists = async () => {
    const seq = ++listSeq.current;
    const [nextProjects, nextLibrary] = await Promise.all([
      api("/projects", z.array(ProjectRevision)),
      api("/library", z.array(LibraryVersion)),
    ]);
    if (seq !== listSeq.current) return;
    setProjects(nextProjects);
    setLibrary(nextLibrary);
  };

  const refreshCapabilities = async () => {
    const seq = ++capabilitiesSeq.current;
    try {
      const capabilities = await api("/capabilities", Capabilities);
      if (seq !== capabilitiesSeq.current) return;
      setProviders(capabilities.providers);
      setDefaultVlm(capabilities.defaultVlm);
    } catch (reason) {
      if (seq === capabilitiesSeq.current) fail(reason);
    }
  };

  const nextRecoveryUpdatedAt = () => {
    const known = clientRef.current.drafts.reduce((latest, draft) => {
      const parsed = Date.parse(draft.updatedAt);
      return Number.isFinite(parsed) ? Math.max(latest, parsed) : latest;
    }, 0);
    const millis = Math.max(Date.now(), recoveryClock.current + 1, known + 1);
    recoveryClock.current = millis;
    return new Date(millis).toISOString();
  };

  const persistRecoveryDraft = () => {
    const projectId = projectRef.current;
    const savedBase = baseRef.current;
    if (!projectId || !savedBase || (!dirtyRef.current && !planDirtyRef.current)) return null;
    const draft: DraftBackup = {
      projectId,
      base: savedBase,
      ...(dirtyRef.current && draftRef.current ? { document: draftRef.current } : {}),
      ...(planDirtyRef.current ? { creativePlanDraft: planDraftRef.current } : {}),
      updatedAt: nextRecoveryUpdatedAt(),
    };
    recoveryDraft.current = draft;
    const generation = epoch.current;
    void desktop()?.saveRecoveryDraft?.(draft).catch((reason) => {
      if (projectRef.current === projectId && epoch.current === generation) fail(reason);
    });
    return draft;
  };

  const snapshot = (): DraftBackup | null => {
    const current = recoveryDraft.current;
    if (
      current &&
      current.projectId === projectRef.current &&
      (dirtyRef.current || planDirtyRef.current)
    )
      return current;
    return persistRecoveryDraft();
  };

  const clearNativeRecoveryThrough = async (projectId: string, throughUpdatedAt: string) => {
    if (!projectId || !throughUpdatedAt) return true;
    const generation = epoch.current;
    let cleared = true;
    try {
      await desktop()?.clearRecoveryDraft?.({ projectId, throughUpdatedAt });
    } catch (reason) {
      cleared = false;
      if (generation === epoch.current && projectId === projectRef.current) fail(reason);
    }
    const current = recoveryDraft.current;
    if (
      cleared &&
      current?.projectId === projectId &&
      current.updatedAt <= throughUpdatedAt
    )
      recoveryDraft.current = null;
    return cleared;
  };

  const clearDraftThrough = async (projectId: string, throughUpdatedAt: string) => {
    const generation = epoch.current;
    if (!(await clientRef.current.clearProjectDraft(projectId, throughUpdatedAt))) {
      if (generation === epoch.current && projectId === projectRef.current)
        setError("草稿备份未能清除，原备份仍保留，请恢复连接后重试");
      return false;
    }
    return clearNativeRecoveryThrough(projectId, throughUpdatedAt);
  };

  const reload = async (id = projectRef.current) => {
    if (!id) return;
    const generation = epoch.current;
    const seq = ++refreshSeq.current;
    let next: ProjectContext;
    try {
      next = await api(`/projects/${id}/context`, Context);
    } catch (reason) {
      if (id === projectRef.current && generation === epoch.current && seq === refreshSeq.current) throw reason;
      return;
    }
    if (id !== projectRef.current || generation !== epoch.current || seq !== refreshSeq.current) return;
    setCtx(next);
    if (!dirtyRef.current) {
      setDraft(next.revision.document);
      draftRef.current = next.revision.document;
      setBase(next.revision.id);
      baseRef.current = next.revision.id;
    }
    if (!planDirtyRef.current) {
      const nextPlan = next.revision.document.creativePlan || null;
      setPlanDraft(nextPlan);
      planDraftRef.current = nextPlan;
      setPlanDirty(false);
    }
  };

  const act = async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    const generation = epoch.current;
    if (activeAction.current?.generation === generation) return;
    const owner = { generation };
    activeAction.current = owner;
    setBusy(true);
    setError("");
    try {
      return await fn();
    } catch (reason) {
      if (generation === epoch.current) fail(reason);
    } finally {
      if (activeAction.current === owner) {
        activeAction.current = null;
        if (generation === epoch.current) setBusy(false);
      }
    }
  };

  const edit = (document: ProjectDocument) => {
    const nextDocument = draftRef.current
      ? reconcileSceneReferences(draftRef.current, document)
      : document;
    draftSeq.current += 1;
    draftRef.current = nextDocument;
    dirtyRef.current = true;
    setDraft(nextDocument);
    setDirty(true);
    setPlan(null);
    persistRecoveryDraft();
  };

  const acceptDraftRevision = (revision: z.infer<typeof ProjectRevision>) => {
    setCtx((current) => (current ? { ...current, revision } : current));
    setBase(revision.id);
    baseRef.current = revision.id;
    setConflict(null);
    draftRef.current = revision.document;
    setDraft(revision.document);
    dirtyRef.current = false;
    setDirty(false);
  };

  const acceptProjectRevision = async (
    revision: z.infer<typeof ProjectRevision>,
    guard: { id: string; generation: number; draftSequence: number; planSequence?: number },
  ) => {
    const fate = saveFate({
      requestProjectId: revision.projectId,
      currentProjectId: projectRef.current,
      requestGeneration: guard.generation,
      currentGeneration: epoch.current,
      requestDraftSeq: guard.draftSequence,
      currentDraftSeq: draftSeq.current,
    });
    if (guard.id !== projectRef.current || fate === "ignore") return false;
    const planAccepted = guard.planSequence === undefined || guard.planSequence === planSeq.current;
    if (fate === "accept") acceptDraftRevision(revision);
    else {
      setCtx((current) => (current ? { ...current, revision } : current));
      setConflict(revision);
      persistRecoveryDraft();
    }
    if (guard.planSequence !== undefined && planAccepted) {
      planDirtyRef.current = false;
      setPlanDirty(false);
      const nextPlan = revision.document.creativePlan || null;
      setPlanDraft(nextPlan);
      planDraftRef.current = nextPlan;
    }
    await reload(revision.projectId);
    await refreshLists();
    return fate === "accept" && planAccepted;
  };

  const beginAssetEditSession = (): AssetEditSession | null => {
    const document = draftRef.current;
    if (!document || document.id !== projectRef.current || document.id !== routeRef.current.projectId) return null;
    return {
      projectId: document.id,
      generation: epoch.current,
      draftSequence: draftSeq.current,
      assets: document.assets,
    };
  };

  const acceptAssetImport = (
    result: z.infer<typeof AssetImportResult>,
    editSession: AssetEditSession,
    expectedRevision: string,
  ): "applied" | "stale" | "assets-changed" => {
    const { revision, asset } = result;
    if (
      revision.projectId !== editSession.projectId ||
      revision.document.id !== editSession.projectId ||
      revision.document.assets.every((item) => item.assetId !== asset.assetId)
    )
      throw new Error("素材导入返回了其他项目或不一致的修订");
    if (
      editSession.generation !== epoch.current ||
      editSession.projectId !== projectRef.current
    )
      return "stale";
    if (baseRef.current !== expectedRevision) {
      setConflict(revision);
      throw new Error("素材导入期间项目修订已变化，请重新确认后导入");
    }

    setCtx((current) =>
      current
        ? {
            ...current,
            revision,
            assets: current.assets.some((item) => refKey(item) === refKey(asset))
              ? current.assets
              : [...current.assets, asset],
          }
        : current,
    );
    const live = draftRef.current;
    if (!live) return "stale";
    const assetsUnchanged =
      live.assets.length === editSession.assets.length &&
      live.assets.every(
        (item, index) => refKey(item) === refKey(editSession.assets[index]!),
      );
    if (!assetsUnchanged) {
      setConflict(revision);
      if (dirtyRef.current) persistRecoveryDraft();
      return "assets-changed";
    }
    setBase(revision.id);
    baseRef.current = revision.id;
    const noNewEdits =
      editSession.draftSequence === draftSeq.current && !dirtyRef.current;
    const nextDocument = noNewEdits
      ? revision.document
      : { ...live, assets: revision.document.assets };
    draftRef.current = nextDocument;
    setDraft(nextDocument);
    if (dirtyRef.current) persistRecoveryDraft();
    return "applied";
  };

  const editCreativePlan = (next: CreativePlanValue) => {
    planSeq.current += 1;
    planDirtyRef.current = true;
    planDraftRef.current = next;
    setPlanDirty(true);
    setPlanDraft(next);
    persistRecoveryDraft();
  };

  const saveEdits = async (includePlan: boolean): Promise<string | null> => {
    const document = draftRef.current;
    if (!document || document.id !== projectRef.current || document.id !== routeRef.current.projectId) return null;
    const seq = draftSeq.current;
    const planSequence = planSeq.current;
    const generation = epoch.current;
    const id = document.id;
    const expectedRevision = baseRef.current;
    const recoveryAtSave = snapshot();
    const savedDocument = ProjectDocument.parse(includePlan && planDirtyRef.current
      ? { ...document, creativePlan: planDraftRef.current || undefined }
      : document);
    const previous = saveRetry.current;
    const retry = previous && previous.projectId === id && previous.generation === generation &&
      previous.draftSequence === seq && previous.planSequence === planSequence &&
      previous.includePlan === includePlan && previous.expectedRevision === expectedRevision
      ? previous
      : { projectId: id, generation, draftSequence: seq, planSequence, includePlan, expectedRevision, requestId: requestId() };
    saveRetry.current = retry;
    const revision = await api(`/projects/${id}`, ProjectRevision, {
      method: "PUT",
      body: {
        expectedRevision,
        requestId: retry.requestId,
        document: savedDocument,
      },
    });
    if (saveRetry.current === retry) saveRetry.current = null;
    const fate = saveFate({
      requestProjectId: id,
      currentProjectId: projectRef.current,
      requestGeneration: generation,
      currentGeneration: epoch.current,
      requestDraftSeq: seq,
      currentDraftSeq: draftSeq.current,
    });
    if (fate === "ignore" || baseRef.current !== expectedRevision) return null;
    if (fate === "accept") {
      acceptDraftRevision(revision);
    } else {
      setCtx((current) => (current ? { ...current, revision } : current));
      setBase(revision.id);
      baseRef.current = revision.id;
      if (includePlan && draftRef.current) {
        const next = { ...draftRef.current, creativePlan: revision.document.creativePlan };
        draftRef.current = next;
        setDraft(next);
      }
      setConflict(revision);
      setNotice("保存已写入服务器，但保存期间的新编辑仍保留为草稿");
    }
    if (includePlan && planSequence === planSeq.current) {
      planDirtyRef.current = false;
      setPlanDirty(false);
      const next = revision.document.creativePlan || null;
      planDraftRef.current = next;
      setPlanDraft(next);
    }
    if (dirtyRef.current || planDirtyRef.current) persistRecoveryDraft();
    if (recoveryAtSave) await clearDraftThrough(id, recoveryAtSave.updatedAt);
    await reload(id);
    await refreshLists();
    return generation === epoch.current && id === projectRef.current &&
      seq === draftSeq.current && (!includePlan || planSequence === planSeq.current) &&
      baseRef.current === revision.id ? revision.id : null;
  };

  const runSave = async (includePlan: boolean) => {
    let accepted = false;
    await act(async () => {
      if (!draftRef.current || draftRef.current.id !== projectRef.current || projectRef.current !== routeRef.current.projectId) return;
      if (!dirtyRef.current && (!includePlan || !planDirtyRef.current)) {
        accepted = true;
        return;
      }
      accepted = Boolean(await saveEdits(includePlan));
      if (accepted) setNotice(includePlan ? "项目与方案已保存" : "项目已保存");
    });
    return accepted;
  };
  const save = () => runSave(false);
  const saveAll = () => runSave(true);

  const saveAndBuild = async (): Promise<boolean> => {
    let submitted = false;
    await act(async () => {
      const document = draftRef.current;
      if (!document || document.id !== projectRef.current || document.id !== routeRef.current.projectId) return;
      if (!document?.scenes.length) throw new Error("请先添加至少一个场景，再制作视频");
      const id = projectRef.current;
      const generation = epoch.current;
      const draftSequence = draftSeq.current;
      const planSequence = planSeq.current;
      const revision = dirtyRef.current || planDirtyRef.current
        ? await saveEdits(true)
        : baseRef.current;
      if (generation !== epoch.current || id !== projectRef.current) return;
      if (!revision || draftSequence !== draftSeq.current || planSequence !== planSeq.current ||
          dirtyRef.current || planDirtyRef.current || baseRef.current !== revision) {
        setNotice("等待期间有新编辑或保存版本变化，已保留草稿，请核对后再次制作");
        return;
      }
      const previous = buildRetry.current;
      const retry = previous && previous.projectId === id && previous.generation === generation && previous.revision === revision
        ? previous : { projectId: id, generation, revision, requestId: requestId() };
      buildRetry.current = retry;
      await submitJob(`/projects/${id}/build`, { expectedRevision: revision, requestId: retry.requestId });
      if (buildRetry.current === retry) buildRetry.current = null;
      if (generation !== epoch.current || id !== projectRef.current) return;
      submitted = true;
      setNotice("已提交制作，可继续编辑；本次制作使用刚确认的保存版本");
    });
    return submitted;
  };

  const applyCreativePlan = () => {
    const generation = epoch.current;
    const id = projectRef.current;
    const draftSequence = draftSeq.current;
    const expectedRevision = baseRef.current;
    const candidate = planDraftRef.current;
    return act(async () => {
      if (!draftRef.current || !candidate) return;
      if (dirtyRef.current || planDirtyRef.current) throw new Error("先保存项目草稿与创作方案，再应用方案");
      const revision = await api(`/projects/${id}/creative-plan/apply`, ProjectRevision, {
        method: "POST",
        body: { expectedRevision, requestId: requestId() },
      });
      if (await acceptProjectRevision(revision, { id, generation, draftSequence }))
        setNotice("方案已应用到当前场景；之后可独立编辑，方案不会自动同步");
    });
  };

  const applyCaptionAssist = (runId: string) => {
    const generation = epoch.current;
    const id = projectRef.current;
    const draftSequence = draftSeq.current;
    const expectedRevision = baseRef.current;
    return act(async () => {
      if (!draftRef.current || dirtyRef.current) throw new Error("先保存当前项目草稿，再采用译文字幕");
      const revision = await api(`/projects/${id}/captions/assist/apply`, ProjectRevision, {
        method: "POST",
        body: { runId, expectedRevision, requestId: requestId() },
      });
      if (await acceptProjectRevision(revision, { id, generation, draftSequence }))
        setNotice("译文字幕已显式采用到原字幕轨");
    });
  };

  const adoptAnalysisCaptions = (input: { sourceId?: string; runId?: string; locale?: string } = {}) => {
    const generation = epoch.current;
    const id = projectRef.current;
    const draftSequence = draftSeq.current;
    const expectedRevision = baseRef.current;
    const targetLocale = input.locale || locale;
    return act(async () => {
      if (!draftRef.current || dirtyRef.current) throw new Error("先保存当前项目草稿，再从转写采用字幕");
      const revision = await api(`/projects/${id}/captions/from-analysis`, ProjectRevision, {
        method: "POST",
        body: {
          locale: targetLocale,
          ...(input.sourceId ? { sourceId: input.sourceId } : {}),
          ...(input.runId ? { runId: input.runId } : {}),
          expectedRevision,
          requestId: requestId(),
        },
      });
      if (await acceptProjectRevision(revision, { id, generation, draftSequence }))
        setNotice(`已采用 ${targetLocale} 转写字幕`);
    });
  };

  const submitJob = async (path: string, body: unknown) => {
    const generation = epoch.current;
    const id = projectRef.current;
    const run = await api(path, RunRecord, { method: "POST", body });
    if (id === projectRef.current && generation === epoch.current) {
      setActiveRun(run.id);
      setEvents([]);
      await reload(id);
    }
  };

  const applyProposal = (body: {
    proposalId: string;
    selection: string[];
    ranges: Record<string, { startUs: number; durationUs: number }>;
    allowReuse: boolean;
  }) => {
    const generation = epoch.current;
    const id = projectRef.current;
    const draftSequence = draftSeq.current;
    const expectedRevision = baseRef.current;
    return act(async () => {
      const revision = await api(`/projects/${id}/proposal`, ProjectRevision, {
        method: "POST",
        body: { ...body, expectedRevision, requestId: requestId() },
      });
      if (await acceptProjectRevision(revision, { id, generation, draftSequence }))
        setNotice("候选源窗已应用到场景");
    });
  };

  const searchCandidates = (query: string, mode: string) =>
    act(async () => {
      const generation = epoch.current;
      const id = projectRef.current;
      const result = await api(`/projects/${id}/search`, z.union([Proposal, RunRecord]), {
        method: "POST",
        body: { query, mode, requestId: requestId() },
      });
      if (generation !== epoch.current || id !== projectRef.current) return;
      if ("candidates" in result) await reload(id);
      else setActiveRun(result.id);
    });

  const showPlan = async (path: string, body: unknown) => {
    const generation = epoch.current;
    const seq = draftSeq.current;
    const result = await api(path, z.unknown(), { method: "POST", body });
    if (generation === epoch.current && seq === draftSeq.current) setPlan(result);
  };

  const answerLeave = (choice: LeaveChoice) => {
    setLeaveOpen(false);
    leaveWait.current?.(choice);
    leaveWait.current = null;
  };

  const confirmLeave = async (forQuit = false) => {
    if (activeAction.current?.generation === epoch.current) {
      setNotice("正在保存或提交操作，请等待完成后再离开");
      return "stay" as const;
    }
    if (leaveInProgress.current || (quitAttempt.current && !forQuit)) return "stay" as const;
    if (!dirtyRef.current && !planDirtyRef.current) return "proceed" as const;
    leaveInProgress.current = true;
    try {
      const choice = await new Promise<LeaveChoice>((resolve) => {
        leaveWait.current = resolve;
        setLeaveOpen(true);
      });
      if (choice === "cancel") return "stay" as const;
      if (choice === "discard") {
        const recovery = snapshot();
        if (recovery && !(await clearDraftThrough(recovery.projectId, recovery.updatedAt)))
          return "stay" as const;
        dirtyRef.current = false;
        planDirtyRef.current = false;
        setDirty(false);
        setPlanDirty(false);
        return "proceed" as const;
      }
      if (choice === "keep") {
        const snap = snapshot();
        if (snap && !(await clientRef.current.upsertDraft(snap))) return "stay" as const;
        return "proceed" as const;
      }
      if ((dirtyRef.current || planDirtyRef.current) && !(await saveAll())) return "stay" as const;
      if (planDirtyRef.current || dirtyRef.current) return "stay" as const;
      return "proceed" as const;
    } finally {
      leaveInProgress.current = false;
    }
  };

  const navigate = async (page: string, projectId = "", section = "") => {
    const next = { page, projectId, section };
    const samePlace = page === routeRef.current.page && projectId === routeRef.current.projectId;
    if (!samePlace && (await confirmLeave()) === "stay") return;
    const url = routeUrl(next);
    history.pushState(null, "", url);
    urlRef.current = url;
    setRoute(next);
  };

  const restoreDraft = (saved: DraftBackup) =>
    act(async () => {
      if (!ctx || saved.projectId !== projectRef.current) throw new Error("请先打开备份所属项目再恢复");
      const document = saved.document === undefined ? undefined : ProjectDocument.parse(saved.document);
      if (document && document.id !== saved.projectId) throw new Error("草稿不属于当前项目");
      const nextPlan = saved.creativePlanDraft === undefined
        ? undefined
        : saved.creativePlanDraft === null ? null : CreativePlan.parse(saved.creativePlanDraft);
      setBase(saved.base);
      baseRef.current = saved.base;
      if (saved.base !== ctx.revision.id) setConflict(ctx.revision);
      if (document) {
        edit(document);
      }
      if (nextPlan !== undefined) {
        planSeq.current += 1;
        planDirtyRef.current = true;
        planDraftRef.current = nextPlan;
        setPlanDraft(nextPlan);
        setPlanDirty(true);
        persistRecoveryDraft();
      }
      setNotice("已恢复为未保存草稿，请核对后保存修订");
    });

  const loadServerKeepingDraft = () => act(async () => {
    const revision = conflict;
    const id = projectRef.current;
    const generation = epoch.current;
    const draftSequence = draftSeq.current;
    const planSequence = planSeq.current;
    const expectedBase = baseRef.current;
    if (!revision || revision.projectId !== id) return;
    const canLoad = () => {
      const fate = saveFate({
        requestProjectId: id,
        currentProjectId: projectRef.current,
        requestGeneration: generation,
        currentGeneration: epoch.current,
        requestDraftSeq: draftSequence,
        currentDraftSeq: draftSeq.current,
      });
      if (fate === "ignore" || expectedBase !== baseRef.current) return false;
      if (fate === "keep-local" || planSequence !== planSeq.current) {
        setNotice("备份期间产生了新编辑，已保留当前草稿，请再次确认加载");
        return false;
      }
      return true;
    };
    const snap = snapshot();
    if (snap) {
      const stored = await clientRef.current.upsertDraft(snap);
      if (!canLoad()) return;
      if (!stored) {
        setError("草稿备份保存失败，暂不加载服务器修订");
        return;
      }
      await clearNativeRecoveryThrough(snap.projectId, snap.updatedAt);
      if (!canLoad()) return;
    }
    const contextSequence = ++refreshSeq.current;
    const current = await api(`/projects/${id}/context`, Context);
    if (!canLoad()) return;
    if (contextSequence !== refreshSeq.current) {
      setNotice("项目上下文已刷新，请再次确认加载服务器内容");
      return;
    }
    if (current.revision.id !== revision.id) {
      setCtx(current);
      setConflict(current.revision);
      setNotice("服务器又有新修订，已保留当前草稿，请重新查看差异后确认加载");
      return;
    }
    acceptDraftRevision(current.revision);
    setCtx(current);
    planDirtyRef.current = false;
    setPlanDirty(false);
    const nextPlan = current.revision.document.creativePlan || null;
    setPlanDraft(nextPlan);
    planDraftRef.current = nextPlan;
  });

  const importCaption = (locale: string, body: string, sourceKey: string) => {
    const generation = epoch.current;
    const seq = draftSeq.current;
    const id = projectRef.current;
    const current = draftRef.current;
    if (!current) return Promise.resolve();
    return act(async () => {
      const track = await api("/captions/parse", CaptionTrack, {
        method: "POST",
        body: {
          body,
          locale,
          source: current.assets.find((asset) => refKey(asset) === sourceKey),
          fps: current.profiles[0].fps,
        },
      });
      if (generation !== epoch.current || projectRef.current !== id) return;
      if (seq !== draftSeq.current) throw new Error("导入期间草稿已编辑，请重新导入字幕");
      const latest = draftRef.current;
      if (!latest) return;
      edit(
        ProjectDocument.parse({
          ...latest,
          captions: [...latest.captions.filter((item) => item.locale !== locale), track],
        }),
      );
    });
  };

  const copyBrief = () =>
    act(async () => {
      const id = projectRef.current;
      const generation = epoch.current;
      const text = await api(`/projects/${id}/brief`, z.string());
      if (generation !== epoch.current || projectRef.current !== id) return;
      await navigator.clipboard.writeText(text);
      if (generation === epoch.current && projectRef.current === id) setNotice("已复制当前项目与修订给 agent");
    });

  const addScene = (kind: "card" | "still" | "clip") => {
    const current = draftRef.current;
    if (!current || !ctx) return;
    const id = `scene-${crypto.randomUUID()}`;
    const timing = { kind: "fixed" as const, frames: 90 };
    const image = ctx.assets.find((asset) => asset.kind === "image");
    const video = ctx.assets.find((asset) => asset.kind === "video");
    const raw =
      kind === "card"
        ? {
            id,
            kind,
            cardSpec: {
              template: "title",
              version: "2",
              copy: Object.fromEntries(current.locales.map((item) => [item, { headline: "新卡片" }])),
            },
            timing,
          }
        : kind === "still" && image
          ? { id, kind, image: { assetId: image.assetId, version: image.version }, framing: { fit: "contain" }, timing }
          : kind === "clip" && video
            ? {
                id,
                kind,
                source: { assetId: video.assetId, version: video.version },
                sourceRange: { startUs: 0, durationUs: 1_000_000 },
                framing: { fit: "contain" },
                playback: { kind: "source", audio: { kind: "original" } },
              }
            : null;
    if (!raw) {
      setError("先导入对应的图片或视频素材");
      return;
    }
    edit({ ...current, scenes: [...current.scenes, Scene.parse(raw)] });
  };

  const activeStream = useRunStream({
    runId: activeRun,
    enabled: Boolean(activeRun && route.projectId),
    projectId: route.projectId,
    onDetail: (detail) => {
      if (detail.run.projectId !== route.projectId) return;
      setRunDetail(detail);
      void reload(route.projectId).catch(fail);
    },
    onEvent: (event) => setEvents((current) => [...current.slice(-99), event]),
    onError: fail,
  });

  useEffect(() => {
    const retain = () => {
      const snap = snapshot();
      if (!snap) return;
      void clientRef.current.upsertDraft(snap);
      clientRef.current.keepalive();
    };
    const confirm = (event: BeforeUnloadEvent) => {
      if (!dirtyRef.current && !planDirtyRef.current) return;
      retain();
      if (desktop()) return;
      event.preventDefault();
      event.returnValue = "";
    };
    addEventListener("pagehide", retain);
    addEventListener("beforeunload", confirm);
    return () => {
      removeEventListener("pagehide", retain);
      removeEventListener("beforeunload", confirm);
    };
  }, []);

  useEffect(() => {
    void refreshCapabilities();
    void refreshLists().catch(fail);
    const refresh = () => void refreshCapabilities();
    window.addEventListener("lightweaver-capabilities-changed", refresh);
    const pop = () => {
      const next = currentRoute();
      const previous = urlRef.current;
      void (async () => {
        const leaving = next.page !== routeRef.current.page || next.projectId !== projectRef.current;
        if (leaving && (await confirmLeave()) === "stay") {
          history.pushState(null, "", previous);
          return;
        }
        urlRef.current = routeUrl(next);
        setRoute(next);
      })();
    };
    addEventListener("popstate", pop);
    return () => {
      window.removeEventListener("lightweaver-capabilities-changed", refresh);
      removeEventListener("popstate", pop);
    };
  }, []);

  const commandRef = useRef({
    save: saveAll,
    navigate,
  });
  commandRef.current = { save: saveAll, navigate };
  useEffect(() => {
    const offCommands = onStudioCommand((command) => {
      if (command === "save") void commandRef.current.save();
      if (command === "settings") void commandRef.current.navigate("settings");
      if (command === "import") {
        const imported = new CustomEvent("lightweaver-import", { cancelable: true });
        window.dispatchEvent(imported);
        if (!imported.defaultPrevented) setNotice("先打开项目或素材库再导入");
      }
      if (command === "find") {
        const target = document.querySelector<HTMLElement>("[data-lw-find]");
        if (target) target.focus();
        else setFindOpen(true);
      }
    });
    const onKey = (event: KeyboardEvent) => {
      const command = shortcutCommand(event);
      if (!command) return;
      event.preventDefault();
      runCommand(command);
    };
    window.addEventListener("keydown", onKey);
    const offDesktop = desktop()?.onCommand?.(runCommand);
    return () => {
      offCommands();
      window.removeEventListener("keydown", onKey);
      offDesktop?.();
    };
  }, []);

  useEffect(() => {
    const id = route.projectId;
    const generation = ++epoch.current;
    activeAction.current = null;
    saveRetry.current = null;
    buildRetry.current = null;
    setBusy(false);
    const controller = new AbortController();
    projectRef.current = id;
    draftRef.current = null;
    baseRef.current = "";
    planDraftRef.current = null;
    draftSeq.current += 1;
    planSeq.current += 1;
    dirtyRef.current = false;
    planDirtyRef.current = false;
    recoveryDraft.current = null;
    setPlanDraft(null);
    setPlanDirty(false);
    setCtx(null);
    setDraft(null);
    setBase("");
    setDirty(false);
    setConflict(null);
    setActiveRun("");
    setRunDetail(null);
    setEvents([]);
    setPlan(null);
    setError("");
    setToasts((items) => items.filter((item) => item.scope === null));
    if (id) {
      clientRef.current.rememberProject(id);
      api(`/projects/${id}/context`, Context, { signal: controller.signal })
        .then((next) => {
          if (epoch.current !== generation) return;
          setCtx(next);
          setDraft(next.revision.document);
          draftRef.current = next.revision.document;
          setBase(next.revision.id);
          baseRef.current = next.revision.id;
          setLocale(next.revision.document.locales[0] || "zh");
          const nextPlan = next.revision.document.creativePlan || null;
          setPlanDraft(nextPlan);
          planDraftRef.current = nextPlan;
        })
        .catch((reason) => {
          if (!controller.signal.aborted) fail(reason);
        });
    }
    return () => controller.abort();
  }, [route.projectId]);

  useEffect(() => {
    if (!dirty && !planDirty) return;
    const timer = window.setTimeout(() => {
      const snap = snapshot();
      if (snap) void clientRef.current.upsertDraft(snap);
    }, 800);
    return () => window.clearTimeout(timer);
  }, [base, dirty, draft, planDirty, planDraft]);

  const quitCancelRef = useRef(() => {});
  quitCancelRef.current = () => {
    if (!quitAttempt.current) return;
    quitAttempt.current = null;
    answerLeave("cancel");
    setJobsOpen(false);
    jobsWait.current?.(false);
    jobsWait.current = null;
  };
  const quitRef = useRef<(intent: QuitIntent) => Promise<QuitDecision>>(async () => ({ action: "cancel", stopJobs: false }));
  quitRef.current = async (intent) => {
    if (leaveInProgress.current || quitAttempt.current) return { action: "cancel", stopJobs: false };
    const attempt = Symbol("quit");
    quitAttempt.current = attempt;
    try {
      if ((await confirmLeave(true)) === "stay" || quitAttempt.current !== attempt)
        return { action: "cancel", stopJobs: false };
      if (intent === "stop-jobs") return { action: "quit", stopJobs: true };
      let runs: z.infer<typeof RunRecord>[];
      try {
        runs = await api("/runs", z.array(RunRecord));
      } catch (reason) {
        fail(reason);
        return { action: "cancel", stopJobs: false };
      }
      if (quitAttempt.current !== attempt) return { action: "cancel", stopJobs: false };
      const active = runs.some((run) => run.state === "queued" || run.state === "running" || run.state === "cancelling");
      if (!active) return { action: "quit", stopJobs: false };
      const stop = await new Promise<boolean>((resolve) => {
        jobsWait.current = resolve;
        setJobsOpen(true);
      });
      return stop ? { action: "quit", stopJobs: true } : { action: "cancel", stopJobs: false };
    } finally {
      if (quitAttempt.current === attempt) quitAttempt.current = null;
    }
  };

  useEffect(() => {
    const bridge = desktop();
    if (!bridge?.onPrepareQuit) return;
    return bridge.onPrepareQuit((intent) => quitRef.current(intent), () => quitCancelRef.current());
  }, []);

  const recoveryFlushRef = useRef<() => Promise<void>>(async () => {});
  recoveryFlushRef.current = async () => {
    const draft = snapshot();
    if (draft) await desktop()?.saveRecoveryDraft?.(draft);
  };
  useEffect(() => {
    return desktop()?.onPrepareRecoveryFlush?.(() => recoveryFlushRef.current());
  }, []);

  const seenClientError = useRef("");
  useEffect(() => {
    if (!client.error) {
      seenClientError.current = "";
      return;
    }
    if (client.error === seenClientError.current) return;
    seenClientError.current = client.error;
    pushToast(client.error, "danger");
  }, [client.error]);

  const storedDraft = client.drafts.find((item) => item.projectId === route.projectId && item.projectId);

  return {
    route,
    navigate,
    projects,
    library,
    providers,
    defaultVlm,
    ctx,
    draft,
    base,
    dirty,
    planDraft,
    planDirty,
    error: error || client.error,
    toasts: toasts.filter((item) => item.scope === null || (item.scope.projectId === route.projectId && item.scope.generation === epoch.current)),
    dismissToast,
    conflict,
    busy,
    locale,
    setLocale,
    plan,
    activeRun,
    setActiveRun,
    activeRunError: activeStream.error,
    retryActiveRun: activeStream.retry,
    runDetail,
    events,
    leaveOpen,
    jobsOpen,
    findOpen,
    setFindOpen,
    answerLeave,
    answerJobs: (stop: boolean) => {
      setJobsOpen(false);
      jobsWait.current?.(stop);
      jobsWait.current = null;
    },
    clearError: () => {
      setError("");
      client.clearError();
    },
    setNotice,
    setError,
    handleError,
    refreshLists,
    refreshCapabilities,
    reload,
    act,
    edit,
    editCreativePlan,
    save,
    saveAll,
    saveAndBuild,
    applyCreativePlan,
    applyCaptionAssist,
    adoptAnalysisCaptions,
    submitJob,
    showPlan,
    applyProposal,
    searchCandidates,
    copyBrief,
    importCaption,
    addScene,
    beginAssetEditSession,
    acceptAssetImport,
    isSessionCurrent,
    stableRequest,
    rotateStableRequest,
    completeStableRequest,
    assetImportReceipt,
    rememberAssetImport,
    restoreDraft,
    loadServerKeepingDraft,
    currentBase: () => baseRef.current,
    clearStoredDraft: async () => {
      if (!storedDraft) return;
      await clearDraftThrough(storedDraft.projectId, storedDraft.updatedAt);
    },
    storedDraft: !dirty && !planDirty ? storedDraft : undefined,
    client,
  };
}

export type ProjectSession = ReturnType<typeof useProjectSession>;
