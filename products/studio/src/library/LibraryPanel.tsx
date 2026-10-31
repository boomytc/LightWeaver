import { useEffect, useRef, useState } from "react";
import { LibraryVersion, ProviderDescriptor, RunRecord, z } from "@lightweaver/weaver/contracts";
import { api, mediaUrl, requestId } from "../api";
import { labels } from "../domain/format";
import { RunDetail } from "../domain/run";
import { Field } from "../ui/Field";

export function LibraryPanel({
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
    const onImport = (event: Event) => {
      const input = document.querySelector<HTMLInputElement>('input[aria-label="上传库文件"]');
      if (!input) return;
      event.preventDefault();
      input.click();
    };
    window.addEventListener("lightweaver-import", onImport);
    return () => window.removeEventListener("lightweaver-import", onImport);
  }, []);
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
