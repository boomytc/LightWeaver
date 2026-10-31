import { useEffect, useRef, useState } from "react";
import {
  z,
  ProviderDescriptor,
  CaptionTrack,
  CreativePlan,
  Frames,
  ProjectRevision,
  ProjectDocument,
  Scene,
  MediaAssetVersion,
  LibraryVersion,
  Proposal,
  RunRecord,
  Delivery,
  AnalysisEntry,
  PROFILES,
  WORKFLOWS,
  speechOf,
  refKey,
  type Speech,
} from "@lightweaver/weaver/contracts";
import { api, ApiError, mediaUrl, requestId } from "./api";
import {
  CaptionAssistPanel,
  CaptionCueEditor,
  CreativePlanEditor,
  MaskEditor,
  RunDetail,
  SpeakerAssistPanel,
  SourceWindowPlayer,
  type SourceWindow,
  type SceneMask,
} from "./ReviewTools";

const Context = z.object({
  revision: ProjectRevision,
  assets: z.array(MediaAssetVersion),
  library: z.array(LibraryVersion),
  analysis: z.array(AnalysisEntry.extend({ state: z.string() })),
  proposals: z.array(Proposal),
  runs: z.array(RunRecord),
  deliveries: z.array(Delivery.extend({ state: z.string() })),
});
type Context = z.infer<typeof Context>;
type CreativePlanValue = z.infer<typeof CreativePlan>;
const labels: Record<string, string> = {
  landscape: "横屏 1920×1080",
  portrait: "竖屏 1080×1920",
  square: "方形 1080×1080",
  queued: "排队",
  running: "运行中",
  cancelling: "取消中",
  succeeded: "成功",
  failed: "失败",
  cancelled: "已取消",
  interrupted: "中断",
  partial: "部分成功",
  current: "当前",
  stale: "已过期",
  historical: "历史",
  missing: "缺失",
  card: "卡片",
  still: "静帧",
  clip: "视频片段",
};
function currentRoute() {
  const path = location.pathname.split("/").filter(Boolean);
  return {
    page: path[0] || "films",
    projectId: path[0] === "films" ? path[1] || "" : "",
  };
}
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
function Json({ value }: { value: unknown }) {
  return <pre>{JSON.stringify(value, null, 2)}</pre>;
}
function localeName(value: string) {
  return value === "zh"
    ? "中文"
    : value === "en"
      ? "英文"
      : value === "ja"
        ? "日文"
        : value === "ko"
          ? "韩文"
          : value;
}
function findMedia(
  assets: z.infer<typeof MediaAssetVersion>[],
  key: string,
) {
  return assets.find((asset) => refKey(asset) === key);
}
export function App() {
  const [route, setRoute] = useState(currentRoute),
    [projects, setProjects] = useState<z.infer<typeof ProjectRevision>[]>([]),
    [library, setLibrary] = useState<z.infer<typeof LibraryVersion>[]>([]);
  const [ctx, setCtx] = useState<Context | null>(null),
    [draft, setDraft] = useState<ProjectDocument | null>(null),
    [base, setBase] = useState(""),
    [dirty, setDirty] = useState(false),
    [tab, setTab] = useState("script");
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [conflict, setConflict] = useState<z.infer<typeof ProjectRevision> | null>(
      null,
    ),
    [backup, setBackup] = useState("");
  const [activeRun, setActiveRun] = useState(""),
    [runDetail, setRunDetail] = useState<z.infer<typeof RunDetail> | null>(
      null,
    ),
    [events, setEvents] = useState<unknown[]>([]);
  const [providers, setProviders] = useState<
      z.infer<typeof ProviderDescriptor>[]
    >([]),
    [vlmProvider, setVlmProvider] = useState("modelbest-vlm"),
    [captionSource, setCaptionSource] = useState(""),
    [analysisSource, setAnalysisSource] = useState("");
  const [query, setQuery] = useState(""),
    [mode, setMode] = useState("text"),
    [rerank, setRerank] = useState(false),
    [candidateRanges, setCandidateRanges] = useState<
      Record<string, SourceWindow>
    >({}),
    [allowReuse, setAllowReuse] = useState<Record<string, boolean>>({}),
    [planDraft, setPlanDraft] = useState<CreativePlanValue | null>(null),
    [planDirty, setPlanDirty] = useState(false),
    [plan, setPlan] = useState<unknown>(null),
    [busy, setBusy] = useState(false),
    [locale, setLocale] = useState("zh");
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const planDraftRef = useRef(planDraft);
  planDraftRef.current = planDraft;
  const draftSeq = useRef(0);
  const listSeq = useRef(0);
  const refreshSeq = useRef(0),
    epoch = useRef(0),
    dirtyRef = useRef(false),
    planDirtyRef = useRef(false),
    planSeq = useRef(0),
    projectRef = useRef(route.projectId);
  const refreshLists = async () => {
    const seq = ++listSeq.current;
    const [p, l] = await Promise.all([
      api("/projects", z.array(ProjectRevision)),
      api("/library", z.array(LibraryVersion)),
    ]);
    if (seq !== listSeq.current) return;
    setProjects(p);
    setLibrary(l);
  };
  const preserveDraftBeforeNavigation = () => {
    const currentDraft = draftRef.current,
      currentPlan = planDraftRef.current;
    if ((dirtyRef.current && currentDraft) || planDirtyRef.current)
      setBackup(
        JSON.stringify(
          {
            document: dirtyRef.current ? currentDraft : undefined,
            creativePlanDraft: planDirtyRef.current ? currentPlan : undefined,
          },
          null,
          2,
        ),
      );
  };
  useEffect(() => {
    api(
      "/capabilities",
      z.object({
        providers: z.array(ProviderDescriptor),
        defaultVlm: z.string(),
      }),
    )
      .then((c) => {
        setProviders(c.providers);
        setVlmProvider(c.defaultVlm);
      })
      .catch((e) => setError(String(e)));
    refreshLists().catch((e) => setError(String(e)));
    const pop = () => {
      preserveDraftBeforeNavigation();
      setRoute(currentRoute());
    };
    addEventListener("popstate", pop);
    return () => removeEventListener("popstate", pop);
  }, []);
  useEffect(() => {
    const id = route.projectId,
      generation = ++epoch.current,
      controller = new AbortController();
    projectRef.current = id;
    draftSeq.current++;
    planSeq.current++;
    dirtyRef.current = false;
    planDirtyRef.current = false;
    setCaptionSource("");
    setAnalysisSource("");
    setCandidateRanges({});
    setAllowReuse({});
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
    if (id)
      api(`/projects/${id}/context`, Context, { signal: controller.signal })
        .then((c) => {
          if (epoch.current !== generation) return;
          setCtx(c);
          setDraft(c.revision.document);
          setBase(c.revision.id);
          setLocale(c.revision.document.locales[0]);
          setAnalysisSource(
            c.assets.find((asset) => asset.kind === "video")?.assetId || "",
          );
          setPlanDraft(c.revision.document.creativePlan || null);
        })
        .catch((e) => {
          if (!controller.signal.aborted) setError(String(e));
        });
    return () => controller.abort();
  }, [route.projectId]);
  const navigate = (page: string, id = "") => {
    preserveDraftBeforeNavigation();
    history.pushState(null, "", `/${page}${id ? `/${id}` : ""}`);
    setRoute({ page, projectId: id });
  };
  const reload = async (id = projectRef.current) => {
    if (!id) return;
    const generation = epoch.current,
      seq = ++refreshSeq.current,
      c = await api(`/projects/${id}/context`, Context);
    if (
      id !== projectRef.current ||
      generation !== epoch.current ||
      seq !== refreshSeq.current
    )
      return;
    setCtx(c);
    if (!dirtyRef.current) {
      setDraft(c.revision.document);
      setBase(c.revision.id);
    }
    if (!planDirtyRef.current) {
      setPlanDraft(c.revision.document.creativePlan || null);
      setPlanDirty(false);
    }
  };
  const fail = (e: unknown) => {
    setError(e instanceof Error ? e.message : String(e));
    if (e instanceof ApiError && e.protocol.code === "REVISION_CONFLICT") {
      const details = e.protocol.details;
      if (details && typeof details === "object" && "current" in details) {
        const r = ProjectRevision.safeParse(details.current);
        if (r.success) setConflict(r.data);
      }
    }
  };
  const act = async (fn: () => Promise<void>) => {
    const generation = epoch.current;
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      if (generation === epoch.current) fail(e);
    } finally {
      if (generation === epoch.current) setBusy(false);
    }
  };
  const edit = (doc: ProjectDocument) => {
    draftSeq.current++;
    draftRef.current = doc;
    setDraft(doc);
    setDirty(true);
    dirtyRef.current = true;
    setPlan(null);
  };
  const acceptDraftRevision = (revision: z.infer<typeof ProjectRevision>) => {
    setCtx((current) =>
      current ? { ...current, revision } : current,
    );
    setBase(revision.id);
    setConflict(null);
    draftRef.current = revision.document;
    setDraft(revision.document);
    dirtyRef.current = false;
    setDirty(false);
  };
  const acceptProjectRevision = async (
    revision: z.infer<typeof ProjectRevision>,
    guard: {
      id: string;
      generation: number;
      draftSequence: number;
      planSequence?: number;
    },
  ) => {
    if (
      revision.projectId !== projectRef.current ||
      guard.id !== projectRef.current ||
      guard.generation !== epoch.current
    )
      return false;
    const draftAccepted = guard.draftSequence === draftSeq.current;
    const planAccepted =
      guard.planSequence === undefined ||
      guard.planSequence === planSeq.current;
    if (draftAccepted) acceptDraftRevision(revision);
    else setConflict(revision);
    if (guard.planSequence !== undefined && planAccepted) {
      planDirtyRef.current = false;
      setPlanDirty(false);
      setPlanDraft(revision.document.creativePlan || null);
    }
    await reload(revision.projectId);
    await refreshLists();
    return draftAccepted && planAccepted;
  };
  const editCreativePlan = (next: CreativePlanValue) => {
    planSeq.current++;
    planDirtyRef.current = true;
    planDraftRef.current = next;
    setPlanDirty(true);
    setPlanDraft(next);
  };
  const saveCreativePlan = (candidate: CreativePlanValue) =>
    act(async () => {
      if (!draft) return;
      if (dirtyRef.current)
        throw new Error("先保存当前项目草稿，再保存创作方案");
      const generation = epoch.current,
        id = projectRef.current,
        draftSequence = draftSeq.current,
        planSequence = planSeq.current,
        plan = CreativePlan.parse(candidate),
        revision = await api(
          `/projects/${id}/creative-plan`,
          ProjectRevision,
          {
            method: "PUT",
            body: {
              plan,
              expectedRevision: base,
              requestId: requestId(),
            },
          },
        );
      if (
        await acceptProjectRevision(revision, {
          id,
          generation,
          draftSequence,
          planSequence,
        })
      )
        setNotice("创作方案已保存为项目蓝图");
    });
  const applyCreativePlan = () =>
    act(async () => {
      if (!draft || !planDraft) return;
      if (dirtyRef.current || planDirtyRef.current)
        throw new Error("先保存项目草稿与创作方案，再应用方案");
      const generation = epoch.current,
        id = projectRef.current,
        draftSequence = draftSeq.current,
        revision = await api(
          `/projects/${id}/creative-plan/apply`,
          ProjectRevision,
          {
            method: "POST",
            body: {
              expectedRevision: base,
              requestId: requestId(),
            },
          },
        );
      if (
        await acceptProjectRevision(revision, {
          id,
          generation,
          draftSequence,
        })
      )
        setNotice("方案已应用到当前场景；之后可独立编辑，方案不会自动同步");
    });
  const applyCaptionAssist = (runId: string) =>
    act(async () => {
      if (!draft || dirtyRef.current)
        throw new Error("先保存当前项目草稿，再采用译文字幕");
      const generation = epoch.current,
        id = projectRef.current,
        draftSequence = draftSeq.current,
        revision = await api(
          `/projects/${id}/captions/assist/apply`,
          ProjectRevision,
          {
            method: "POST",
            body: {
              runId,
              expectedRevision: base,
              requestId: requestId(),
            },
          },
        );
      if (
        await acceptProjectRevision(revision, {
          id,
          generation,
          draftSequence,
        })
      )
        setNotice("译文字幕已显式采用到原字幕轨");
    });
  const applySpeakerAssist = (runId: string) =>
    act(async () => {
      if (!draft || dirtyRef.current)
        throw new Error("先保存当前项目草稿，再采用说话人分段");
      const generation = epoch.current,
        id = projectRef.current,
        draftSequence = draftSeq.current,
        revision = await api(
          `/projects/${id}/speakers/apply`,
          ProjectRevision,
          {
            method: "POST",
            body: {
              runId,
              expectedRevision: base,
              requestId: requestId(),
            },
          },
        );
      if (
        await acceptProjectRevision(revision, {
          id,
          generation,
          draftSequence,
        })
      )
        setNotice("临时说话人分段已显式采用；可在每个 cue 中手动改名");
    });
  const adoptAnalysisCaptions = (
    input: { sourceId?: string; runId?: string; locale?: string } = {},
  ) =>
    act(async () => {
      if (!draft || dirtyRef.current)
        throw new Error("先保存当前项目草稿，再从转写采用字幕");
      const generation = epoch.current,
        id = projectRef.current,
        draftSequence = draftSeq.current,
        targetLocale = input.locale || locale,
        revision = await api(
          `/projects/${id}/captions/from-analysis`,
          ProjectRevision,
          {
            method: "POST",
            body: {
              locale: targetLocale,
              ...(input.sourceId ? { sourceId: input.sourceId } : {}),
              ...(input.runId ? { runId: input.runId } : {}),
              expectedRevision: base,
              requestId: requestId(),
            },
          },
        );
      if (
        await acceptProjectRevision(revision, {
          id,
          generation,
          draftSequence,
        })
      )
        setNotice(`已采用 ${localeName(targetLocale)} 转写字幕`);
    });
  const save = () =>
    act(async () => {
      if (!draft) return;
      const seq = draftSeq.current,
        generation = epoch.current;
      const id = draft.id,
        rev = await api(`/projects/${id}`, ProjectRevision, {
          method: "PUT",
          body: {
            expectedRevision: base,
            requestId: requestId(),
            document: ProjectDocument.parse(draft),
          },
        });
      if (projectRef.current !== id || generation !== epoch.current) return;
      if (seq === draftSeq.current) {
        acceptDraftRevision(rev);
        setNotice("修订已保存");
      } else {
        setConflict(rev);
        setNotice("保存已写入服务器，但保存期间的新编辑仍保留为草稿");
      }
      await reload(id);
      await refreshLists();
    });
  const submitJob = async (path: string, body: unknown) => {
    const generation = epoch.current,
      id = projectRef.current,
      run = await api(path, RunRecord, { method: "POST", body });
    if (id === projectRef.current && generation === epoch.current) {
      setActiveRun(run.id);
      setTab("jobs");
      await reload(id);
    }
  };
  const showPlan = async (path: string, body: unknown) => {
    const generation = epoch.current,
      seq = draftSeq.current;
    const result = await api(path, z.unknown(), { method: "POST", body });
    if (generation === epoch.current && seq === draftSeq.current)
      setPlan(result);
  };
  useEffect(() => {
    if (!activeRun || !route.projectId) return;
    const id = route.projectId,
      run = activeRun,
      controller = new AbortController(),
      source = new EventSource(`/api/runs/${run}/events`);
    setEvents([]);
    const update = () =>
      api(`/runs/${run}`, RunDetail, { signal: controller.signal })
        .then((d) => {
          if (!controller.signal.aborted && projectRef.current === id) {
            setRunDetail(d);
            reload(id).catch(fail);
          }
        })
        .catch((e) => {
          if (
            !controller.signal.aborted &&
            projectRef.current === id
          )
            fail(e);
        });
    source.addEventListener("weaver", (event) => {
      if (controller.signal.aborted || projectRef.current !== id) return;
      const data: unknown = JSON.parse(event.data);
      setEvents((v) => [...v.slice(-99), data]);
      update();
    });
    update();
    return () => {
      controller.abort();
      source.close();
    };
  }, [activeRun, route.projectId]);
  const sceneUpdate = (index: number, scene: Scene) => {
    if (draft)
      edit({
        ...draft,
        scenes: draft.scenes.map((s, i) => (i === index ? scene : s)),
      });
  };
  const addScene = (kind: "card" | "still" | "clip") => {
    if (!draft || !ctx) return;
    const id = `scene-${crypto.randomUUID()}`,
      timing = { kind: "fixed", frames: 90 },
      image = ctx.assets.find((a) => a.kind === "image"),
      video = ctx.assets.find((a) => a.kind === "video");
    const raw =
      kind === "card"
        ? {
            id,
            kind,
            cardSpec: {
              template: "title",
              version: "2",
              copy: Object.fromEntries(
                draft.locales.map((l) => [l, { headline: "新卡片" }]),
              ),
            },
            timing,
          }
        : kind === "still" && image
          ? {
              id,
              kind,
              image: { assetId: image.assetId, version: image.version },
              framing: { fit: "contain" },
              timing,
            }
          : kind === "clip" && video
            ? {
                id,
                kind,
                source: { assetId: video.assetId, version: video.version },
                sourceRange: { startUs: 0, durationUs: 1000000 },
                framing: { fit: "contain" },
                playback: { kind: "source", audio: { kind: "original" } },
              }
            : null;
    if (!raw) {
      setError("先导入对应的图片或视频素材");
      return;
    }
    edit({ ...draft, scenes: [...draft.scenes, Scene.parse(raw)] });
  };
  const analysisAssets =
    ctx?.assets.filter(
      (asset) => asset.kind === "video" || asset.kind === "audio",
    ) || [];
  const asrReady = providers.some(
    (provider) =>
      provider.capabilities.includes("asr") && provider.ready,
  );
  const alignmentReady = providers.some(
    (provider) =>
      provider.capabilities.includes("alignment") && provider.ready,
  );
  const speakerReady = providers.some(
    (provider) =>
      provider.id === "moss-speakers" &&
      provider.capabilities.includes("diarization") &&
      provider.ready,
  );
  return (
    <div className="app">
      <header>
        <strong>LightWeaver</strong>
        <span>本地制作工作台</span>
        <nav>
          {[
            ["films", "片子"],
            ["methods", "方法"],
            ["voices", "音色"],
            ["library", "素材"],
          ].map(([page, label]) => (
            <button
              className={route.page === page ? "selected" : ""}
              key={page}
              onClick={() => navigate(page)}
            >
              {label}
            </button>
          ))}
        </nav>
      </header>
      {error && (
        <div role="alert" className="alert">
          <b>操作未完成：</b>
          {error}
          <button onClick={() => setError("")}>关闭</button>
        </div>
      )}
      {notice && (
        <div className="notice" onClick={() => setNotice("")}>
          {notice}
        </div>
      )}
      {backup && (
        <details className="alert">
          <summary>保留的未提交草稿</summary>
          <textarea readOnly value={backup} rows={12} />
          <button onClick={() => navigator.clipboard.writeText(backup)}>
            复制草稿
          </button>
        </details>
      )}
      {route.page !== "films" ? (
        <LibraryPanel
          key={route.page}
          kind={
            route.page === "voices"
              ? "voice"
              : route.page === "methods"
                ? "method"
                : "material"
          }
          library={library}
          providers={providers}
          refresh={refreshLists}
          fail={fail}
        />
      ) : (
        <div className="workspace">
          <aside>
            <div className="section-title">
              项目 <button onClick={() => navigate("films")}>＋</button>
            </div>
            {projects.map((p) => (
              <button
                className={
                  route.projectId === p.projectId
                    ? "project selected"
                    : "project"
                }
                key={p.projectId}
                onClick={() => navigate("films", p.projectId)}
              >
                <b>{p.document.title || "未命名项目"}</b>
                <small>
                  {WORKFLOWS.find((w) => w.id === p.document.workflow)?.name}
                </small>
              </button>
            ))}
          </aside>
          <main>
            {!route.projectId ? (
              <CreateProject
                onCreated={async (p) => {
                  await refreshLists();
                  navigate("films", p.projectId);
                }}
                fail={fail}
              />
            ) : !ctx || !draft ? (
              <p>加载项目…</p>
            ) : (
              <>
                <div className="project-head">
                  <div>
                    <h1>{draft.title || "未命名项目"}</h1>
                    <small>
                      {dirty ? "● 未保存草稿" : "当前修订"} ·{" "}
                      {base.slice(0, 16)}
                      {ctx.revision.id !== base && " · 服务器有新修订"}
                    </small>
                  </div>
                  <div className="actions">
                    <button
                      onClick={() =>
                        act(async () => {
                          const text = await api(
                            `/projects/${draft.id}/brief`,
                            z.string(),
                          );
                          await navigator.clipboard.writeText(text);
                          setNotice("已复制当前项目与修订给 agent");
                        })
                      }
                    >
                      复制给 agent
                    </button>
                    <button
                      onClick={() =>
                        act(() =>
                          showPlan(`/projects/${draft.id}/impact`, {
                            document: draft,
                          }),
                        )
                      }
                    >
                      查看影响
                    </button>
                    <button
                      className="primary"
                      disabled={busy || !dirty}
                      onClick={save}
                    >
                      保存修订
                    </button>
                  </div>
                </div>
                {conflict && (
                  <div className="alert">
                    <b>修订冲突，未覆盖服务器内容。</b>
                    <p>当前服务器修订 {conflict.id}；你的草稿已保留。</p>
                    <details>
                      <summary>对照服务器内容</summary>
                      <Json value={conflict.document} />
                    </details>
                    <button
                      onClick={() => {
                        setBackup(
                          JSON.stringify(
                            {
                              document: draft,
                              ...(planDirty
                                ? { creativePlanDraft: planDraft }
                                : {}),
                            },
                            null,
                            2,
                          ),
                        );
                        acceptDraftRevision(conflict);
                        planDirtyRef.current = false;
                        setPlanDirty(false);
                        setPlanDraft(conflict.document.creativePlan || null);
                      }}
                    >
                      保留草稿并加载当前修订
                    </button>
                  </div>
                )}
                <div className="tabs">
                  {[
                    ["assets", "素材与观察"],
                    ["script", "脚本与选段"],
                    ["creative", "创作方案"],
                    ["captions", "字幕"],
                    ["sound", "声音"],
                    ["output", "输出"],
                    ["jobs", "作业"],
                    ["review", "成片复盘"],
                  ].map(([key, name]) => (
                    <button
                      className={tab === key ? "selected" : ""}
                      key={key}
                      onClick={() => setTab(key)}
                    >
                      {name}
                    </button>
                  ))}
                </div>
                {plan !== null && (
                  <details open>
                    <summary>计划与影响</summary>
                    <Json value={plan} />
                  </details>
                )}
                {tab === "assets" && (
                  <>
                    <h2>受管素材</h2>
                    <input
                      aria-label="上传项目素材"
                      type="file"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (!file) return;
                        act(async () => {
                          const form = new FormData();
                          form.append("file", file);
                          form.append("expectedRevision", base);
                          form.append("requestId", requestId());
                          await api(
                            `/projects/${draft.id}/assets`,
                            z.unknown(),
                            { method: "POST", body: form },
                          );
                          await reload();
                        });
                      }}
                    />
                    <div className="grid">
                      {ctx.assets.map((a) => (
                        <article key={a.version}>
                          <b>{a.name}</b>
                          <small>
                            {a.kind} · {a.digest.slice(0, 12)}
                          </small>
                          {a.kind === "video" ? (
                            <video
                              controls
                              preload="metadata"
                              src={mediaUrl(a.digest)}
                            />
                          ) : a.kind === "image" ? (
                            <img src={mediaUrl(a.digest)} />
                          ) : a.kind === "audio" ? (
                            <audio controls src={mediaUrl(a.digest)} />
                          ) : (
                            <a href={mediaUrl(a.digest)}>读取文件</a>
                          )}
                        </article>
                      ))}
                    </div>
                    <Field label="可选方法">
                      <select
                        value={
                          draft.method
                            ? `${draft.method.itemId}@${draft.method.version}`
                            : ""
                        }
                        onChange={(e) => {
                          const v = library.find(
                            (v) =>
                              `${v.itemId}@${v.version}` === e.target.value,
                          );
                          edit({
                            ...draft,
                            method: v
                              ? { itemId: v.itemId, version: v.version }
                              : undefined,
                          });
                        }}
                      >
                        <option value="">不指定方法</option>
                        {library
                          .filter((v) => v.payload.kind === "method")
                          .map((v) => (
                            <option
                              key={v.itemId}
                              value={`${v.itemId}@${v.version}`}
                            >
                              {v.payload.name}
                            </option>
                          ))}
                      </select>
                    </Field>
                    <Field label="从素材库采用">
                      <select
                        defaultValue=""
                        disabled={dirty}
                        onChange={(e) => {
                          const v = library.find(
                            (v) => v.itemId === e.target.value,
                          );
                          e.target.value = "";
                          if (v)
                            act(async () => {
                              await api(
                                `/projects/${draft.id}/adopt`,
                                z.unknown(),
                                {
                                  method: "POST",
                                  body: {
                                    itemId: v.itemId,
                                    version: v.version,
                                    expectedRevision: base,
                                    requestId: requestId(),
                                  },
                                },
                              );
                              await reload();
                            });
                        }}
                      >
                        <option value="">选择可复用素材</option>
                        {library
                          .filter((v) => v.payload.kind === "material")
                          .map((v) => (
                            <option key={v.itemId} value={v.itemId}>
                              {v.payload.name}
                            </option>
                          ))}
                      </select>
                    </Field>
                    <div className="actions">
                      <Field label="分析源片或音轨">
                        <select
                          value={analysisSource}
                          onChange={(event) =>
                            setAnalysisSource(event.target.value)
                          }
                        >
                          <option value="">先选择源素材</option>
                          {analysisAssets.map((asset) => (
                            <option key={asset.version} value={asset.assetId}>
                              {asset.name}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <button
                        disabled={busy || !analysisSource || !asrReady}
                        onClick={() =>
                          act(() =>
                            submitJob(`/projects/${draft.id}/analyze`, {
                              kinds: ["asr"],
                              sourceId: analysisSource,
                              align: false,
                              locale,
                              requestId: requestId(),
                            }),
                          )
                        }
                      >
                        仅转写
                      </button>
                      <button
                        disabled={
                          busy || !analysisSource || !asrReady || !alignmentReady
                        }
                        onClick={() =>
                          act(() =>
                            submitJob(`/projects/${draft.id}/analyze`, {
                              kinds: ["asr"],
                              sourceId: analysisSource,
                              align: true,
                              locale,
                              requestId: requestId(),
                            }),
                          )
                        }
                      >
                        转写并精确对齐
                      </button>
                      <select
                        aria-label="画面观察模型"
                        value={vlmProvider}
                        onChange={(e) => setVlmProvider(e.target.value)}
                      >
                        {providers
                          .filter((p) => p.capabilities.includes("describe"))
                          .map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.model}
                              {p.ready ? "" : " · 未配置"}
                            </option>
                          ))}
                      </select>
                      <button
                        disabled={busy}
                        onClick={() =>
                          act(() =>
                            submitJob(`/projects/${draft.id}/analyze`, {
                              kinds: ["describe"],
                              ...(analysisSource
                                ? { sourceId: analysisSource }
                                : {}),
                              vlmProvider,
                              requestId: requestId(),
                            }),
                          )
                        }
                      >
                        观察画面
                      </button>
                    </div>
                    {(!analysisSource ||
                      !asrReady ||
                      !alignmentReady) && (
                      <small>
                        {!analysisSource
                          ? "先选择源素材。"
                          : !asrReady
                            ? "本地 ASR 尚未就绪。"
                            : "精确对齐模型尚未就绪，不会退回估算时间。"}
                      </small>
                    )}
                    <h2>源时间证据</h2>
                    {ctx.analysis.map((e) => (
                      <article key={e.id}>
                        <small>
                          {e.kind} · {(e.range.startUs / 1e6).toFixed(2)}–
                          {(
                            (e.range.startUs + e.range.durationUs) /
                            1e6
                          ).toFixed(2)}{" "}
                          秒 · {e.state} · {e.timingQuality}
                        </small>
                        <p>{e.text}</p>
                        {e.sourceText && e.sourceText !== e.text && (
                          <div className="source-copy">
                            <small>原始转写</small>
                            <p>{e.sourceText}</p>
                          </div>
                        )}
                        {e.kind === "asr" &&
                          e.state === "current" &&
                          e.timingQuality === "aligned" &&
                          (e.locale === undefined || e.locale === locale) && (
                            <button
                              disabled={busy || dirty}
                              onClick={() =>
                                adoptAnalysisCaptions({
                                  sourceId: e.source.assetId,
                                  locale,
                                })
                              }
                            >
                              采用为{localeName(locale)}字幕
                            </button>
                          )}
                      </article>
                    ))}
                  </>
                )}
                {tab === "script" && (
                  <>
                    <div className="actions">
                      <Field label="编辑语言">
                        <select
                          value={locale}
                          onChange={(e) => setLocale(e.target.value)}
                        >
                          {draft.locales.map((l) => (
                            <option key={l}>{l}</option>
                          ))}
                        </select>
                      </Field>
                      {(["card", "still", "clip"] as const).map((k) => (
                        <button key={k} onClick={() => addScene(k)}>
                          ＋{labels[k]}
                        </button>
                      ))}
                    </div>
                    {draft.scenes.map((s, i) => (
                      <article key={s.id}>
                        <div className="section-title">
                          <b>
                            {i + 1}. {labels[s.kind]} {s.label}
                          </b>
                          <div>
                            <button
                              disabled={i === 0}
                              onClick={() => {
                                const scenes = [...draft.scenes];
                                [scenes[i - 1], scenes[i]] = [
                                  scenes[i],
                                  scenes[i - 1],
                                ];
                                edit({ ...draft, scenes });
                              }}
                            >
                              上移
                            </button>
                            <button
                              onClick={() =>
                                edit({
                                  ...draft,
                                  scenes: draft.scenes.filter(
                                    (_, j) => j !== i,
                                  ),
                                })
                              }
                            >
                              删除
                            </button>
                          </div>
                        </div>
                        <SceneEditor
                          scene={s}
                          locale={locale}
                          assets={ctx.assets}
                          profile={draft.profiles[0]}
                          voices={[...library, ...ctx.library].filter(
                            (v, i, a) =>
                              v.payload.kind === "voice" &&
                              a.findIndex(
                                (x) =>
                                  x.itemId === v.itemId &&
                                  x.version === v.version,
                              ) === i,
                          )}
                          masks={draft.masks.filter(
                            (mask) => mask.sceneId === s.id,
                          )}
                          onMasksChange={(masks) =>
                            edit({
                              ...draft,
                              masks: [
                                ...draft.masks.filter(
                                  (mask) => mask.sceneId !== s.id,
                                ),
                                ...masks,
                              ],
                            })
                          }
                          onChange={(scene) => sceneUpdate(i, scene)}
                        />
                      </article>
                    ))}
                    <h2>候选查询</h2>
                    <div className="actions">
                      <input
                        placeholder="需要的画面或情节"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                      />
                      <select
                        value={mode}
                        onChange={(e) => {
                          setMode(e.target.value);
                          if (e.target.value !== "semantic") setRerank(false);
                        }}
                      >
                        <option value="text">文本检索</option>
                        <option value="semantic">语义检索（字幕与观察）</option>
                        <option value="visual">画面检索</option>
                      </select>
                      {mode === "semantic" && (
                        <label>
                          <input
                            type="checkbox"
                            checked={rerank}
                            disabled={
                              !providers.some(
                                (p) =>
                                  p.capabilities.includes("rerank") && p.ready,
                              )
                            }
                            onChange={(e) => setRerank(e.target.checked)}
                          />
                          候选重排
                        </label>
                      )}
                      <button
                        onClick={() =>
                          act(async () => {
                            const generation = epoch.current;
                            const r = await api(
                              `/projects/${draft.id}/search`,
                              z.union([Proposal, RunRecord]),
                              {
                                method: "POST",
                                body: {
                                  query,
                                  mode,
                                  rerank: mode === "semantic" && rerank,
                                  requestId: requestId(),
                                },
                              },
                            );
                            if (generation !== epoch.current) return;
                            if ("candidates" in r) await reload();
                            else {
                              setActiveRun(r.id);
                              setTab("jobs");
                            }
                          })
                        }
                      >
                        查询候选
                      </button>
                    </div>
                    <Field label="参考成片反向匹配">
                      <select
                        defaultValue=""
                        onChange={(e) => {
                          if (e.target.value)
                            act(() =>
                              submitJob(`/projects/${draft.id}/match`, {
                                editedId: e.target.value,
                                requestId: requestId(),
                              }),
                            );
                        }}
                      >
                        <option value="">选择参考成片，其他视频作为源片</option>
                        {ctx.assets
                          .filter((a) => a.kind === "video")
                          .map((a) => (
                            <option key={a.version} value={a.assetId}>
                              {a.name}
                            </option>
                          ))}
                      </select>
                    </Field>
                    {ctx.proposals.map((p) => {
                      const proposalStale = p.revision !== base;
                      return (
                        <details key={p.id}>
                          <summary>
                            {p.query} · {p.candidates.length} 个候选{" "}
                            {p.warnings.join("；")}
                            {proposalStale && " · 基于旧修订，仅可查看"}
                          </summary>
                          {proposalStale && (
                            <p className="hint">
                              此候选基于修订 {p.revision.slice(0, 16)}
                              ，当前修订是 {base.slice(0, 16)}
                              。重新查询后才能应用。
                            </p>
                          )}
                          {p.candidates.map((c) => {
                          const rangeKey = `${p.id}:${c.id}`;
                          const range = candidateRanges[rangeKey] || c.range;
                          const reuseKey = rangeKey;
                          const asset = findMedia(
                            ctx.assets,
                            refKey(c.source),
                          );
                          return (
                            <article key={c.id}>
                              <p>{c.evidence[0]}</p>
                              <small>
                                {(c.range.startUs / 1e6).toFixed(2)} 秒起 ·
                                文本 {c.scores.text.toFixed(2)} / 画面{" "}
                                {c.scores.visual.toFixed(2)} / 语义{" "}
                                {c.scores.semantic.toFixed(2)}
                                {c.scores.rerank !== undefined &&
                                  ` / 重排 ${c.scores.rerank.toFixed(2)}`}
                              </small>
                              <SourceWindowPlayer
                                sourceUrl={
                                  asset ? mediaUrl(asset.digest) : undefined
                                }
                                sourceKey={refKey(c.source)}
                                range={range}
                                bounds={c.range}
                                label={`候选 ${c.id}`}
                                editable
                                onRangeChange={(next) =>
                                  setCandidateRanges((current) => ({
                                    ...current,
                                    [rangeKey]: next,
                                  }))
                                }
                              />
                              <p>{c.limitations.join("；")}</p>
                              <label className="check">
                                <input
                                  type="checkbox"
                                  checked={!!allowReuse[reuseKey]}
                                  onChange={(event) =>
                                    setAllowReuse((current) => ({
                                      ...current,
                                      [reuseKey]: event.target.checked,
                                    }))
                                  }
                                />
                                允许与已有场景复用重叠源窗
                              </label>
                              <button
                                disabled={busy || dirty || proposalStale}
                                onClick={() =>
                                  act(async () => {
                                    const generation = epoch.current,
                                      id = projectRef.current,
                                      draftSequence = draftSeq.current,
                                      revision = await api(
                                        `/projects/${id}/proposal`,
                                        ProjectRevision,
                                        {
                                          method: "POST",
                                          body: {
                                            proposalId: p.id,
                                            selection: [c.id],
                                            ranges: { [c.id]: range },
                                            allowReuse: !!allowReuse[reuseKey],
                                            expectedRevision: base,
                                            requestId: requestId(),
                                          },
                                        },
                                      );
                                    if (
                                      await acceptProjectRevision(revision, {
                                        id,
                                        generation,
                                        draftSequence,
                                      })
                                    )
                                      setNotice("候选源窗已应用到场景");
                                  })
                                }
                              >
                                应用此源窗
                              </button>
                            </article>
                          );
                        })}
                        </details>
                      );
                    })}
                  </>
                )}
                {tab === "creative" && (
                  <CreativePlanEditor
                    plan={planDraft}
                    projectTitle={draft.title}
                    projectScenes={draft.scenes}
                    analysis={ctx.analysis}
                    projectDirty={dirty}
                    planDirty={planDirty}
                    busy={busy}
                    onChange={editCreativePlan}
                    onSave={saveCreativePlan}
                    onApply={applyCreativePlan}
                    renderSceneEditor={(scene, onChange) => (
                      <SceneEditor
                        scene={scene}
                        locale={locale}
                        assets={ctx.assets}
                        profile={draft.profiles[0]}
                        voices={[...library, ...ctx.library].filter(
                          (value, index, values) =>
                            value.payload.kind === "voice" &&
                            values.findIndex(
                              (candidate) =>
                                candidate.itemId === value.itemId &&
                                candidate.version === value.version,
                            ) === index,
                        )}
                        onChange={onChange}
                      />
                    )}
                  />
                )}
                {tab === "captions" && (
                  <>
                    <p>
                      人工字幕、语音对齐和估算字幕使用同一 cue
                      计划。编辑文本或时码会标为人工并清除逐词对齐；原始转写始终保留。
                    </p>
                    <div className="inline-fields">
                      <Field label="导入字幕 / 来源对照">
                        <select
                          value={captionSource}
                          onChange={(e) => setCaptionSource(e.target.value)}
                        >
                          <option value="">成片时间</option>
                          {ctx.assets
                            .filter(
                              (a) => a.kind === "video" || a.kind === "audio",
                            )
                            .map((a) => (
                              <option
                                key={a.version}
                                value={refKey(a)}
                              >
                                {a.kind === "audio" ? "音轨" : "源片"}：{a.name}
                              </option>
                            ))}
                        </select>
                      </Field>
                      <button
                        disabled={
                          busy ||
                          dirty ||
                          !ctx.analysis.some(
                            (entry) =>
                              entry.kind === "asr" &&
                              entry.state === "current" &&
                              (entry.locale === undefined ||
                                entry.locale === locale),
                          )
                        }
                        onClick={() =>
                          adoptAnalysisCaptions({
                            sourceId: captionSource
                              ? draft.assets.find(
                                  (asset) => refKey(asset) === captionSource,
                                )?.assetId
                              : undefined,
                            locale,
                          })
                        }
                      >
                        从转写采用为{localeName(locale)}
                      </button>
                    </div>
                    <SpeakerAssistPanel
                      projectId={draft.id}
                      sourceId={
                        draft.assets.find(
                          (asset) => refKey(asset) === captionSource,
                        )?.assetId || ""
                      }
                      locale={locale}
                      expectedRevision={base}
                      ready={speakerReady}
                      disabled={busy || dirty}
                      fail={fail}
                      onApply={applySpeakerAssist}
                    />
                    {draft.locales.map((l) => {
                      const track = draft.captions.find((t) => t.locale === l);
                      const updateTrack = (
                        next: z.infer<typeof CaptionTrack>,
                      ) =>
                        edit({
                          ...draft,
                          captions: [
                            ...draft.captions.filter((t) => t.locale !== l),
                            next,
                          ],
                        });
                      return (
                        <article key={l}>
                          <h2>
                            {localeName(l)}字幕
                            {track?.translationLocale
                              ? ` · ${localeName(track.translationLocale)}译文`
                              : ""}
                          </h2>
                          {track?.translationLocale && (
                            <p className="notice-inline">
                              这是 {localeName(l)} 字幕的{" "}
                              {localeName(track.translationLocale)}
                              译文。项目输出语言与音频没有被改写。
                            </p>
                          )}
                          <Field label="计时方式">
                            <select
                              value={track?.mode || "none"}
                              onChange={(e) => {
                                const next = {
                                  locale: l,
                                  translationLocale: track?.translationLocale,
                                  mode: z
                                    .enum([
                                      "none",
                                      "manual",
                                      "precise",
                                      "estimated",
                                    ])
                                    .parse(e.target.value),
                                  fps: track?.fps || draft.profiles[0].fps,
                                  style: track?.style || {
                                    font: "Noto Sans CJK SC",
                                    size: 48,
                                    color: "#FFFFFF",
                                    outline: 2,
                                    marginV: 80,
                                    maxChars: 24,
                                  },
                                  cues: track?.cues || [],
                                };
                                edit({
                                  ...draft,
                                  captions: [
                                    ...draft.captions.filter(
                                      (t) => t.locale !== l,
                                    ),
                                    next,
                                  ],
                                });
                              }}
                            >
                              <option value="none">无字幕</option>
                              <option value="manual">
                                人工 cue / 导入 SRT
                              </option>
                              <option value="precise">实际语音对齐</option>
                              <option value="estimated">显式估算</option>
                            </select>
                          </Field>
                          <input
                            aria-label={`导入 ${l} SRT`}
                            type="file"
                            accept=".srt,.vtt"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              act(async () => {
                                const generation = epoch.current,
                                  seq = draftSeq.current;
                                const body = await file.text();
                                const t = await api(
                                  "/captions/parse",
                                  CaptionTrack,
                                  {
                                    method: "POST",
                                    body: {
                                      body,
                                      locale: l,
                                      source: draft.assets.find(
                                        (asset) =>
                                          refKey(asset) === captionSource,
                                      ),
                                      fps: draft.profiles[0].fps,
                                    },
                                  },
                                );
                                if (
                                  generation !== epoch.current ||
                                  projectRef.current !== draft.id
                                )
                                  return;
                                if (seq !== draftSeq.current)
                                  throw new Error(
                                    "导入期间草稿已编辑，请重新导入字幕",
                                  );
                                const currentDraft = draftRef.current;
                                if (!currentDraft) return;
                                const parsed = ProjectDocument.parse({
                                  ...currentDraft,
                                  captions: [
                                    ...currentDraft.captions.filter(
                                      (t) => t.locale !== l,
                                    ),
                                    t,
                                  ],
                                });
                                edit(parsed);
                              });
                            }}
                          />
                          {track && (
                            <>
                              <div className="actions">
                                <Field label="字体">
                                  <input
                                    value={track.style.font}
                                    onChange={(e) =>
                                      updateTrack({
                                        ...track,
                                        style: {
                                          ...track.style,
                                          font: e.target.value,
                                        },
                                      })
                                    }
                                  />
                                </Field>
                                <Field label="字号">
                                  <input
                                    type="number"
                                    value={track.style.size}
                                    onChange={(e) =>
                                      updateTrack({
                                        ...track,
                                        style: {
                                          ...track.style,
                                          size: Number(e.target.value),
                                        },
                                      })
                                    }
                                  />
                                </Field>
                                <Field label="底部安全区">
                                  <input
                                    type="number"
                                    value={track.style.marginV}
                                    onChange={(e) =>
                                      updateTrack({
                                        ...track,
                                        style: {
                                          ...track.style,
                                          marginV: Number(e.target.value),
                                        },
                                      })
                                    }
                                  />
                                </Field>
                              </div>
                              <CaptionAssistPanel
                                projectId={draft.id}
                                sourceLocale={l}
                                expectedRevision={base}
                                disabled={busy || dirty}
                                fail={fail}
                                onApply={applyCaptionAssist}
                              />
                              {track.cues.map((cue, index) => (
                                <CaptionCueEditor
                                  key={cue.id}
                                  cue={cue}
                                  track={track}
                                  draft={draft}
                                  assets={ctx.assets}
                                  locale={l}
                                  selectedSource={captionSource}
                                  onChange={(next) =>
                                    updateTrack({
                                      ...track,
                                      cues: track.cues.map((current, currentIndex) =>
                                        currentIndex === index ? next : current,
                                      ),
                                    })
                                  }
                                />
                              ))}
                            </>
                          )}
                        </article>
                      );
                    })}
                  </>
                )}
                {tab === "sound" && (
                  <>
                    <h2>场景声音</h2>
                    <p>
                      原声场景无需音色。旁白或混音在“脚本与选段”中选择精确声音版本，也可使用上传的旁白音频。
                    </p>
                    <BgmEditor draft={draft} assets={ctx.assets} edit={edit} />
                  </>
                )}
                {tab === "output" && (
                  <>
                    <Field label="片名">
                      <input
                        value={draft.title}
                        onChange={(e) =>
                          edit({ ...draft, title: e.target.value })
                        }
                      />
                    </Field>
                    <div className="actions">
                      {["zh", "en"].map((l) => (
                        <label key={l}>
                          <input
                            type="checkbox"
                            checked={draft.locales.includes(l)}
                            onChange={(e) =>
                              edit({
                                ...draft,
                                locales: e.target.checked
                                  ? [...draft.locales, l]
                                  : draft.locales.filter((x) => x !== l),
                              })
                            }
                          />
                          {l === "zh" ? "中文" : "英文"}
                        </label>
                      ))}
                    </div>
                    <h2>交付规格</h2>
                    {Object.values(PROFILES).map((p) => (
                      <label className="check" key={p.id}>
                        <input
                          type="checkbox"
                          checked={draft.profiles.some((x) => x.id === p.id)}
                          onChange={(e) =>
                            edit({
                              ...draft,
                              profiles: e.target.checked
                                ? [...draft.profiles, p]
                                : draft.profiles.filter((x) => x.id !== p.id),
                            })
                          }
                        />
                        {labels[p.id]}
                      </label>
                    ))}
                    {draft.profiles.map((p, i) => (
                      <article key={p.id}>
                        <h3>{labels[p.id] || p.id}</h3>
                        <div className="actions">
                          <Field label="帧率">
                            <input
                              type="number"
                              value={p.fps.num / p.fps.den}
                              onChange={(e) =>
                                edit({
                                  ...draft,
                                  profiles: draft.profiles.map((x, j) =>
                                    j === i
                                      ? {
                                          ...x,
                                          fps: {
                                            num: Math.round(
                                              Number(e.target.value) * 1000,
                                            ),
                                            den: 1000,
                                          },
                                        }
                                      : x,
                                  ),
                                })
                              }
                            />
                          </Field>
                          <Field label="字幕">
                            <select
                              value={p.subtitles}
                              onChange={(e) =>
                                edit({
                                  ...draft,
                                  profiles: draft.profiles.map((x, j) =>
                                    j === i
                                      ? {
                                          ...x,
                                          subtitles: z
                                            .enum([
                                              "sidecar",
                                              "burn",
                                              "both",
                                              "none",
                                            ])
                                            .parse(e.target.value),
                                        }
                                      : x,
                                  ),
                                })
                              }
                            >
                              <option value="both">烧录与外挂</option>
                              <option value="sidecar">外挂</option>
                              <option value="burn">烧录</option>
                              <option value="none">无</option>
                            </select>
                          </Field>
                          <Field label="目标 LUFS">
                            <input
                              type="number"
                              value={p.loudness.integratedLufs}
                              onChange={(e) =>
                                edit({
                                  ...draft,
                                  profiles: draft.profiles.map((x, j) =>
                                    j === i
                                      ? {
                                          ...x,
                                          loudness: {
                                            ...x.loudness,
                                            integratedLufs: Number(
                                              e.target.value,
                                            ),
                                          },
                                        }
                                      : x,
                                  ),
                                })
                              }
                            />
                          </Field>
                          <Field label="True peak dB">
                            <input
                              type="number"
                              value={p.loudness.truePeakDb}
                              onChange={(e) =>
                                edit({
                                  ...draft,
                                  profiles: draft.profiles.map((x, j) =>
                                    j === i
                                      ? {
                                          ...x,
                                          loudness: {
                                            ...x.loudness,
                                            truePeakDb: Number(e.target.value),
                                          },
                                        }
                                      : x,
                                  ),
                                })
                              }
                            />
                          </Field>
                        </div>
                      </article>
                    ))}
                    <div className="actions">
                      <button
                        disabled={dirty}
                        onClick={() =>
                          act(() =>
                            showPlan(`/projects/${draft.id}/plan`, {
                              requestId: requestId(),
                            }),
                          )
                        }
                      >
                        检查制作计划
                      </button>
                      <button
                        className="primary"
                        disabled={dirty || busy}
                        onClick={() =>
                          act(() =>
                            submitJob(`/projects/${draft.id}/build`, {
                              requestId: requestId(),
                            }),
                          )
                        }
                      >
                        开始制作
                      </button>
                    </div>
                    {dirty && <small>先保存修订，再提交制作。</small>}
                  </>
                )}
                {tab === "jobs" && (
                  <>
                    <h2>作业与恢复</h2>
                    {ctx.runs.map((r) => (
                      <article key={r.id}>
                        <div className="section-title">
                          <button onClick={() => setActiveRun(r.id)}>
                            {r.kind} · {labels[r.state]}
                          </button>
                          <div>
                            <button
                              disabled={
                                !["queued", "running", "cancelling"].includes(
                                  r.state,
                                )
                              }
                              onClick={() =>
                                act(async () => {
                                  await api(`/runs/${r.id}/cancel`, RunRecord, {
                                    method: "POST",
                                    body: {},
                                  });
                                  await reload();
                                })
                              }
                            >
                              取消
                            </button>
                            <button
                              disabled={
                                ![
                                  "failed",
                                  "partial",
                                  "cancelled",
                                  "interrupted",
                                ].includes(r.state)
                              }
                              onClick={() =>
                                act(async () => {
                                  await api(`/runs/${r.id}/resume`, RunRecord, {
                                    method: "POST",
                                    body: {},
                                  });
                                  setActiveRun(r.id);
                                  await reload();
                                })
                              }
                            >
                              恢复未完成步骤
                            </button>
                            {r.kind === "analyze" &&
                              r.state === "succeeded" && (
                                <button
                                  disabled={busy || dirty}
                                  onClick={() =>
                                    adoptAnalysisCaptions({
                                      runId: r.id,
                                      locale,
                                    })
                                  }
                                >
                                  采用此次分析结果为{localeName(locale)}字幕
                                </button>
                              )}
                          </div>
                        </div>
                        <small>{r.id}</small>
                        {r.error && <p className="error">{r.error.message}</p>}
                      </article>
                    ))}
                    {runDetail && <Json value={runDetail} />}
                    <details>
                      <summary>事件（自动断线重连）</summary>
                      <Json value={events} />
                    </details>
                  </>
                )}
                {tab === "review" && (
                  <>
                    <h2>交付与历史</h2>
                    {ctx.deliveries.length === 0 && (
                      <p>尚未有通过验证的交付。</p>
                    )}
                    {ctx.deliveries.map((d) => (
                      <article key={d.id}>
                        <h3>
                          {d.target}{" "}
                          <span className="badge">{labels[d.state]}</span>
                        </h3>
                        <small>
                          制作修订 {d.revisionId} · {d.createdAt}
                        </small>
                        <video controls src={mediaUrl(d.artifacts.video)} />
                        <div className="actions">
                          {["srt", "ass", "manifest", "receipt", "audio"]
                            .filter((k) => d.artifacts[k])
                            .map((k) => (
                              <a
                                key={k}
                                href={mediaUrl(d.artifacts[k])}
                                target="_blank"
                              >
                                {k}
                              </a>
                            ))}
                        </div>
                        <p>
                          按场景定位：
                          {draft.scenes.map((s, i) => (
                            <button
                              key={s.id}
                              onClick={() =>
                                act(async () => {
                                  const m = await api(
                                    `/artifacts/${d.timelineDigest}`,
                                    z.object({
                                      visuals: z.array(
                                        z.object({
                                          sceneId: z.string(),
                                          startFrame: z.number(),
                                        }),
                                      ),
                                      output: z.object({
                                        fps: z.object({
                                          num: z.number(),
                                          den: z.number(),
                                        }),
                                      }),
                                    }),
                                  );
                                  const v = m.visuals.find(
                                    (v) => v.sceneId === s.id,
                                  );
                                  const video =
                                    document.querySelector<HTMLVideoElement>(
                                      `video[src="${mediaUrl(d.artifacts.video)}"]`,
                                    );
                                  if (v && video) {
                                    video.currentTime =
                                      (v.startFrame * m.output.fps.den) /
                                      m.output.fps.num;
                                    await video.play();
                                  }
                                })
                              }
                            >
                              {i + 1}
                            </button>
                          ))}
                        </p>
                      </article>
                    ))}
                  </>
                )}
              </>
            )}
          </main>
        </div>
      )}
    </div>
  );
}

function CreateProject({
  onCreated,
  fail,
}: {
  onCreated: (p: z.infer<typeof ProjectRevision>) => Promise<void>;
  fail: (e: unknown) => void;
}) {
  const [title, setTitle] = useState(""),
    [workflow, setWorkflow] = useState("study-explainer");
  return (
    <section className="empty">
      <h1>开始一部片子</h1>
      <p>素材、观察、创作与制作结果保存在同一个项目里。</p>
      <Field label="片名">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="输入片名"
        />
      </Field>
      <Field label="工作流预设">
        <select value={workflow} onChange={(e) => setWorkflow(e.target.value)}>
          {WORKFLOWS.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
      </Field>
      <p>{WORKFLOWS.find((w) => w.id === workflow)?.guidance}</p>
      <button
        className="primary"
        onClick={() =>
          api("/projects", ProjectRevision, {
            method: "POST",
            body: { title, workflow, requestId: requestId() },
          })
            .then(onCreated)
            .catch(fail)
        }
      >
        创建草稿
      </button>
    </section>
  );
}
function SceneEditor({
  scene: s,
  locale,
  assets,
  profile,
  voices,
  masks = [],
  onMasksChange,
  onChange,
}: {
  scene: Scene;
  locale: string;
  assets: z.infer<typeof MediaAssetVersion>[];
  profile: ProjectDocument["profiles"][number];
  voices: z.infer<typeof LibraryVersion>[];
  masks?: SceneMask[];
  onMasksChange?: (masks: SceneMask[]) => void;
  onChange: (s: Scene) => void;
}) {
  const speech = speechOf(s),
    [localError, setLocalError] = useState("");
  const patch = (value: unknown) => {
    const r = Scene.safeParse(value);
    if (r.success) {
      setLocalError("");
      onChange(r.data);
    } else setLocalError(r.error.issues[0]?.message || "字段无效");
  };
  const speechChange = (next: Speech | undefined) => {
    if (s.kind !== "clip")
      onChange({
        ...s,
        timing:
          s.timing.kind === "fixed"
            ? { ...s.timing, speech: next }
            : next
              ? { ...s.timing, speech: next }
              : { kind: "fixed", frames: Frames.parse(90) },
      });
    else if (next) {
      const audio =
        s.playback.audio.kind === "mix"
          ? { ...s.playback.audio, speech: next }
          : { kind: "narration" as const, speech: next, gainDb: 0 };
      onChange({
        ...s,
        playback:
          s.playback.kind === "speech"
            ? { ...s.playback, audio }
            : { kind: "source", audio },
      });
    } else
      onChange({
        ...s,
        playback: { kind: "source", audio: { kind: "silent" } },
      });
  };
  const newSpeech = (): Speech => ({
    kind: "authored",
    text: { [locale]: "" },
    voice: voices[0]
      ? { [locale]: { itemId: voices[0].itemId, version: voices[0].version } }
      : {},
  });
  const selectAsset = (value: string) =>
    assets.find((a) => refKey(a) === value);
  const selectedAsset =
    s.kind === "card"
      ? undefined
      : selectAsset(refKey(s.kind === "clip" ? s.source : s.image));
  return (
    <>
      {localError && <p className="error">{localError}</p>}
      {s.kind === "card" ? (
        <>
          <Field label="卡片样式">
            <select
              value={s.cardSpec.template}
              onChange={(e) =>
                onChange({
                  ...s,
                  cardSpec: {
                    ...s.cardSpec,
                    template: z
                      .enum(["title", "points", "close"])
                      .parse(e.target.value),
                  },
                })
              }
            >
              <option value="title">标题</option>
              <option value="points">要点</option>
              <option value="close">收束</option>
            </select>
          </Field>
          <Field label="标题">
            <input
              value={s.cardSpec.copy[locale]?.headline || ""}
              onChange={(e) =>
                onChange({
                  ...s,
                  cardSpec: {
                    ...s.cardSpec,
                    copy: {
                      ...s.cardSpec.copy,
                      [locale]: {
                        ...(s.cardSpec.copy[locale] || {
                          kicker: "",
                          lede: "",
                          points: [],
                          tags: [],
                          headline: "",
                        }),
                        headline: e.target.value,
                      },
                    },
                  },
                })
              }
            />
          </Field>
          <Field label="要点（每行一条，左右对照用 ||）">
            <textarea
              value={s.cardSpec.copy[locale]?.points.join("\n") || ""}
              onChange={(e) =>
                onChange({
                  ...s,
                  cardSpec: {
                    ...s.cardSpec,
                    copy: {
                      ...s.cardSpec.copy,
                      [locale]: {
                        ...(s.cardSpec.copy[locale] || {
                          kicker: "",
                          lede: "",
                          points: [],
                          tags: [],
                          headline: "",
                        }),
                        points: e.target.value.split("\n"),
                      },
                    },
                  },
                })
              }
            />
          </Field>
        </>
      ) : (
        <>
          <Field label={s.kind === "clip" ? "源片" : "图片"}>
            <select
              value={refKey(s.kind === "clip" ? s.source : s.image)}
              onChange={(e) => {
                const a = selectAsset(e.target.value);
                if (!a) return;
                const ref = { assetId: a.assetId, version: a.version };
                onChange(
                  s.kind === "clip"
                    ? { ...s, source: ref }
                    : { ...s, image: ref },
                );
              }}
            >
              {assets
                .filter(
                  (a) => a.kind === (s.kind === "clip" ? "video" : "image"),
                )
                .map((a) => (
                  <option value={refKey(a)} key={a.version}>
                    {a.name}
                  </option>
                ))}
            </select>
          </Field>
          {s.kind === "clip" && (
            <SourceWindowPlayer
              sourceUrl={
                selectedAsset ? mediaUrl(selectedAsset.digest) : undefined
              }
              sourceKey={refKey(s.source)}
              range={s.sourceRange}
              label="当前片段源窗"
            />
          )}
          {s.kind === "still" && selectedAsset && (
            <div className="scene-preview">
              <img
                className="scene-still"
                src={mediaUrl(selectedAsset.digest)}
                alt="当前静帧"
              />
            </div>
          )}
          <div className="actions">
            <Field label="画面适配">
              <select
                value={s.framing.fit}
                onChange={(e) =>
                  onChange({
                    ...s,
                    framing: {
                      ...s.framing,
                      fit: z.enum(["contain", "cover"]).parse(e.target.value),
                    },
                  })
                }
              >
                <option value="contain">完整显示</option>
                <option value="cover">填满画幅</option>
              </select>
            </Field>
            {s.kind === "clip" && (
              <>
                <Field label="源入点（秒）">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={s.sourceRange.startUs / 1e6}
                    onChange={(e) =>
                      patch({
                        ...s,
                        sourceRange: {
                          ...s.sourceRange,
                          startUs: Math.round(Number(e.target.value) * 1e6),
                        },
                      })
                    }
                  />
                </Field>
                <Field label="源窗时长（秒）">
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={s.sourceRange.durationUs / 1e6}
                    onChange={(e) =>
                      patch({
                        ...s,
                        sourceRange: {
                          ...s.sourceRange,
                          durationUs: Math.round(Number(e.target.value) * 1e6),
                        },
                      })
                    }
                  />
                </Field>
              </>
            )}
          </div>
        </>
      )}
      {s.kind === "clip" && (
        <Field label="声音策略">
          <select
            value={s.playback.audio.kind}
            onChange={(e) => {
              const kind = e.target.value;
              if (kind === "silent" || kind === "original")
                onChange({
                  ...s,
                  playback: {
                    kind: "source",
                    audio: kind === "silent" ? { kind } : { kind, gainDb: 0 },
                  },
                });
              else {
                const sp = speech || newSpeech();
                const audio =
                  kind === "mix"
                    ? {
                        kind: "mix" as const,
                        speech: sp,
                        gainDb: 0,
                        sourceGainDb: -12,
                        ducking: true,
                      }
                    : { kind: "narration" as const, speech: sp, gainDb: 0 };
                onChange({
                  ...s,
                  playback:
                    s.playback.kind === "speech"
                      ? { ...s.playback, audio }
                      : { kind: "source", audio },
                });
              }
            }}
          >
            <option value="silent">静音</option>
            <option value="original">保留原声</option>
            <option value="narration">旁白</option>
            <option value="mix">旁白与原声混音</option>
          </select>
        </Field>
      )}
      {s.kind !== "clip" && (
        <label className="check">
          <input
            type="checkbox"
            checked={!!speech}
            onChange={(e) =>
              speechChange(e.target.checked ? newSpeech() : undefined)
            }
          />
          添加旁白
        </label>
      )}
      {speech && (
        <>
          <Field label="旁白来源">
            <select
              value={speech.kind}
              onChange={(e) => {
                const a = assets.find((a) => a.kind === "audio");
                speechChange(
                  e.target.value === "authored"
                    ? newSpeech()
                    : {
                        kind: "imported",
                        text: {},
                        audio: a
                          ? {
                              [locale]: {
                                assetId: a.assetId,
                                version: a.version,
                              },
                            }
                          : {},
                      },
                );
              }}
            >
              <option value="authored">文案与音色</option>
              <option value="imported">已上传音频</option>
            </select>
          </Field>
          {speech.kind === "authored" ? (
            <>
              <Field label="旁白文案">
                <textarea
                  value={speech.text[locale] || ""}
                  onChange={(e) =>
                    speechChange({
                      ...speech,
                      text: { ...speech.text, [locale]: e.target.value },
                    })
                  }
                />
              </Field>
              <Field label="精确音色版本">
                <select
                  value={
                    speech.voice[locale]
                      ? `${speech.voice[locale].itemId}@${speech.voice[locale].version}`
                      : ""
                  }
                  onChange={(e) => {
                    const v = voices.find(
                      (v) => `${v.itemId}@${v.version}` === e.target.value,
                    );
                    if (v)
                      speechChange({
                        ...speech,
                        voice: {
                          ...speech.voice,
                          [locale]: { itemId: v.itemId, version: v.version },
                        },
                      });
                  }}
                >
                  <option value="">选择音色</option>
                  {voices.map((v) => (
                    <option
                      key={`${v.itemId}@${v.version}`}
                      value={`${v.itemId}@${v.version}`}
                    >
                      {v.payload.name} · {v.version.slice(0, 8)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={`场景语气（可选，${localeName(locale)}）`}>
                <textarea
                  value={speech.style?.[locale] || ""}
                  placeholder="例如：克制、略带迟疑；留空时沿用音色版本默认语气"
                  onChange={(event) => {
                    const style = {
                      ...(speech.style || {}),
                      [locale]: event.target.value,
                    };
                    if (!event.target.value.trim()) delete style[locale];
                    speechChange({
                      ...speech,
                      style: Object.keys(style).length ? style : undefined,
                    });
                  }}
                />
              </Field>
            </>
          ) : (
            <Field label="旁白音频">
              <select
                value={speech.audio[locale] ? refKey(speech.audio[locale]) : ""}
                onChange={(e) => {
                  const a = selectAsset(e.target.value);
                  if (a)
                    speechChange({
                      ...speech,
                      audio: {
                        ...speech.audio,
                        [locale]: { assetId: a.assetId, version: a.version },
                      },
                    });
                }}
              >
                <option value="">选择音频</option>
                {assets
                  .filter((a) => a.kind === "audio")
                  .map((a) => (
                    <option key={a.version} value={refKey(a)}>
                      {a.name}
                    </option>
                  ))}
              </select>
            </Field>
          )}
        </>
      )}
      {s.kind !== "clip" ? (
        <div className="actions">
          <Field label="时长策略">
            <select
              value={s.timing.kind}
              onChange={(e) => {
                if (e.target.value === "speech" && speech)
                  patch({
                    ...s,
                    timing: { kind: "speech", speech, tailFrames: 8 },
                  });
                else
                  patch({
                    ...s,
                    timing: { kind: "fixed", frames: 90, speech },
                  });
              }}
            >
              <option value="fixed">固定帧长</option>
              {speech && <option value="speech">真实旁白加尾帧</option>}
            </select>
          </Field>
          <Field label={s.timing.kind === "fixed" ? "帧数" : "尾帧数"}>
            <input
              type="number"
              min="0"
              value={
                s.timing.kind === "fixed"
                  ? s.timing.frames
                  : s.timing.tailFrames
              }
              onChange={(e) =>
                patch({
                  ...s,
                  timing: {
                    ...s.timing,
                    [s.timing.kind === "fixed" ? "frames" : "tailFrames"]:
                      Number(e.target.value),
                  },
                })
              }
            />
          </Field>
        </div>
      ) : (
        <>
          <Field label="画面时长">
            <select
              value={s.playback.kind}
              onChange={(e) => {
                const audio = s.playback.audio;
                if (
                  e.target.value === "speech" &&
                  (audio.kind === "narration" || audio.kind === "mix")
                )
                  patch({
                    ...s,
                    playback: {
                      kind: "speech",
                      audio,
                      tailFrames: 0,
                      overflow: { kind: "reject" },
                    },
                  });
                else patch({ ...s, playback: { kind: "source", audio } });
              }}
            >
              <option value="source">由选定源窗决定</option>
              {speech && <option value="speech">由真实旁白决定</option>}
            </select>
          </Field>
          {s.playback.kind === "speech" && (
            <div className="actions">
              <Field label="旁白超窗处理">
                <select
                  value={s.playback.overflow.kind}
                  onChange={(e) =>
                    patch({
                      ...s,
                      playback: {
                        ...s.playback,
                        overflow:
                          e.target.value === "freeze"
                            ? { kind: "freeze", maxFrames: 30 }
                            : e.target.value === "speed"
                              ? { kind: "speed", min: 0.5, max: 2 }
                              : { kind: "reject" },
                      },
                    })
                  }
                >
                  <option value="reject">报错并保留草稿</option>
                  <option value="freeze">允许有限末帧定格</option>
                  <option value="speed">允许限定速度适配</option>
                </select>
              </Field>
              {s.playback.overflow.kind === "freeze" && (
                <Field label="最多定格帧数">
                  <input
                    type="number"
                    min="0"
                    value={s.playback.overflow.maxFrames}
                    onChange={(e) =>
                      patch({
                        ...s,
                        playback: {
                          ...s.playback,
                          overflow: {
                            kind: "freeze",
                            maxFrames: Number(e.target.value),
                          },
                        },
                      })
                    }
                  />
                </Field>
              )}
              {s.playback.overflow.kind === "speed" && (
                <>
                  <Field label="最小速度">
                    <input
                      type="number"
                      step="0.1"
                      value={s.playback.overflow.min}
                      onChange={(e) =>
                        patch({
                          ...s,
                          playback: {
                            ...s.playback,
                            overflow: {
                              ...(s.playback.kind === "speech"
                                ? s.playback.overflow
                                : {}),
                              min: Number(e.target.value),
                            },
                          },
                        })
                      }
                    />
                  </Field>
                  <Field label="最大速度">
                    <input
                      type="number"
                      step="0.1"
                      value={s.playback.overflow.max}
                      onChange={(e) =>
                        patch({
                          ...s,
                          playback: {
                            ...s.playback,
                            overflow: {
                              ...(s.playback.kind === "speech"
                                ? s.playback.overflow
                                : {}),
                              max: Number(e.target.value),
                            },
                          },
                        })
                      }
                    />
                  </Field>
                </>
              )}
            </div>
          )}
          {s.playback.audio.kind === "original" && (
            <Field label="原声增益（dB）">
              <input
                type="number"
                value={s.playback.audio.gainDb}
                onChange={(e) =>
                  patch({
                    ...s,
                    playback: {
                      ...s.playback,
                      audio: {
                        ...s.playback.audio,
                        gainDb: Number(e.target.value),
                      },
                    },
                  })
                }
              />
            </Field>
          )}
          {s.playback.audio.kind === "mix" && (
            <div className="actions">
              <Field label="原声增益（dB）">
                <input
                  type="number"
                  value={s.playback.audio.sourceGainDb}
                  onChange={(e) =>
                    patch({
                      ...s,
                      playback: {
                        ...s.playback,
                        audio: {
                          ...s.playback.audio,
                          sourceGainDb: Number(e.target.value),
                        },
                      },
                    })
                  }
                />
              </Field>
              <label>
                <input
                  type="checkbox"
                  checked={s.playback.audio.ducking}
                  onChange={(e) =>
                    patch({
                      ...s,
                      playback: {
                        ...s.playback,
                        audio: {
                          ...s.playback.audio,
                          ducking: e.target.checked,
                        },
                      },
                    })
                  }
                />
                旁白驱动原声压低
              </label>
            </div>
          )}
        </>
      )}
      {onMasksChange && (
        <MaskEditor
          sceneId={s.id}
          masks={masks}
          profile={profile}
          coordinateOnly={s.kind === "card"}
          media={
            s.kind !== "card" && selectedAsset
              ? {
                  kind: s.kind === "clip" ? "video" : "image",
                  url: mediaUrl(selectedAsset.digest),
                  sourceKey: refKey(s.kind === "clip" ? s.source : s.image),
                  startUs:
                    s.kind === "clip" ? s.sourceRange.startUs : undefined,
                  framing: s.framing,
                }
              : undefined
          }
          onChange={onMasksChange}
        />
      )}
    </>
  );
}
function BgmEditor({
  draft,
  assets,
  edit,
}: {
  draft: ProjectDocument;
  assets: z.infer<typeof MediaAssetVersion>[];
  edit: (p: ProjectDocument) => void;
}) {
  const bgm = draft.bgm;
  const update = (raw: unknown) => {
    const parsed = ProjectDocument.shape.bgm.safeParse(raw);
    if (parsed.success) edit({ ...draft, bgm: parsed.data });
  };
  return (
    <article>
      <Field label="背景音乐">
        <select
          value={bgm ? refKey(bgm.source) : ""}
          onChange={(e) => {
            const a = assets.find((a) => refKey(a) === e.target.value);
            update(
              a
                ? {
                    source: { assetId: a.assetId, version: a.version },
                    range: { startUs: 0, durationUs: 1000000 },
                    loop: true,
                    gainDb: -18,
                    fadeInFrames: 10,
                    fadeOutFrames: 15,
                    ducking: true,
                  }
                : undefined,
            );
          }}
        >
          <option value="">不使用背景音乐</option>
          {assets
            .filter((a) => a.kind === "audio")
            .map((a) => (
              <option key={a.version} value={refKey(a)}>
                {a.name}
              </option>
            ))}
        </select>
      </Field>
      {bgm && (
        <>
          <div className="actions">
            {[
              ["startUs", "音乐入点（秒）"],
              ["durationUs", "音乐裁剪时长（秒）"],
            ].map(([key, label]) => (
              <Field key={key} label={label}>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={
                    (key === "startUs"
                      ? bgm.range.startUs
                      : bgm.range.durationUs) / 1e6
                  }
                  onChange={(e) =>
                    update({
                      ...bgm,
                      range: {
                        ...bgm.range,
                        [key]: Math.round(Number(e.target.value) * 1e6),
                      },
                    })
                  }
                />
              </Field>
            ))}
            <Field label="增益（dB）">
              <input
                type="number"
                value={bgm.gainDb}
                onChange={(e) =>
                  update({ ...bgm, gainDb: Number(e.target.value) })
                }
              />
            </Field>
            {[
              ["fadeInFrames", "淡入帧数"],
              ["fadeOutFrames", "淡出帧数"],
            ].map(([key, label]) => (
              <Field key={key} label={label}>
                <input
                  type="number"
                  value={
                    key === "fadeInFrames"
                      ? bgm.fadeInFrames
                      : bgm.fadeOutFrames
                  }
                  onChange={(e) =>
                    update({ ...bgm, [key]: Number(e.target.value) })
                  }
                />
              </Field>
            ))}
          </div>
          <label className="check">
            <input
              type="checkbox"
              checked={bgm.loop}
              onChange={(e) => update({ ...bgm, loop: e.target.checked })}
            />
            循环裁剪段
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={bgm.ducking}
              onChange={(e) => update({ ...bgm, ducking: e.target.checked })}
            />
            旁白驱动音乐压低
          </label>
        </>
      )}
    </article>
  );
}
function LibraryPanel({
  kind,
  library,
  providers,
  refresh,
  fail,
}: {
  kind: "voice" | "method" | "material";
  library: z.infer<typeof LibraryVersion>[];
  providers: z.infer<typeof ProviderDescriptor>[];
  refresh: () => Promise<void>;
  fail: (e: unknown) => void;
}) {
  const formEpoch = useRef(0);
  const [selected, setSelected] = useState<z.infer<
      typeof LibraryVersion
    > | null>(null),
    [name, setName] = useState(""),
    [referenceText, setReferenceText] = useState(""),
    [description, setDescription] = useState(""),
    [file, setFile] = useState<File | null>(null),
    [style, setStyle] = useState(""),
    [sample, setSample] = useState(""),
    [runId, setRunId] = useState(""),
    [result, setResult] = useState<unknown>(null),
    [status, setStatus] = useState(""),
    [purpose, setPurpose] = useState<"design" | "transcribe">("design"),
    [needs, setNeeds] = useState<string[]>([]),
    [clipAudio, setClipAudio] = useState(""),
    [observed, setObserved] = useState(false);
  const [voiceProvider, setVoiceProvider] = useState("modelbest-voxcpm2");
  useEffect(() => {
    setSelected(null);
    setName("");
    setReferenceText("");
    setDescription("");
    setFile(null);
    setResult(null);
    setRunId("");
    setStyle("");
    setVoiceProvider("modelbest-voxcpm2");
  }, [kind]);
  useEffect(() => {
    if (!runId) return;
    const generation = formEpoch.current;
    const ctrl = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const poll = () =>
      api(`/runs/${runId}`, RunDetail, { signal: ctrl.signal })
        .then((r) => {
          if (ctrl.signal.aborted || generation !== formEpoch.current) return;
          setStatus(labels[r.run.state]);
          setResult(r.nodes[0]?.result);
          if (r.run.state === "succeeded" && purpose === "transcribe") {
            const t = z.object({ text: z.string() }).parse(r.nodes[0]?.result);
            setReferenceText(t.text);
          }
          if (["queued", "running"].includes(r.run.state))
            timer = setTimeout(poll, 1000);
          else if (r.run.error) fail(new Error(r.run.error.message));
        })
        .catch((e) => {
          if (!ctrl.signal.aborted) fail(e);
        });
    poll();
    return () => {
      ctrl.abort();
      clearTimeout(timer);
    };
  }, [runId, purpose]);
  const preview = z
    .object({ digest: z.string(), text: z.string() })
    .safeParse(result);
  const startRun = (
    url: string,
    body: unknown,
    purpose: "design" | "transcribe",
  ) => {
    const generation = ++formEpoch.current;
    setRunId("");
    setResult(null);
    setStatus("提交中");
    setPurpose(purpose);
    api(url, RunRecord, { method: "POST", body })
      .then((r) => {
        if (generation !== formEpoch.current) return;
        setPurpose(purpose);
        setRunId(r.id);
      })
      .catch((e) => {
        if (generation === formEpoch.current) {
          setStatus("");
          fail(e);
        }
      });
  };
  const save = async () => {
    const generation = formEpoch.current;
    if (file) {
      const body = new FormData();
      body.append("file", file);
      body.append("kind", kind);
      body.append("name", name);
      body.append("referenceText", referenceText);
      body.append("requestId", requestId());
      if (kind === "voice") {
        body.append("provider", voiceProvider);
        body.append("style", style);
      }
      if (selected) {
        body.append("itemId", selected.itemId);
        body.append("expectedVersion", selected.version);
      }
      await api("/library/upload", LibraryVersion, { method: "POST", body });
    } else {
      const payload =
        kind === "method"
          ? {
              ...(selected?.payload.kind === "method"
                ? selected.payload
                : { kind, sceneTemplate: [] }),
              name,
              description,
              needs,
              clipAudio: clipAudio || undefined,
              clipAlignment: observed ? "observed-sequences" : undefined,
            }
          : selected?.payload.kind === "voice"
            ? {
                ...selected.payload,
                name,
                referenceText,
                provider: voiceProvider,
                style,
              }
            : selected
              ? { ...selected.payload, name }
              : null;
      if (!payload) throw Error("先选择文件");
      await api("/library", LibraryVersion, {
        method: "POST",
        body: {
          itemId: selected?.itemId,
          expectedVersion: selected?.version || null,
          requestId: requestId(),
          payload,
        },
      });
    }
    await refresh();
    if (generation !== formEpoch.current) return;
    setSelected(null);
    setName("");
    setReferenceText("");
    setDescription("");
    setFile(null);
  };
  return (
    <main className="library">
      <h1>
        {kind === "voice" ? "音色" : kind === "method" ? "方法" : "可复用素材"}
      </h1>
      <p>
        项目绑定精确版本。编辑发布新版本；删除只隐藏当前库项，历史引用继续有效。
      </p>
      <div className="two">
        <section>
          {library
            .filter((v) => v.payload.kind === kind)
            .map((v) => (
              <article key={v.itemId}>
                <div className="section-title">
                  <b>{v.payload.name}</b>
                  <div>
                    <button
                      onClick={() => {
                        formEpoch.current++;
                        setRunId("");
                        setResult(null);
                        setStatus("");
                        setSelected(v);
                        setName(v.payload.name);
                        setReferenceText(
                          v.payload.kind === "voice"
                            ? v.payload.referenceText
                            : "",
                        );
                        setNeeds(
                          v.payload.kind === "method" ? v.payload.needs : [],
                        );
                        setClipAudio(
                          v.payload.kind === "method"
                            ? v.payload.clipAudio || ""
                            : "",
                        );
                        setObserved(
                          v.payload.kind === "method" &&
                            !!v.payload.clipAlignment,
                        );
                        setDescription(
                          v.payload.kind === "method"
                            ? v.payload.description
                            : "",
                        );
                        if (v.payload.kind === "voice") {
                          setVoiceProvider(v.payload.provider);
                          setStyle(v.payload.style);
                        }
                      }}
                    >
                      编辑
                    </button>
                    <button
                      onClick={() =>
                        api(`/library/${v.itemId}`, z.unknown(), {
                          method: "DELETE",
                          body: {
                            expectedVersion: v.version,
                            requestId: requestId(),
                          },
                        })
                          .then(refresh)
                          .catch(fail)
                      }
                    >
                      删除
                    </button>
                  </div>
                </div>
                <small>版本 {v.version.slice(0, 12)}</small>
                {v.payload.kind === "voice" && (
                  <audio controls src={mediaUrl(v.payload.reference)} />
                )}
              </article>
            ))}
        </section>
        <section>
          <h2>{selected ? "发布新版本" : "添加"}</h2>
          <Field label="名称">
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          {kind === "voice" && (
            <Field label="语音提供方">
              <select
                value={voiceProvider}
                onChange={(event) => setVoiceProvider(event.target.value)}
              >
                <option value="modelbest-voxcpm2">
                  云端 ModelBest VoxCPM2（默认）
                </option>
                {providers
                  .filter(
                    (provider) =>
                      provider.id === "local-voxcpm2" && provider.ready,
                  )
                  .map((provider) => (
                    <option key={provider.id} value={provider.id}>
                      {provider.name} · 已就绪
                    </option>
                  ))}
              </select>
            </Field>
          )}
          {kind === "method" ? (
            <>
              <Field label="适用条件与方法">
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </Field>
              <div className="row">
                {[
                  ["transcript", "转写证据"],
                  ["description", "画面观察"],
                  ["match-report", "匹配报告"],
                ].map(([key, label]) => (
                  <label className="check" key={key}>
                    <input
                      type="checkbox"
                      checked={needs.includes(key)}
                      onChange={(e) =>
                        setNeeds(
                          e.target.checked
                            ? [...needs, key]
                            : needs.filter((n) => n !== key),
                        )
                      }
                    />
                    {label}
                  </label>
                ))}
              </div>
              <Field label="片段声音约束">
                <select
                  value={clipAudio}
                  onChange={(e) => setClipAudio(e.target.value)}
                >
                  <option value="">不限制</option>
                  <option value="original">原声</option>
                  <option value="narration">旁白</option>
                  <option value="mix">混音</option>
                </select>
              </Field>
              <label className="check">
                <input
                  type="checkbox"
                  checked={observed}
                  onChange={(e) => setObserved(e.target.checked)}
                />
                选段必须位于已有观察区间
              </label>
            </>
          ) : (
            <input
              type="file"
              aria-label="上传库文件"
              onChange={(e) => {
                formEpoch.current++;
                setRunId("");
                setResult(null);
                setStatus("");
                setFile(e.target.files?.[0] || null);
              }}
            />
          )}{" "}
          {kind === "voice" && (
            <Field label="克隆源的实际参考文本">
              <button
                aria-label="转写参考音频"
                disabled={!file && selected?.payload.kind !== "voice"}
                onClick={() => {
                  const body = file
                    ? new FormData()
                    : {
                        voiceId: selected?.itemId,
                        voiceVersion: selected?.version,
                        requestId: requestId(),
                      };
                  if (body instanceof FormData && file) {
                    body.append("file", file);
                    body.append("requestId", requestId());
                  }
                  startRun(
                    file ? "/voice/transcribe-upload" : "/voice/transcribe",
                    body,
                    "transcribe",
                  );
                }}
              >
                转写参考音频
              </button>
              <small>{purpose === "transcribe" ? status : ""}</small>
              <textarea
                value={referenceText}
                onChange={(e) => {
                  if (purpose === "transcribe") {
                    formEpoch.current++;
                    setRunId("");
                    setStatus("");
                  }
                  setReferenceText(e.target.value);
                }}
              />
            </Field>
          )}
          <button
            className="primary"
            disabled={["提交中", "排队", "运行中"].includes(status)}
            onClick={() => save().catch(fail)}
          >
            保存版本
          </button>
          {kind === "voice" && (
            <>
              <h2>设计试听</h2>
              <Field label="声音描述">
                <textarea
                  value={style}
                  onChange={(e) => setStyle(e.target.value)}
                />
              </Field>
              <Field label="试听文案">
                <textarea
                  value={sample}
                  onChange={(e) => setSample(e.target.value)}
                />
              </Field>
              <button
                onClick={() =>
                  startRun(
                    "/voice/design",
                    {
                      style,
                      text: sample,
                      provider: voiceProvider,
                      requestId: requestId(),
                    },
                    "design",
                  )
                }
              >
                生成试听作业
              </button>
              <small>{status}</small>
              {purpose === "design" && preview.success && (
                <>
                  <audio controls src={mediaUrl(preview.data.digest)} />
                  <button
                    onClick={() =>
                      api("/voice/accept", LibraryVersion, {
                        method: "POST",
                        body: {
                          runId,
                          name: name || "新音色",
                          expectedVersion: null,
                          requestId: requestId(),
                        },
                      })
                        .then(refresh)
                        .catch(fail)
                    }
                  >
                    收下为音色
                  </button>
                </>
              )}
            </>
          )}
        </section>
      </div>
    </main>
  );
}
