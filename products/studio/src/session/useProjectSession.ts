import { useEffect, useRef, useState } from "react";
import {
  CaptionTrack,
  CreativePlan,
  LibraryVersion,
  ProjectDocument,
  ProjectRevision,
  Proposal,
  ProviderDescriptor,
  RunRecord,
  Scene,
  refKey,
  z,
} from "@lightweaver/weaver/contracts";
import { api, ApiError, requestId } from "../api";
import type { ClientStore, DraftBackup } from "../client/state";
import { onStudioCommand, runCommand, shortcutCommand } from "../commands";
import { desktop, type QuitDecision } from "../desktop";
import { Context, type Context as ProjectContext } from "../domain/context";
import { RunDetail } from "../domain/run";
import { saveFate } from "../domain/save";
import { useRunStream } from "../jobs/useRunStream";
import type { ToastItem } from "../ui/ToastStack";
import { currentRoute, routeUrl } from "./route";

type LeaveChoice = "save" | "keep" | "discard" | "cancel";
type CreativePlanValue = z.infer<typeof CreativePlan>;

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
    setToasts((items) => [{ id: crypto.randomUUID(), message: text, tone }, ...items].slice(0, 4));
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
  const jobsWait = useRef<((stop: boolean) => void) | null>(null);
  const urlRef = useRef(routeUrl(route));

  const fail = (reason: unknown) => {
    setError(reason instanceof Error ? reason.message : String(reason));
    if (reason instanceof ApiError && reason.protocol.code === "REVISION_CONFLICT") {
      const details = reason.protocol.details;
      if (details && typeof details === "object" && "current" in details) {
        const parsed = ProjectRevision.safeParse(details.current);
        if (parsed.success) setConflict(parsed.data);
      }
    }
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

  const snapshot = (): DraftBackup | null => {
    const projectId = projectRef.current;
    const savedBase = baseRef.current;
    if (!projectId || !savedBase || (!dirtyRef.current && !planDirtyRef.current)) return null;
    return {
      projectId,
      base: savedBase,
      ...(dirtyRef.current && draftRef.current ? { document: draftRef.current } : {}),
      ...(planDirtyRef.current && planDraftRef.current ? { creativePlanDraft: planDraftRef.current } : {}),
      updatedAt: new Date().toISOString(),
    };
  };

  const reload = async (id = projectRef.current) => {
    if (!id) return;
    const generation = epoch.current;
    const seq = ++refreshSeq.current;
    const next = await api(`/projects/${id}/context`, Context);
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

  const act = async (fn: () => Promise<void>) => {
    const generation = epoch.current;
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (reason) {
      if (generation === epoch.current) fail(reason);
    } finally {
      if (generation === epoch.current) setBusy(false);
    }
  };

  const edit = (document: ProjectDocument) => {
    draftSeq.current += 1;
    draftRef.current = document;
    dirtyRef.current = true;
    setDraft(document);
    setDirty(true);
    setPlan(null);
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
    else setConflict(revision);
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

  const editCreativePlan = (next: CreativePlanValue) => {
    planSeq.current += 1;
    planDirtyRef.current = true;
    planDraftRef.current = next;
    setPlanDirty(true);
    setPlanDraft(next);
  };

  const save = () => {
    const document = draftRef.current;
    if (!document) return Promise.resolve();
    const seq = draftSeq.current;
    const generation = epoch.current;
    const id = document.id;
    const expectedRevision = baseRef.current;
    return act(async () => {
      const revision = await api(`/projects/${id}`, ProjectRevision, {
        method: "PUT",
        body: {
          expectedRevision,
          requestId: requestId(),
          document: ProjectDocument.parse(document),
        },
      });
      const fate = saveFate({
        requestProjectId: id,
        currentProjectId: projectRef.current,
        requestGeneration: generation,
        currentGeneration: epoch.current,
        requestDraftSeq: seq,
        currentDraftSeq: draftSeq.current,
      });
      if (fate === "ignore") return;
      if (fate === "accept") {
        acceptDraftRevision(revision);
        setNotice("修订已保存");
        await clientRef.current.clearProjectDraft(id);
      } else {
        setConflict(revision);
        setNotice("保存已写入服务器，但保存期间的新编辑仍保留为草稿");
      }
      await reload(id);
      await refreshLists();
    });
  };

  const saveCreativePlan = (candidate: CreativePlanValue) => {
    const generation = epoch.current;
    const id = projectRef.current;
    const draftSequence = draftSeq.current;
    const planSequence = planSeq.current;
    const expectedRevision = baseRef.current;
    return act(async () => {
      if (!draftRef.current) return;
      if (dirtyRef.current) throw new Error("先保存当前项目草稿，再保存创作方案");
      const revision = await api(`/projects/${id}/creative-plan`, ProjectRevision, {
        method: "PUT",
        body: { plan: CreativePlan.parse(candidate), expectedRevision, requestId: requestId() },
      });
      if (await acceptProjectRevision(revision, { id, generation, draftSequence, planSequence }))
        setNotice("创作方案已保存为项目蓝图");
    });
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

  const confirmLeave = async () => {
    if (!dirtyRef.current && !planDirtyRef.current) return "proceed" as const;
    const choice = await new Promise<LeaveChoice>((resolve) => {
      leaveWait.current = resolve;
      setLeaveOpen(true);
    });
    if (choice === "cancel") return "stay" as const;
    if (choice === "discard") {
      dirtyRef.current = false;
      planDirtyRef.current = false;
      setDirty(false);
      setPlanDirty(false);
      await clientRef.current.clearProjectDraft(projectRef.current);
      return "proceed" as const;
    }
    if (choice === "keep") {
      const snap = snapshot();
      if (snap) await clientRef.current.upsertDraft(snap);
      return "proceed" as const;
    }
    if (dirtyRef.current) await save();
    if (dirtyRef.current) return "stay" as const;
    if (planDirtyRef.current && planDraftRef.current) await saveCreativePlan(planDraftRef.current);
    if (planDirtyRef.current || dirtyRef.current) return "stay" as const;
    return "proceed" as const;
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
      if (document) {
        setBase(saved.base);
        baseRef.current = saved.base;
        edit(document);
        if (saved.base !== ctx.revision.id) setConflict(ctx.revision);
      }
      if (saved.creativePlanDraft !== undefined) {
        const nextPlan = saved.creativePlanDraft === null ? null : CreativePlan.parse(saved.creativePlanDraft);
        planSeq.current += 1;
        planDirtyRef.current = true;
        planDraftRef.current = nextPlan;
        setPlanDraft(nextPlan);
        setPlanDirty(true);
      }
      setNotice("已恢复为未保存草稿，请核对后保存修订");
    });

  const loadServerKeepingDraft = () => {
    if (!conflict) return;
    const snap = snapshot();
    if (snap) void clientRef.current.upsertDraft(snap);
    acceptDraftRevision(conflict);
    planDirtyRef.current = false;
    setPlanDirty(false);
    const nextPlan = conflict.document.creativePlan || null;
    setPlanDraft(nextPlan);
    planDraftRef.current = nextPlan;
  };

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

  useRunStream({
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
    api("/capabilities", z.object({ providers: z.array(ProviderDescriptor), defaultVlm: z.string() }))
      .then((capabilities) => {
        setProviders(capabilities.providers);
        setDefaultVlm(capabilities.defaultVlm);
      })
      .catch(fail);
    void refreshLists().catch(fail);
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
    return () => removeEventListener("popstate", pop);
  }, []);

  const commandRef = useRef({
    save,
    navigate,
  });
  commandRef.current = { save, navigate };
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
    const controller = new AbortController();
    projectRef.current = id;
    draftSeq.current += 1;
    planSeq.current += 1;
    dirtyRef.current = false;
    planDirtyRef.current = false;
    setPlanDraft(null);
    setPlanDirty(false);
    setCtx(null);
    setDraft(null);
    setDirty(false);
    setConflict(null);
    setActiveRun("");
    setRunDetail(null);
    setEvents([]);
    setPlan(null);
    setError("");
    setBusy(false);
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

  const quitRef = useRef<() => Promise<QuitDecision>>(async () => ({ action: "quit", stopJobs: false }));
  quitRef.current = async () => {
    if ((await confirmLeave()) === "stay") return { action: "cancel", stopJobs: false };
    const runs = await api("/runs", z.array(RunRecord)).catch(() => []);
    const active = runs.some((run) => run.state === "queued" || run.state === "running" || run.state === "cancelling");
    if (!active) return { action: "quit", stopJobs: false };
    const stop = await new Promise<boolean>((resolve) => {
      jobsWait.current = resolve;
      setJobsOpen(true);
    });
    return stop ? { action: "quit", stopJobs: true } : { action: "cancel", stopJobs: false };
  };

  useEffect(() => {
    const bridge = desktop();
    if (!bridge?.onPrepareQuit) return;
    return bridge.onPrepareQuit(() => quitRef.current());
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
    toasts,
    dismissToast,
    conflict,
    busy,
    locale,
    setLocale,
    plan,
    activeRun,
    setActiveRun,
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
    refreshLists,
    reload,
    act,
    edit,
    editCreativePlan,
    save,
    saveCreativePlan,
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
    restoreDraft,
    loadServerKeepingDraft,
    currentBase: () => baseRef.current,
    clearStoredDraft: () => void client.clearProjectDraft(route.projectId),
    storedDraft: !dirty && !planDirty ? storedDraft : undefined,
    client,
  };
}

export type ProjectSession = ReturnType<typeof useProjectSession>;
