import { useEffect, useMemo, useRef, useState } from "react";
import {
  z,
  ActiveModelBinding,
  ActiveVerifyResult,
  ModelSettingsView,
  ModelsView,
  RunRecord,
  EventRecord,
  ModelInstallPlan,
  VerifyResult,
} from "@lightweaver/weaver/contracts";
import { api, ApiError } from "../api";
import { useSession } from "../session/context";
import { desktop, openLink } from "../desktop";
import { notifyRunsChanged } from "../jobs/useRunList";
import { Button } from "../ui/Button";
import { Badge } from "../ui/Badge";
import { ArrowLeftIcon } from "../ui/Icons";
import { ModelPathField } from "./ModelPathField";

type ModelSelection = { kind: "provider" } | { kind: "local"; id: string } | null;

const capabilityLabel: Record<string, string> = { asr: "语音识别", embedding: "文字与画面检索", alignment: "精确字幕对齐", vad: "语音活动检测" };
const formatBytes = (bytes: number) => bytes >= 1024 ** 3
  ? `${(bytes / 1024 ** 3).toFixed(1)} GB` : `${Math.ceil(bytes / 1024 ** 2)} MB`;

const RunDetail = z.object({
  run: RunRecord,
  nodes: z.array(
    z.object({
      state: z.string(),
      result: z.unknown().nullable(),
    }),
  ),
});

const stateLabel: Record<string, string> = {
  queued: "排队",
  running: "准备中",
  cancelling: "取消中",
  succeeded: "已完成",
  failed: "失败",
  cancelled: "已取消",
  interrupted: "已中断",
  partial: "部分完成",
};

const readinessLabel = {
  enabled: "已启用",
  configured: "待启用",
  downloaded: "已下载",
  attention: "不可用",
  missing: "未下载",
};

type ModelPath = Exclude<z.infer<typeof ActiveModelBinding>, { target: "literal" }>;
type LocalModelState = z.infer<typeof ModelsView>["local"][number];
type ModelCheck = { key: string; state: "checking" | "verified" | "invalid" | "missing" | "error" };
const modelCheckKey = (id: string, current: LocalModelState | undefined) =>
  JSON.stringify([id, current?.activeBindings, current?.activeFiles, current?.status]);

function modelLocation(paths: ModelPath[], downloaded: string) {
  const configured = paths.filter((binding) => binding.resolvedPath);
  if (!configured.length) return { path: downloaded, otherPaths: [] };
  if (configured.length === 1) return { path: configured[0].resolvedPath, otherPaths: [] };
  const directories = configured.map((binding) => {
    if (binding.target === "directory") return binding.resolvedPath;
    const separator = binding.resolvedPath.includes("\\") ? "\\" : "/",
      suffix = `${separator}${binding.file.replaceAll("/", separator)}`;
    return binding.resolvedPath.endsWith(suffix) ? binding.resolvedPath.slice(0, -(suffix.length - 1)) : "";
  });
  if (directories[0] && directories.every((directory) => directory === directories[0]))
    return { path: directories[0], otherPaths: [] };
  return { path: configured[0].resolvedPath, otherPaths: configured.slice(1).map((binding) => binding.resolvedPath) };
}

function ProgressEvent({ event }: { event: unknown }) {
  const parsed = z
    .object({
      modelId: z.string().optional(),
      file: z.string().optional(),
      received: z.number().optional(),
      total: z.number().optional(),
      completedFiles: z.number().optional(),
      totalFiles: z.number().optional(),
      message: z.string().optional(),
      engineId: z.string().optional(),
      phase: z.string().optional(),
    })
    .safeParse(event);
  if (!parsed.success) return null;
  const value = parsed.data;
  const title = value.engineId
    ? value.phase === "download" ? "下载所需组件" : value.phase === "verify" ? "校验所需组件" : "准备模型所需组件"
    : value.message || value.file || value.modelId || "准备模型";
  const percent = value.received !== undefined && value.total
    ? Math.max(0, Math.min(100, Math.floor((value.received / value.total) * 100)))
    : value.completedFiles !== undefined && value.totalFiles
      ? Math.max(0, Math.min(100, Math.floor((value.completedFiles / value.totalFiles) * 100)))
      : null;
  return (
    <div className="mt-2 flex flex-col gap-1">
      <small className="numeric">
        {title}
        {percent !== null ? ` · ${percent}%` : value.completedFiles !== undefined ? ` · ${value.completedFiles}/${value.totalFiles || "?"} 个文件` : ""}
      </small>
      {percent !== null && <div className="run-progress" aria-label={`下载进度 ${percent}%`}><span style={{ width: `${percent}%` }} /></div>}
    </div>
  );
}

export function ModelSettings({
  fail,
  onOpenJobs,
}: {
  fail: (error: unknown) => void;
  onOpenJobs: () => void;
}) {
  const session = useSession();
  const [view, setView] = useState<z.infer<typeof ModelsView> | null>(null),
    [root, setRoot] = useState(""),
    [apiKey, setApiKey] = useState(""),
    [runId, setRunId] = useState(""),
    [events, setEvents] = useState<z.infer<typeof EventRecord>[]>([]),
    [busy, setBusy] = useState(""),
    [pollGeneration, setPollGeneration] = useState(0),
    [selection, setSelection] = useState<ModelSelection>(null);
  const [checks, setChecks] = useState<Partial<Record<string, ModelCheck>>>({});
  const [installPlan, setInstallPlan] = useState<{ key: string; value: z.infer<typeof ModelInstallPlan> } | null>(null);
  const selectedModel = selection?.kind === "local" ? selection.id : "";
  const selectedState = view?.local.find((item) => item.id === selectedModel),
    checkKey = modelCheckKey(selectedModel, selectedState);
  const planKey = JSON.stringify([selectedModel, root, view?.settings.revision,
    view?.local.find((item) => item.id === selectedModel)]);
  const currentPlan = installPlan?.key === planKey ? installPlan.value : null;
  useEffect(() => {
    if (!selectedModel || !root || !view) return;
    const controller = new AbortController();
    api(`/models/${encodeURIComponent(selectedModel)}/install-plan?root=${encodeURIComponent(root)}`,
      ModelInstallPlan, { signal: controller.signal }).then((value) => {
      if (!controller.signal.aborted) setInstallPlan({ key: planKey, value });
    }).catch((reason) => { if (!controller.signal.aborted) fail(reason); });
    return () => controller.abort();
  }, [planKey]);
  useEffect(() => {
    if (!selectedModel || !selectedState) return;
    const paths = selectedState.activeBindings.filter((binding) => binding.target !== "literal"),
      configured = paths.length > 0 && paths.every((binding) => binding.state === "present") &&
        selectedState.activeFiles.length > 0 && selectedState.activeFiles.every((file) => file.state === "metadata-match");
    if (!configured && selectedState.status.state !== "unchecked") return;
    const controller = new AbortController(), id = selectedModel;
    setChecks((current) => ({ ...current, [id]: { key: checkKey, state: "checking" } }));
    const verify = configured
      ? api(`/models/${encodeURIComponent(id)}/verify-active`, ActiveVerifyResult, { method: "POST", signal: controller.signal })
      : api(`/models/${encodeURIComponent(id)}/verify`, VerifyResult, { method: "POST", body: { root: selectedState.status.root }, signal: controller.signal });
    verify.then(async (result) => {
      if (!controller.signal.aborted && "snapshot" in result &&
        JSON.stringify(result.snapshot) !== JSON.stringify({ bindings: selectedState.activeBindings, files: selectedState.activeFiles })) {
        await refreshModels(false, controller.signal);
        return;
      }
      if (!controller.signal.aborted) setChecks((current) => ({ ...current, [id]: { key: checkKey, state: result.state } }));
    }).catch(() => {
      if (!controller.signal.aborted) setChecks((current) => ({ ...current, [id]: { key: checkKey, state: "error" } }));
    });
    return () => {
      controller.abort();
      setChecks((current) => {
        if (current[id]?.key !== checkKey || current[id]?.state !== "checking") return current;
        const next = { ...current };
        delete next[id];
        return next;
      });
    };
  }, [checkKey]);
  const rootRef = useRef(""),
    rootDirty = useRef(false),
    refreshGeneration = useRef(0),
    sectionRef = useRef<HTMLElement>(null),
    mutationPending = useRef(false);

  const refreshModels = async (resetRoot: boolean, signal?: AbortSignal) => {
    const generation = ++refreshGeneration.current,
      requestedRoot = rootRef.current,
      query = requestedRoot ? `?root=${encodeURIComponent(requestedRoot)}` : "";
    const next = await api(`/models${query}`, ModelsView, { signal });
    if (signal?.aborted || rootRef.current !== requestedRoot || refreshGeneration.current !== generation) return next;
    setView(next);
    if (resetRoot && !rootDirty.current) {
      rootRef.current = next.settings.downloadRoot.value;
      setRoot(next.settings.downloadRoot.value);
    }
    const latest = next.downloads.find((item) =>
      ["queued", "running", "cancelling"].includes(item.state),
    ) || next.downloads[0];
    if (latest) setRunId(latest.id);
    return next;
  };

  useEffect(() => {
    const controller = new AbortController();
    refreshModels(true, controller.signal).catch((error) => {
      if (!controller.signal.aborted) fail(error);
    });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!runId) return;
    const controller = new AbortController(),
      source = new EventSource(`/api/runs/${runId}/events`);
    source.addEventListener("weaver", (event) => {
      if (controller.signal.aborted) return;
      try {
        const value = EventRecord.parse(JSON.parse(event.data));
        setEvents((current) => [...current.slice(-99), value]);
      } catch (error) {
        fail(error);
      }
    });
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const detail = await api(`/runs/${runId}`, RunDetail, {
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        setView((current) => current && ({
          ...current,
          downloads: current.downloads.map((item) => item.id === runId ? detail.run : item),
        }));
        if (
          ["queued", "running", "cancelling"].includes(detail.run.state)
        )
          timer = setTimeout(poll, 1000);
        else {
          source.close();
          notifyRunsChanged();
          await refreshModels(false, controller.signal);
          if (!controller.signal.aborted) window.dispatchEvent(new Event("lightweaver-capabilities-changed"));
        }
      } catch (error) {
        if (!controller.signal.aborted) fail(error);
      }
    };
    poll();
    return () => {
      controller.abort();
      source.close();
      clearTimeout(timer);
    };
  }, [runId, pollGeneration]);

  const local = useMemo(
    () =>
      view?.catalog.localModels.map((model) => {
        const current = view.local.find((item) => item.id === model.id),
          status = current?.status,
          activeBindings = current?.activeBindings || [],
          activeFiles = current?.activeFiles || [],
          runtime = current?.runtime || [],
          paths = activeBindings.filter((binding) => binding.target !== "literal"),
          pathsReady = paths.length > 0 && paths.every((binding) => binding.state === "present"),
          pathsUnset = paths.length === 0 || paths.every((binding) => binding.state === "unset"),
          check = checks[model.id]?.key === modelCheckKey(model.id, current) ? checks[model.id] : undefined,
          invalid = check && ["invalid", "missing", "error"].includes(check.state),
          activeReady = pathsReady &&
            activeFiles.length > 0 && activeFiles.every((file) => file.state === "metadata-match") && !invalid,
          enabled = activeReady && runtime.every((item) => item.ready),
          readiness: keyof typeof readinessLabel = enabled ? "enabled"
            : activeReady ? "configured"
            : invalid ? "attention"
            : status?.state === "unchecked" ? "downloaded"
            : !pathsUnset || status?.state === "invalid" ? "attention" : "missing",
          location = modelLocation(paths, status?.state === "missing" ? "" : status?.directory || "");
        return {
          model,
          enabled,
          readiness,
          location,
          check,
        };
      }) || [],
    [view, checks],
  );

  const writeSettings = async (
    endpoint: string,
    method: "PUT" | "POST",
    payload: Record<string, unknown>,
  ) => {
    const key = JSON.stringify([endpoint, payload]);
    const attempt = session.stableRequest(key);
    const submit = () => api(endpoint, ModelSettingsView, {
      method,
      body: { ...payload, requestId: attempt.requestId },
    });
    let saved: z.infer<typeof ModelSettingsView>;
    try { saved = await submit(); }
    catch (error) {
      if (error instanceof ApiError) throw error;
      saved = await submit();
    }
    session.completeStableRequest(key, attempt);
    return saved;
  };

  const saveSettings = async (patch: Record<string, unknown>) => {
    if (!view) return;
    const submittedRoot =
      typeof patch.downloadRoot === "string" ? patch.downloadRoot : undefined;
    const submittedApiKey = apiKey;
    const saved = await writeSettings("/models/settings", "PUT", {
      expectedRevision: view.settings.revision,
      ...patch,
    });
    if ("modelbestApiKey" in patch || patch.clearModelbestApiKey)
      setApiKey((current) => current === submittedApiKey ? "" : current);
    if (submittedRoot !== undefined && rootRef.current === submittedRoot) {
      rootDirty.current = false;
      rootRef.current = saved.downloadRoot.value;
      setRoot(saved.downloadRoot.value);
    }
    await refreshModels(false);
    window.dispatchEvent(new Event("lightweaver-capabilities-changed"));
  };

  const mutate = async (label: string, fn: () => Promise<void>) => {
    if (mutationPending.current) throw new Error("有操作进行中，请稍后重试。");
    mutationPending.current = true;
    setBusy(label);
    try {
      await fn();
    } finally {
      mutationPending.current = false;
      setBusy("");
    }
  };

  const act = async (label: string, fn: () => Promise<void>) => {
    try { await mutate(label, fn); } catch (error) { fail(error); }
  };

  const adoptModel = (id: string, path: string) => mutate("应用模型路径", async () => {
    if (!view) return;
    try {
      await writeSettings(`/models/${encodeURIComponent(id)}/adopt`, "POST", {
        path, expectedRevision: view.settings.revision,
      });
    } catch (error) {
      if (error instanceof ApiError && error.protocol.code === "CONFIG_CONFLICT") await refreshModels(false);
      throw error;
    }
    await refreshModels(false);
    window.dispatchEvent(new Event("lightweaver-capabilities-changed"));
  });

  const installModel = (id: string) => act(`准备 ${id}`, async () => {
    if (!view || !currentPlan?.available) return;
    const payload = { root, expectedRevision: view.settings.revision, source: currentPlan.source };
    const key = JSON.stringify(["model-install", id, payload]);
    const attempt = session.stableRequest(key);
    const submit = async () => {
      try {
        return await api(`/models/${encodeURIComponent(id)}/install`, RunRecord, {
          method: "POST", body: { ...payload, requestId: attempt.requestId },
        });
      } catch (reason) {
        if (reason instanceof ApiError && reason.protocol.code === "MODEL_FILES_CHANGED") await refreshModels(false);
        throw reason;
      }
    };
    let next: z.infer<typeof RunRecord>;
    try { next = await submit(); }
    catch (reason) { if (reason instanceof ApiError) throw reason; next = await submit(); }
    session.completeStableRequest(key, attempt);
    setRunId(next.id);
    setPollGeneration((value) => value + 1);
    setEvents([]);
    notifyRunsChanged();
    setView((current) => current && ({ ...current,
      downloads: [next, ...current.downloads.filter((item) => item.id !== next.id)] }));
  });

  const select = (next: ModelSelection) => {
    setSelection(next);
    sectionRef.current?.scrollIntoView({ block: "start" });
  };

  if (!view) return <section className="flex flex-col gap-5"><p>加载模型设置…</p></section>;
  const provider = view.catalog.providers[0],
    progress = [...events].reverse().find((event) =>
      event.runId === runId && ["model-download-progress", "engine-install-progress", "model-setup-progress"].includes(event.type),
    ),
    activeRun = view.downloads.find((item) => ["queued", "running", "cancelling"].includes(item.state)),
    lastRun = view.downloads[0];

  return (
    <section ref={sectionRef} className="flex flex-col gap-5">
      {!selection && <h2 className="m-0">模型与供应商</h2>}

      {selection && (
        <div>
          <Button size="sm" variant="ghost" onClick={() => select(null)}><ArrowLeftIcon />返回模型列表</Button>
        </div>
      )}

      {!selection && (
        <section className="flex flex-col gap-3" aria-label="供应商">
          <div className="section-title"><h3 className="m-0">供应商</h3><small>云端模型与密钥</small></div>
          <div className="model-inventory-grid">
            <article className="panel-card model-inventory-card">
              <div className="model-inventory-head">
                <b>{provider.name}</b>
                <Badge tone={provider.apiKeyConfigured ? "ok" : "warn"} dot>{provider.apiKeyConfigured ? "密钥已配置" : "密钥未配置"}</Badge>
                <Button size="sm" aria-label={`配置 ${provider.name}`} onClick={() => select({ kind: "provider" })}>配置</Button>
              </div>
              <details className="model-inventory-details">
                <summary>查看模型与密钥来源</summary>
                <div className="model-inventory-meta">
                  <small>模型：{provider.models.map((model) => model.name).join(" · ")}</small>
                  <small>密钥来源：{view.settings.apiKeys.modelbest.source}</small>
                </div>
              </details>
            </article>
          </div>
        </section>
      )}

      {selection?.kind === "provider" && <section className="panel-card flex flex-col gap-4 p-5">
        <div className="section-title">
          <div>
            <h3 className="m-0">{provider.name}</h3>
            <Badge tone={provider.apiKeyConfigured ? "ok" : "warn"} dot>
              {provider.apiKeyConfigured ? "密钥已配置" : "密钥未配置"}
            </Badge>
          </div>
          <div>
            <Button type="button" onClick={() => void openLink(provider.keyUrl)}>获取 Key</Button>
            <Button type="button" onClick={() => void openLink(provider.docsUrl)}>查看文档</Button>
          </div>
        </div>
        <div className="auto-card-grid">
          {provider.models.map((model) => (
            <article className="subtle-card flex flex-col gap-1 p-3" key={model.id}>
              <b>{model.name}</b>
              <small>{model.capabilities.join(" · ")}</small>
            </article>
          ))}
        </div>
        <div className="preset-effective">
          {[
            ["vlmProvider", "VLM 提供方"],
            ["vlmModel", "VLM 型号"],
            ["ttsModel", "TTS 型号"],
          ].map(([key, label]) => {
            const value = view.settings.values[key];
            return (
              <small key={key}>
                {label}：{value.value || "未设置"} · 来源 {value.source}
              </small>
            );
          })}
        </div>
        <Button
          disabled={!!busy}
          onClick={() =>
            act("采用 ModelBest 预设", async () => {
              await writeSettings(
                `/models/providers/modelbest/adopt`,
                "POST",
                { expectedRevision: view.settings.revision },
              );
              await refreshModels(false);
              window.dispatchEvent(new Event("lightweaver-capabilities-changed"));
            })
          }
        >
          采用 ModelBest 预设
        </Button>
        <div className="inline-fields">
          <label className="field">
            <span>ModelBest API Key</span>
            <input
              type="password"
              autoComplete="off"
              value={apiKey}
              placeholder={provider.apiKeyConfigured ? "已配置，留空保持不变" : "粘贴密钥"}
              onChange={(event) => setApiKey(event.target.value)}
            />
            <small>
              当前来源：{view.settings.apiKeys.modelbest.source}。保存后立即生效；
              清除本地配置中的密钥后，会回退到环境变量{" "}
              {provider.apiKeyEnv}，未设置则为未配置。密钥不会回显或写入浏览器存储。
            </small>
          </label>
          <Button
            variant="primary"
            disabled={!apiKey || !!busy}
            onClick={() =>
              act("保存密钥", () => saveSettings({ modelbestApiKey: apiKey }))
            }
          >
            保存密钥
          </Button>
          <Button
            disabled={!provider.apiKeyConfigured || !!busy}
            onClick={() =>
              act("清除密钥", () =>
                saveSettings({ clearModelbestApiKey: true }),
              )
            }
          >
            清除本地配置中的密钥
          </Button>
        </div>
      </section>}

      {selection?.kind !== "provider" && <section className="flex flex-col gap-3">
        {!selection && <div className="section-title"><h3 className="m-0">本地模型</h3><small>按需准备，在本机处理</small></div>}
        {!selection && <details className="panel-card model-root">
          <summary><b>下载根目录</b><small className="numeric" title={root}>{root || "未设置"}{rootDirty.current ? " · 未保存" : ""}</small></summary>
          <div className="inline-fields">
            <label className="field">
              <span>下载根目录</span>
              <input
                value={root}
                disabled={!!busy}
                onBlur={() => refreshModels(false).catch(fail)}
                onChange={(event) => {
                  rootDirty.current = true;
                  rootRef.current = event.target.value;
                  setRoot(event.target.value);
                }}
              />
              <small>
                {rootDirty.current
                  ? "未保存，离开输入框后刷新文件状态"
                  : `来源：${view.settings.downloadRoot.source}`}
              </small>
            </label>
            <Button
              type="button"
              disabled={!!busy}
              onClick={() =>
                void desktop()?.pickDirectory?.().then((picked) => {
                  if (!picked) return;
                  rootDirty.current = true;
                  rootRef.current = picked;
                  setRoot(picked);
                  void refreshModels(false).catch(fail);
                }).catch(fail)
              }
            >
              选择目录
            </Button>
            <Button
              disabled={!root || !!busy}
              onClick={() =>
                act("保存路径", () => saveSettings({ downloadRoot: root }))
              }
            >
              保存下载路径
            </Button>
          </div>
        </details>}

        {!selection && <div className="model-inventory-grid">
          {local.map(({ model, enabled, readiness, check }) => (
            <article key={model.id} className="panel-card model-inventory-card">
              <div className="model-inventory-head">
                <b title={model.name}>{model.name}</b>
                <Badge tone={check?.state === "checking" ? "accent" : enabled ? "ok" : readiness === "attention" ? "warn" : "neutral"} dot>{check?.state === "checking" ? "检查中…" : readinessLabel[readiness]}</Badge>
                <Button size="sm" aria-label={`选择 ${model.name}`} onClick={() => select({ kind: "local", id: model.id })}>管理模型</Button>
              </div>
              <small className="hint">{capabilityLabel[model.capability]} · 模型文件 {formatBytes(model.files.reduce((sum, file) => sum + file.size, 0))}</small>
            </article>
          ))}
        </div>}

        {selection?.kind === "local" && <div className="flex flex-col gap-4">
          {local.filter(({ model }) => model.id === selection.id).map(({ model, location, check, readiness: listedReadiness }) => {
            const readiness = !currentPlan ? listedReadiness
              : (listedReadiness === "enabled" || listedReadiness === "configured") && currentPlan.source.kind !== "configured" ? "attention"
              : listedReadiness === "missing" || listedReadiness === "downloaded"
                ? currentPlan.source.kind === "download" ? "missing" : "downloaded"
                : listedReadiness;
            const bridge = desktop();
            return (
              <article key={model.id} className="panel-card flex flex-col gap-4 p-5">
                <div className="section-title items-start">
                  <div className="flex-col !items-start gap-1">
                    <b>{model.name}</b>
                    <small>{capabilityLabel[model.capability]}</small>
                  </div>
                  <Badge tone={check?.state === "checking" ? "accent" : readiness === "enabled" ? "ok" : readiness === "attention" ? "warn" : "neutral"} dot>{check?.state === "checking" ? "检查中…" : readinessLabel[readiness]}</Badge>
                </div>
                <ModelPathField
                  value={location.path}
                  disabled={!!busy || !!activeRun}
                  pickFile={bridge?.pickModelFile}
                  pickDirectory={bridge?.pickDirectory}
                  onAdopt={(path) => adoptModel(model.id, path)}
                />
                {location.otherPaths.map((path) => <small className="numeric break-all" key={path}>{path}</small>)}
                {readiness === "attention" && <small className="error">{check?.state === "error" ? "暂时无法检查模型，请重新选择路径。" : "模型路径不可用或文件不完整，请重新选择。"}</small>}
                {readiness !== "enabled" && readiness !== "attention" && <div className="flex flex-wrap items-center gap-3">
                  <Button variant="primary" disabled={!currentPlan?.available || check?.state === "checking" || !!busy || !!activeRun}
                    onClick={() => void installModel(model.id)}>{readiness === "missing" ? "下载并启用" : "启用"}</Button>
                  {!currentPlan ? <small className="hint">检查中…</small>
                    : !currentPlan.available ? <small className="error">{currentPlan.reason}</small>
                    : currentPlan.modelBytes + currentPlan.dependencyBytes > 0 && <small className="hint">需下载约 {formatBytes(currentPlan.modelBytes + currentPlan.dependencyBytes)}</small>}
                </div>}
              </article>
            );
          })}
        </div>}
      </section>}

      {selection?.kind !== "provider" && (activeRun || lastRun && ["failed", "partial", "interrupted"].includes(lastRun.state)) && (
        <div className="subtle-card flex items-center gap-3 p-3" role="status">
          <div className="min-w-0 flex-1">
            <small>{activeRun ? `模型${stateLabel[activeRun.state]}` : "上次模型准备未完成"}</small>
            {activeRun?.id === runId && progress && <ProgressEvent event={progress.data} />}
          </div>
          <Button size="sm" variant="ghost" onClick={onOpenJobs}>查看任务</Button>
        </div>
      )}
    </section>
  );
}
