import { useEffect, useMemo, useRef, useState } from "react";
import {
  z,
  ActiveVerifyResult,
  ModelSettingsView,
  ModelsView,
  RunRecord,
  VerifyResult,
  EventRecord,
  ModelInstallPlan,
} from "@lightweaver/weaver/contracts";
import { api, ApiError, requestId } from "../api";
import { useSession } from "../session/context";
import { desktop, openLink } from "../desktop";
import { notifyRunsChanged } from "../jobs/useRunList";
import { Button } from "../ui/Button";
import { Badge } from "../ui/Badge";
import { InputWithActions } from "../ui/InputWithActions";
import { ArrowLeftIcon } from "../ui/Icons";

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
  missing: "未下载",
  invalid: "文件不完整",
  unchecked: "大小已匹配，待校验",
  verified: "完整性已校验",
};

const activeFileLabel: Record<string, string> = {
  unset: "未配置路径",
  missing: "此版本清单中的文件不存在",
  "wrong-type": "不是普通文件",
  unavailable: "无法访问",
  "size-mismatch": "大小与此版本清单不同",
  "metadata-match": "大小匹配，待校验",
};

const pathStateLabel: Record<string, string> = {
  unset: "未配置",
  missing: "路径不存在",
  "wrong-type": "路径类型不匹配",
  unavailable: "无法访问",
  present: "路径已找到",
};

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
    [adoptPaths, setAdoptPaths] = useState<Record<string, string>>({}),
    [runId, setRunId] = useState(""),
    [events, setEvents] = useState<z.infer<typeof EventRecord>[]>([]),
    [verify, setVerify] = useState<Partial<Record<string, z.infer<typeof VerifyResult>>>>({}),
    [activeVerify, setActiveVerify] = useState<Partial<Record<string, z.infer<typeof ActiveVerifyResult>>>>({}),
    [busy, setBusy] = useState(""),
    [pollGeneration, setPollGeneration] = useState(0),
    [downloadsOpen, setDownloadsOpen] = useState(false),
    [selection, setSelection] = useState<ModelSelection>(null);
  const [installPlan, setInstallPlan] = useState<{ key: string; value: z.infer<typeof ModelInstallPlan> } | null>(null);
  const selectedModel = selection?.kind === "local" ? selection.id : "";
  const planKey = JSON.stringify([selectedModel, root, view?.settings.revision]);
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
  const rootRef = useRef(""),
    rootDirty = useRef(false),
    refreshGeneration = useRef(0),
    sectionRef = useRef<HTMLElement>(null);

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
          prior = activeVerify[model.id],
          checked = prior && JSON.stringify(prior.snapshot) === JSON.stringify({ bindings: activeBindings, files: activeFiles }) ? prior : undefined,
          enabled = pathsReady && runtime.every((item) => item.ready) &&
            activeFiles.length > 0 && activeFiles.every((file) => file.state === "metadata-match") &&
            checked?.state !== "invalid" && checked?.state !== "missing",
          integrity = checked?.state === "verified" ? "校验通过"
            : checked?.state === "invalid" ? "未通过此版本清单校验"
            : checked?.state === "missing" ? "文件缺失"
            : activeFiles.length > 0 && activeFiles.every((file) => file.state === "metadata-match") ? "大小匹配，待校验"
            : activeFiles.some((file) => file.state === "size-mismatch") ? "大小与此版本清单不同"
            : "未校验";
        return {
          model,
          status,
          activeBindings,
          activeFiles,
          runtime,
          paths,
          pathsReady,
          pathsUnset,
          checked,
          integrity,
          enabled,
          adoptPath: adoptPaths[model.id] ??
            (status?.state === "missing" ? "" : status?.directory || ""),
        };
      }) || [],
    [view, adoptPaths, activeVerify],
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
      setVerify({});
    }
    await refreshModels(false);
    window.dispatchEvent(new Event("lightweaver-capabilities-changed"));
  };

  const act = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    try {
      await fn();
    } catch (error) {
      fail(error);
    } finally {
      setBusy("");
    }
  };

  const verifyActive = (id: string) => act(`校验当前模型 ${id}`, async () => {
    const result = await api(
      `/models/${encodeURIComponent(id)}/verify-active`,
      ActiveVerifyResult,
      { method: "POST" },
    );
    await refreshModels(false);
    setActiveVerify((current) => ({ ...current, [id]: result }));
  });

  const installModel = (id: string) => act(`准备 ${id}`, async () => {
    if (!view) return;
    const payload = { root, expectedRevision: view.settings.revision };
    const key = JSON.stringify(["model-install", id, payload]);
    const attempt = session.stableRequest(key);
    const submit = () => api(`/models/${encodeURIComponent(id)}/install`, RunRecord, {
      method: "POST", body: { ...payload, requestId: attempt.requestId },
    });
    let next: z.infer<typeof RunRecord>;
    try { next = await submit(); }
    catch (reason) { if (reason instanceof ApiError) throw reason; next = await submit(); }
    session.completeStableRequest(key, attempt);
    setRunId(next.id);
    setPollGeneration((value) => value + 1);
    setEvents([]);
    setDownloadsOpen(true);
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
    );

  return (
    <section ref={sectionRef} className="flex flex-col gap-5">
      <div><h2 className="m-0">模型与供应商</h2><p className="hint mb-0 mt-1">选择需要的本地模型，下载后自动校验并启用；所需运行组件由应用准备。也可以选择云端供应商。</p></div>

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
        <div className="grid">
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
        {!selection && <div className="section-title"><h3 className="m-0">本地模型</h3><small>按需下载，在本机处理</small></div>}
        <details className="panel-card model-root">
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
                  setVerify({});
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
                  setVerify({});
                  rootRef.current = picked;
                  setRoot(picked);
                })
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
        </details>

        {!selection && <div className="model-inventory-grid">
          {local.map(({ model, enabled }) => (
            <article key={model.id} className="panel-card model-inventory-card">
              <div className="model-inventory-head">
                <b title={model.name}>{model.name}</b>
                <Badge tone={enabled ? "ok" : "neutral"} dot>{enabled ? "已启用" : "待准备"}</Badge>
                <Button size="sm" aria-label={`选择 ${model.name}`} onClick={() => select({ kind: "local", id: model.id })}>管理模型</Button>
              </div>
              <small className="hint">{capabilityLabel[model.capability]} · 模型文件 {formatBytes(model.files.reduce((sum, file) => sum + file.size, 0))}</small>
            </article>
          ))}
        </div>}

        {selection?.kind === "local" && <div className="flex flex-col gap-4">
          {local.filter(({ model }) => model.id === selection.id).map(({ model, status, runtime, activeBindings, activeFiles, adoptPath, paths, pathsUnset, checked, integrity, enabled }) => {
            const downloadCheck = verify[model.id];
            return (
            <article key={model.id} className="panel-card flex flex-col gap-3 p-4">
              <div className="section-title items-start">
                <div className="flex-col !items-start gap-1">
                  <b>{model.name}</b>
                  <small>{capabilityLabel[model.capability]}{model.license ? ` · ${model.license}` : ""}</small>
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  <Badge tone={enabled ? "ok" : "neutral"} dot>{enabled ? "已启用" : "待准备"}</Badge>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <small className="mr-auto">应用会准备所需组件，完成后自动启用。</small>
                <Button size="sm" variant="ghost" onClick={onOpenJobs}>查看作业记录</Button>
              </div>
              {currentPlan ? <div className="subtle-card flex flex-col gap-2 p-4">
                <small>本次模型下载约 {formatBytes(currentPlan.modelBytes)}{currentPlan.dependencyBytes > 0 ? `，运行组件约 ${formatBytes(currentPlan.dependencyBytes)}` : "，无需额外下载运行组件"}。</small>
                {!currentPlan.available && <small className="error">{currentPlan.reason}</small>}
              </div> : <small className="hint">正在检查下载与兼容情况…</small>}
              <div className="actions">
                <Button variant="primary" disabled={!currentPlan?.available || !!busy || view.downloads.some((run) => run.kind === "model-setup" && ["queued", "running", "cancelling"].includes(run.state))}
                  onClick={() => void installModel(model.id)}>下载并启用</Button>
              </div>
              <details className="subtle-card p-4">
                <summary className="font-medium">高级：已有模型、文件校验与配置详情</summary>
                <div className="mt-3 flex flex-col gap-3">
              <div className="model-files">
                <b>当前生效配置</b>
                <small>文件完整性：{integrity}</small>
                {activeBindings.map((binding) => (
                  <small className="numeric" key={binding.setting}>
                    {binding.setting}：{binding.target === "literal" ? binding.value || "未指定" : binding.resolvedPath || "未指定"}
                    {binding.target !== "literal" ? ` · ${pathStateLabel[binding.state]}` : ""} · 来源 {binding.source}
                  </small>
                ))}
                {paths.some((binding) => binding.target === "directory") && <small>目录状态只表示路径存在，文件内容需另行校验。</small>}
              </div>
              <small>以下按 {model.repository}@{model.revision.slice(0, 12)} 的文件清单检查；其他模型版本可能使用不同文件。</small>
              {model.files.length ? (
                <div className="model-files">
                  {model.files.map((file, index) => {
                    const current = activeFiles[index];
                    const result = checked?.files[index];
                    return (
                      <small key={file.path}>
                        {file.path} · 清单大小 {file.size.toLocaleString()} B · {result
                          ? result.state === "verified" ? "SHA-256 校验通过" : result.reason || "未通过清单校验"
                          : activeFileLabel[current?.state || "unset"]}
                      </small>
                    );
                  })}
                </div>
              ) : (
                <small>{model.unavailableReason}</small>
              )}
              {runtime.length > 0 && (
                <div className="runtime-list">
                  {runtime.map((item) => (
                    <span className={`inline-flex items-center gap-2 ${item.ready ? "ok" : "missing"}`} key={item.setting}>
                      <span>{item.label}：{item.ready ? "路径已找到" : "路径缺失"}</span>
                      {item.documentationUrl && (
                        <Button size="sm" variant="ghost" type="button" onClick={() => void openLink(item.documentationUrl || "")}>
                          获取说明
                        </Button>
                      )}
                    </span>
                  ))}
                </div>
              )}
              <div className="actions">
                <Button
                  disabled={!model.available || pathsUnset || !!busy}
                  onClick={() => void verifyActive(model.id)}
                >
                  校验当前模型大小与 SHA-256
                </Button>
                <Button
                  variant="primary"
                  disabled={!model.available || !root || !!busy}
                  onClick={() =>
                    act(`下载 ${model.id}`, async () => {
                      const next = await api(
                        `/models/${encodeURIComponent(model.id)}/download`,
                        RunRecord,
                        {
                          method: "POST",
                          body: { root, requestId: requestId() },
                        },
                      );
                      setRunId(next.id);
                      setPollGeneration((value) => value + 1);
                      setEvents([]);
                      setDownloadsOpen(true);
                      notifyRunsChanged();
                      setView((current) =>
                        current
                          ? {
                              ...current,
                              downloads: [
                                next,
                                ...current.downloads.filter(
                                  (item) => item.id !== next.id,
                                ),
                              ],
                            }
                          : current,
                      );
                    })
                  }
                >
                  下载
                </Button>
                <Button
                  disabled={!model.available || !root || !!busy}
                  onClick={() =>
                    act(`校验 ${model.id}`, async () => {
                      const result = await api(
                        `/models/${encodeURIComponent(model.id)}/verify`,
                        VerifyResult,
                        { method: "POST", body: { root } },
                      );
                      setVerify((current) => ({ ...current, [model.id]: result }));
                      await refreshModels(false);
                    })
                  }
                >
                  校验下载目录大小与 SHA-256
                </Button>
              </div>
              {status && <details className="subtle-card p-3">
                <summary className="text-xs font-medium">下载目录状态 · {status.state === "unchecked" ? "文件大小匹配" : stateLabel[status.state]}</summary>
                <div className="mt-2 flex flex-col gap-1">
                  <small className="numeric">{status.directory}</small>
                  {model.files.map((file, index) => {
                    const current = status.files[index];
                    return <small key={file.path}>{file.path} · {current?.state === "metadata-match" ? "大小匹配" : stateLabel[current?.state || "missing"]}</small>;
                  })}
                  {downloadCheck && <small>本页上次校验（{new Date(downloadCheck.verifiedAt).toLocaleString()}）：{downloadCheck.state === "invalid" ? "未通过清单校验" : stateLabel[downloadCheck.state]}</small>}
                </div>
              </details>}
              <InputWithActions
                label="采用已有模型目录"
                value={adoptPath}
                onChange={(event) => setAdoptPaths((current) => ({ ...current, [model.id]: event.target.value }))}
                actions={<>
                  <Button type="button" onClick={() => void desktop()?.pickDirectory?.().then((picked) => {
                    if (picked) setAdoptPaths((current) => ({ ...current, [model.id]: picked }));
                  })}>选择目录</Button>
                  <Button type="button" onClick={() => void desktop()?.pickModelFile?.().then((picked) => {
                    if (picked) setAdoptPaths((current) => ({ ...current, [model.id]: picked }));
                  })}>选择文件</Button>
                </>}
              />
              <Button
                disabled={
                  !model.available ||
                  !adoptPath.trim() ||
                  !!busy
                }
                onClick={() =>
                  act(`采用 ${model.id}`, async () => {
                    await writeSettings(
                      `/models/${encodeURIComponent(model.id)}/adopt`,
                      "POST",
                      { path: adoptPath, expectedRevision: view.settings.revision },
                    );
                    await refreshModels(false);
                    window.dispatchEvent(new Event("lightweaver-capabilities-changed"));
                  })
                }
              >
                校验后采用
              </Button>
                </div>
              </details>
            </article>
            );
          })}
        </div>}
      </section>}

      <details className="downloads panel-card model-downloads" open={downloadsOpen} onToggle={(event) => setDownloadsOpen(event.currentTarget.open)}>
        <summary>
          <b>模型准备作业</b>
          <Badge>{view.downloads.length}</Badge>
          {view.downloads.some((item) => ["queued", "running", "cancelling"].includes(item.state)) && <small>有作业进行中</small>}
          {view.downloads.some((item) => ["failed", "interrupted"].includes(item.state)) && <small className="error">有作业失败或中断</small>}
        </summary>
        <div className="flex flex-col gap-3">
        {view.downloads.length === 0 && <p className="hint m-0">暂无模型准备作业。</p>}
        {view.downloads.map((item) => (
          <div className="download-row" key={item.id}>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="flex items-center gap-2">
                <b>{stateLabel[item.state]}</b>
                <small className="numeric">{item.id} · {item.updatedAt}</small>
              </div>
              {item.error && <small className="error" role="alert">{item.error.message}</small>}
              {runId === item.id && progress && ["queued", "running", "cancelling"].includes(item.state) && (
                <ProgressEvent event={progress.data} />
              )}
            </div>
            {["queued", "running", "cancelling"].includes(item.state) && (
              <Button
                size="sm"
                onClick={() =>
                  act("取消下载", async () => {
                    const next = await api(
                      `/runs/${item.id}/cancel`,
                      RunRecord,
                      { method: "POST" },
                    );
                    setRunId(next.id);
                    setPollGeneration((value) => value + 1);
                    notifyRunsChanged();
                  })
                }
              >
                取消
              </Button>
            )}
            {["failed", "partial", "cancelled", "interrupted"].includes(item.state) && (
              <Button
                size="sm"
                onClick={() =>
                  act("恢复下载", async () => {
                    if (item.kind === "model-setup" && item.error?.code === "CONFIG_CONFLICT") {
                      await refreshModels(false);
                      session.setNotice("模型设置已刷新，请重新点击“下载并启用”；已完成的下载会复用。");
                      return;
                    }
                    const next = await api(
                      `/runs/${item.id}/resume`,
                      RunRecord,
                      { method: "POST" },
                    );
                    setRunId(next.id);
                    setPollGeneration((value) => value + 1);
                    notifyRunsChanged();
                  })
                }
              >
                {item.kind === "model-setup" && item.error?.code === "CONFIG_CONFLICT" ? "刷新设置" : "重试"}
              </Button>
            )}
          </div>
        ))}
        </div>
      </details>
    </section>
  );
}
