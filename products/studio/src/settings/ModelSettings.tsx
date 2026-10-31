import { useEffect, useMemo, useRef, useState } from "react";
import {
  z,
  ModelSettingsView,
  ModelsView,
  RunRecord,
  VerifyResult,
  EventRecord,
} from "@lightweaver/weaver/contracts";
import { api, requestId } from "../api";
import { desktop, openLink } from "../desktop";

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
  running: "下载中",
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

function ProgressEvent({ event }: { event: unknown }) {
  const parsed = z
    .object({
      modelId: z.string().optional(),
      file: z.string().optional(),
      received: z.number().optional(),
      total: z.number().optional(),
      completedFiles: z.number().optional(),
      totalFiles: z.number().optional(),
    })
    .safeParse(event);
  if (!parsed.success) return null;
  const value = parsed.data;
  return (
    <small>
      {value.file || value.modelId || "模型"}
      {value.received !== undefined && value.total
        ? ` · ${Math.floor((value.received / value.total) * 100)}%`
        : value.completedFiles !== undefined
          ? ` · ${value.completedFiles}/${value.totalFiles || "?"} 个文件`
          : ""}
    </small>
  );
}

export function ModelSettings({
  fail,
  onOpenRuntime,
  onOpenJobs,
}: {
  fail: (error: unknown) => void;
  onOpenRuntime: () => void;
  onOpenJobs: () => void;
}) {
  const [view, setView] = useState<z.infer<typeof ModelsView> | null>(null),
    [root, setRoot] = useState(""),
    [apiKey, setApiKey] = useState(""),
    [adoptPaths, setAdoptPaths] = useState<Record<string, string>>({}),
    [runId, setRunId] = useState(""),
    [events, setEvents] = useState<z.infer<typeof EventRecord>[]>([]),
    [verify, setVerify] = useState<Partial<Record<string, z.infer<typeof VerifyResult>>>>({}),
    [busy, setBusy] = useState(""),
    [pollGeneration, setPollGeneration] = useState(0);
  const rootRef = useRef(""),
    rootDirty = useRef(false);

  const refreshModels = async (resetRoot: boolean, signal?: AbortSignal) => {
    const requestedRoot = rootRef.current,
      query = requestedRoot ? `?root=${encodeURIComponent(requestedRoot)}` : "";
    const next = await api(`/models${query}`, ModelsView, { signal });
    if (signal?.aborted || rootRef.current !== requestedRoot) return next;
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
          await refreshModels(false, controller.signal);
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
          status = current?.status;
        return {
          model,
          status,
          activeBindings: current?.activeBindings || [],
          runtime: current?.runtime || [],
          adoptPath: adoptPaths[model.id] ??
            (status?.state === "missing" ? "" : status?.directory || ""),
        };
      }) || [],
    [view, adoptPaths],
  );

  const saveSettings = async (patch: Record<string, unknown>) => {
    if (!view) return;
    const submittedRoot =
      typeof patch.downloadRoot === "string" ? patch.downloadRoot : undefined;
    const saved = await api("/models/settings", ModelSettingsView, {
      method: "PUT",
      body: {
        expectedRevision: view.settings.revision,
        ...patch,
      },
    });
    setApiKey("");
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

  if (!view) return <main className="models"><p>加载模型设置…</p></main>;
  const provider = view.catalog.providers[0],
    progress = [...events].reverse().find((event) =>
      event.runId === runId && event.type === "model-download-progress",
    );

  return (
    <main className="models">
      <h1>模型</h1>
      <p>供应商和本地权重分开配置。下载、校验、采用是三个显式操作。</p>

      <section className="model-provider">
        <div className="section-title">
          <div>
            <h2>{provider.name}</h2>
            <span className={`model-state ${provider.apiKeyConfigured ? "ready" : ""}`}>
              {provider.apiKeyConfigured ? "密钥已配置" : "密钥未配置"}
            </span>
          </div>
          <div>
            <button type="button" onClick={() => void openLink(provider.keyUrl)}>获取 Key</button>
            <button type="button" onClick={() => void openLink(provider.docsUrl)}>查看文档</button>
          </div>
        </div>
        <div className="grid">
          {provider.models.map((model) => (
            <article key={model.id}>
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
        <button
          disabled={!!busy}
          onClick={() =>
            act("采用 ModelBest 预设", async () => {
              await api(
                `/models/providers/modelbest/adopt`,
                ModelSettingsView,
                {
                  method: "POST",
                  body: { expectedRevision: view.settings.revision },
                },
              );
              await refreshModels(false);
              window.dispatchEvent(new Event("lightweaver-capabilities-changed"));
            })
          }
        >
          采用 ModelBest 预设
        </button>
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
              当前来源：{view.settings.apiKeys.modelbest.source}。环境变量{" "}
              {provider.apiKeyEnv} 优先。密钥不会回显或写入浏览器存储。
            </small>
          </label>
          <button
            className="primary"
            disabled={!apiKey || !!busy}
            onClick={() =>
              act("保存密钥", () => saveSettings({ modelbestApiKey: apiKey }))
            }
          >
            保存密钥
          </button>
          <button
            disabled={!provider.apiKeyConfigured || !!busy}
            onClick={() =>
              act("清除密钥", () =>
                saveSettings({ clearModelbestApiKey: true }),
              )
            }
          >
            清除文件中的密钥
          </button>
        </div>
      </section>

      <section>
        <h2>本地模型</h2>
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
          <button
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
          </button>
          <button
            disabled={!root || !!busy}
            onClick={() =>
              act("保存路径", () => saveSettings({ downloadRoot: root }))
            }
          >
            保存下载路径
          </button>
        </div>

        <div className="flex flex-col gap-4">
          {local.map(({ model, status, runtime, activeBindings, adoptPath }) => (
            <article key={model.id} className="rounded-lg border border-line bg-panel p-3">
              <div className="section-title">
                <div>
                  <b>{model.name}</b>
                  <small>
                    {model.capability} · {model.platform}
                    {model.license ? ` · ${model.license}` : ""}
                  </small>
                </div>
                <div className="flex min-w-48 flex-col gap-1 text-sm">
                  <small>文件：{status && status.state !== "missing" ? "已存在" : "不存在"}</small>
                  <small>
                    完整性：{stateLabel[verify[model.id]?.state || (status?.state === "invalid" ? "invalid" : "unchecked")]}
                  </small>
                  <small>
                    运行时：{runtime.length === 0 ? "无额外条件" : runtime.every((item) => item.ready) ? "条件已满足" : "有缺失"}
                    {runtime.some((item) => !item.ready) && (
                      <button type="button" onClick={onOpenRuntime}>打开运行时设置</button>
                    )}
                  </small>
                  <small>推理结果以实际作业为准，文件校验不会调用模型。<button type="button" onClick={onOpenJobs}>查看作业记录</button></small>
                </div>
              </div>
              <small>{model.repository}@{model.revision.slice(0, 12)}</small>
              {model.files.length ? (
                <div className="model-files">
                  {model.files.map((file, index) => {
                    const current = verify[model.id]?.files[index] || status?.files[index];
                    return (
                      <small key={file.path}>
                        {file.path} · {file.size.toLocaleString()} B ·{" "}
                        {stateLabel[
                          current?.state === "metadata-match"
                            ? "unchecked"
                            : current?.state || "missing"
                        ]}
                      </small>
                    );
                  })}
                </div>
              ) : (
                <small>{model.unavailableReason}</small>
              )}
              <details>
                <summary>当前生效配置</summary>
                {activeBindings.map((binding) => (
                  <small key={binding.setting}>
                    {binding.setting}：{binding.value || "未指定"} · 来源 {binding.source}
                  </small>
                ))}
              </details>
              {runtime.length > 0 && (
                <div className="runtime-list">
                  {runtime.map((item) => (
                    <span className={item.ready ? "ok" : "missing"} key={item.setting}>
                      {item.label}：{item.ready ? "路径已找到" : "路径缺失"}
                      {item.documentationUrl && (
                        <>
                          {" "}
                          <button type="button" onClick={() => void openLink(item.documentationUrl || "")}>
                            获取说明
                          </button>
                        </>
                      )}
                    </span>
                  ))}
                </div>
              )}
              <div className="actions">
                <button
                  className="primary"
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
                </button>
                <button
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
                  校验大小与 SHA-256
                </button>
              </div>
              <label className="field">
                <span>采用已有模型目录</span>
                <input
                  value={adoptPath}
                  onChange={(event) =>
                    setAdoptPaths((current) => ({
                      ...current,
                      [model.id]: event.target.value,
                    }))
                  }
                />
              </label>
              <div className="actions">
                <button
                  type="button"
                  onClick={() =>
                    void desktop()?.pickDirectory?.().then((picked) => {
                      if (!picked) return;
                      setAdoptPaths((current) => ({ ...current, [model.id]: picked }));
                    })
                  }
                >
                  选择目录
                </button>
                <button
                  type="button"
                  onClick={() =>
                    void desktop()?.pickModelFile?.().then((picked) => {
                      if (!picked) return;
                      setAdoptPaths((current) => ({ ...current, [model.id]: picked }));
                    })
                  }
                >
                  选择文件
                </button>
              </div>
              {model.id === "qwen3-forced-aligner" && (
                <details>
                  <summary>高级说明</summary>
                  <p>
                    ForcedAligner 默认后端是 torch，设备是 cpu。MLX 只在这里说明，不作为默认下载或推理路径。独立重排和说话人区分不进入默认流程。
                  </p>
                </details>
              )}
              <button
                disabled={
                  !model.available ||
                  !adoptPath.trim() ||
                  !!busy
                }
                onClick={() =>
                  act(`采用 ${model.id}`, async () => {
                    await api(
                      `/models/${encodeURIComponent(model.id)}/adopt`,
                      ModelSettingsView,
                      {
                        method: "POST",
                        body: {
                          path: adoptPath,
                        },
                      },
                    );
                    await refreshModels(false);
                    window.dispatchEvent(new Event("lightweaver-capabilities-changed"));
                  })
                }
              >
                校验后采用
              </button>
            </article>
          ))}
        </div>
      </section>

      <section className="downloads">
        <h2>下载作业</h2>
        {view.downloads.length === 0 && <p>暂无下载作业。</p>}
        {view.downloads.map((item) => (
          <div className="download-row" key={item.id}>
            <div>
              <b>{stateLabel[item.state]}</b>
              <small>
                {item.id} · {item.updatedAt}
              </small>
              {item.error && <small role="alert">{item.error.message}</small>}
              {runId === item.id && progress && (
                <ProgressEvent event={progress.data} />
              )}
            </div>
            {["queued", "running", "cancelling"].includes(item.state) && (
              <button
                onClick={() =>
                  act("取消下载", async () => {
                    const next = await api(
                      `/runs/${item.id}/cancel`,
                      RunRecord,
                      { method: "POST" },
                    );
                    setRunId(next.id);
                    setPollGeneration((value) => value + 1);
                  })
                }
              >
                取消
              </button>
            )}
            {["failed", "cancelled", "interrupted"].includes(item.state) && (
              <button
                onClick={() =>
                  act("恢复下载", async () => {
                    const next = await api(
                      `/runs/${item.id}/resume`,
                      RunRecord,
                      { method: "POST" },
                    );
                    setRunId(next.id);
                    setPollGeneration((value) => value + 1);
                  })
                }
              >
                重试
              </button>
            )}
          </div>
        ))}
      </section>
    </main>
  );
}
