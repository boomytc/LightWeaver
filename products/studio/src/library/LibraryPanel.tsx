import { useEffect, useRef, useState } from "react";
import { LibraryVersion, ProviderDescriptor, RunRecord, z } from "@lightweaver/weaver/contracts";
import { api, mediaUrl, requestId } from "../api";
import { useSession } from "../session/context";
import { labels } from "../domain/format";
import { RunDetail } from "../domain/run";
import { notifyRunsChanged } from "../jobs/useRunList";
import { Field } from "../ui/Field";
import { PageHeader } from "../ui/PageHeader";
import { ListSkeleton } from "../ui/Skeleton";
import { Button } from "../ui/Button";
import { Badge } from "../ui/Badge";
import { Dropzone } from "../ui/Dropzone";

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
  const session = useSession();
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
          else {
            notifyRunsChanged();
            if (r.run.error) fail(new Error(r.run.error.message));
          }
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
        notifyRunsChanged();
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
  const items = library.filter((v) => v.payload.kind === kind);
  return (
    <main className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        title={kind === "voice" ? "音色" : kind === "method" ? "方法" : "素材库"}
        description="项目绑定精确版本。编辑发布新版本；删除只隐藏当前库项，历史引用继续有效。"
        actions={<Badge tone="accent">{items.length} 个库项</Badge>}
      />
      <div className="split-page grid min-h-0 flex-1 grid-cols-[minmax(280px,380px)_minmax(0,1fr)]">
        <section className="scroll-region border-r border-line p-3">
          {session.listsStatus === "loading" && <ListSkeleton rows={4} />}
          {session.listsStatus === "failed" && (
            <div className="subtle-card mb-2 flex flex-col gap-2 p-3">
              <b>库项读取失败</b>
              <small className="hint">{session.listsError || "无法读取库项，请重试。"}</small>
              <div className="actions">
                <Button size="sm" onClick={() => void session.refreshLists().catch(() => {})}>重试</Button>
              </div>
            </div>
          )}
          {session.listsStatus === "ready" && items.length === 0 && (
            <div className="subtle-card p-6 text-center">
              <b>尚无库项</b>
              <p className="hint mx-auto mt-1 mb-0 text-xs">在右侧填写信息并保存，即可发布首个可复用版本。</p>
            </div>
          )}
          {items.map((v) => (
            <article className={`panel-card mb-2 p-3 ${selected?.itemId === v.itemId ? "border-accent bg-accent-soft" : ""}`} key={v.itemId}>
              <div className="section-title">
                <b className="min-w-0 truncate">{v.payload.name}</b>
                <div>
                  <Button
                    size="sm"
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
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
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
                  </Button>
                </div>
              </div>
              <small className="numeric mt-1 block">版本 {v.version.slice(0, 12)}</small>
              {v.payload.kind === "voice" && (
                <audio className="mt-2 w-full" controls src={mediaUrl(v.payload.reference)} />
              )}
            </article>
          ))}
        </section>
        <section className="scroll-region p-5">
          <div className="narrow-content flex flex-col gap-5">
            <div className="panel-card flex flex-col gap-4 p-5">
              <div className="section-title">
                <h2 className="m-0">{selected ? "发布新版本" : "新建库项"}</h2>
                {selected && <Badge tone="accent">正在编辑 {selected.payload.name}</Badge>}
              </div>
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
            <Dropzone
              inputAriaLabel="上传库文件"
              title={file?.name || "拖入或选择库文件"}
              description={kind === "voice" ? "选择音色参考音频" : "选择可复用素材文件"}
              onFiles={(files) => {
                formEpoch.current++;
                setRunId("");
                setResult(null);
                setStatus("");
                setFile(files[0] || null);
              }}
            />
          )}{" "}
          {kind === "voice" && (
            <Field label="克隆源的实际参考文本">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
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
                </Button>
                {purpose === "transcribe" && status && <Badge tone="accent">{status}</Badge>}
              </div>
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
          <div className="actions">
            <Button
              variant="primary"
              disabled={["提交中", "排队", "运行中"].includes(status)}
              onClick={() => save().catch(fail)}
            >
              保存版本
            </Button>
            {selected && (
              <Button
                variant="ghost"
                onClick={() => {
                  formEpoch.current++;
                  setSelected(null);
                  setName("");
                  setReferenceText("");
                  setDescription("");
                  setFile(null);
                }}
              >
                取消编辑
              </Button>
            )}
          </div>
          </div>
          {kind === "voice" && (
            <div className="panel-card flex flex-col gap-4 p-5">
              <div className="section-title">
                <h2 className="m-0">设计试听</h2>
                {purpose === "design" && status && <Badge tone="accent">{status}</Badge>}
              </div>
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
              <div className="actions">
                <Button
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
                </Button>
              </div>
              {purpose === "design" && preview.success && (
                <div className="subtle-card flex flex-col gap-3 p-3">
                  <audio className="w-full" controls src={mediaUrl(preview.data.digest)} />
                  <div className="actions">
                    <Button
                      variant="primary"
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
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
          </div>
        </section>
      </div>
    </main>
  );
}
