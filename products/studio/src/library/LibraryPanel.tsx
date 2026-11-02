import { useEffect, useRef, useState } from "react";
import { LibraryVersion, ProviderDescriptor, RunRecord, z } from "@lightweaver/weaver/contracts";
import { api, mediaUrl, requestId } from "../api";
import { useSession } from "../session/context";
import { labels } from "../domain/format";
import { isActiveRun, RunDetail } from "../domain/run";
import { notifyRunsChanged } from "../jobs/useRunList";
import { Field } from "../ui/Field";
import { PageFrame } from "../ui/PageFrame";
import { AsyncRegion } from "../ui/AsyncRegion";
import { Button } from "../ui/Button";
import { Badge } from "../ui/Badge";
import { Dropzone } from "../ui/Dropzone";
import { Menu, MenuItem } from "../ui/Menu";
import { useAction } from "../ui/useAction";
import { useUndoable } from "../ui/useUndoable";
import { NativeSelect } from "../ui/NativeSelect";

const kindMeta = {
  voice: {
    title: "音色",
    description: "保存参考音频，或生成试听后收下音色。",
    emptyTitle: "尚无音色",
    emptyHint: "上传参考音频并填写参考文本，或在右侧生成试听。",
  },
  method: {
    title: "方法",
    description: "保存可复用的创作方法与适用条件。",
    emptyTitle: "尚无方法",
    emptyHint: "填写名称与方法说明后保存。",
  },
  material: {
    title: "素材库",
    description: "保存可在不同项目中使用的素材。",
    emptyTitle: "尚无素材",
    emptyHint: "选择素材文件后保存。",
  },
} as const;

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
  const saveAction = useAction();
  const acceptAction = useAction();
  const [acceptedRunId, setAcceptedRunId] = useState("");
  const [hiddenItems, setHiddenItems] = useState<string[]>([]);
  const undo = useUndoable();
  const removeItem = (value: z.infer<typeof LibraryVersion>) => {
    setHiddenItems((prev) => [...prev, value.itemId]);
    undo.schedule(value.itemId, () => {
      api(`/library/${value.itemId}`, z.unknown(), {
        method: "DELETE",
        body: { expectedVersion: value.version, requestId: requestId() },
      })
        .then(refresh)
        .catch((reason) => {
          setHiddenItems((prev) => prev.filter((id) => id !== value.itemId));
          fail(reason);
        });
    }, {
      onUndo: () => setHiddenItems((prev) => prev.filter((id) => id !== value.itemId)),
      notify: (options) => session.setNotice(`已删除库项「${value.payload.name}」`, options),
    });
  };
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
    formEpoch.current++;
    setStatus("");
    setAcceptedRunId("");
    setPurpose("design");
    setNeeds([]);
    setClipAudio("");
    setObserved(false);
    setSample("");
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
          if (isActiveRun(r.run.state))
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
    if (["提交中", "排队", "运行中", "取消中"].includes(status) || saveAction.pending || acceptAction.pending) return;
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
  const generating = ["提交中", "排队", "运行中", "取消中"].includes(status);
  const formPending = !!saveAction.pending || !!acceptAction.pending;
  const hasChanges = !!file || !selected || JSON.stringify(payload) !== JSON.stringify(selected.payload);
  const canSave = !!name.trim() && (!!file || !!payload) && hasChanges && !generating &&
    (kind !== "voice" || !!referenceText.trim());
  const canTranscribe = providers.some((provider) => provider.ready && provider.capabilities.includes("asr"));
  const canDesign = !!sample.trim() && providers.some((provider) => provider.id === voiceProvider &&
    provider.ready && provider.capabilities.includes("voice-design"));
  const save = async () => {
    if (!canSave) return;
    let saved: z.infer<typeof LibraryVersion>;
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
      saved = await api("/library/upload", LibraryVersion, { method: "POST", body });
    } else {
      if (!payload) throw Error("先选择文件");
      saved = await api("/library", LibraryVersion, {
        method: "POST",
        body: {
          itemId: selected?.itemId,
          expectedVersion: selected?.version || null,
          requestId: requestId(),
          payload,
        },
      });
    }
    if (generation === formEpoch.current) {
      setSelected(saved);
      setFile(null);
    }
    await refresh();
  };
  const cancelEdit = () => {
    formEpoch.current++;
    setStatus("");
    setRunId("");
    setResult(null);
    setAcceptedRunId("");
    setStyle("");
    setSample("");
    setNeeds([]);
    setClipAudio("");
    setObserved(false);
    setSelected(null);
    setName("");
    setReferenceText("");
    setDescription("");
    setFile(null);
  };
  const items = library.filter((v) => v.payload.kind === kind && !hiddenItems.includes(v.itemId));
  const meta = kindMeta[kind];
  return (
    <PageFrame
      title={meta.title}
      description={meta.description}
      actions={<Badge tone="accent">{items.length} 个库项</Badge>}
      scroll={false}
    >
      <div className="split-page grid min-h-0 flex-1 grid-cols-[minmax(280px,380px)_minmax(0,1fr)]">
        <section className="scroll-region border-r border-line p-3">
          <AsyncRegion
            state={session.listsStatus}
            error={session.listsError}
            onRetry={() => void session.refreshLists().catch(() => {})}
            empty={
              items.length === 0 ? (
                <div className="subtle-card p-6 text-center">
                  <b>{meta.emptyTitle}</b>
                  <p className="hint mx-auto mt-1 mb-0 text-xs">{meta.emptyHint}</p>
                </div>
              ) : null
            }
          >
          {items.map((v) => (
            <article className={`panel-card mb-2 p-3 ${selected?.itemId === v.itemId ? "border-accent bg-accent-soft" : ""}`} key={v.itemId}>
              <div className="section-title">
                <b className="min-w-0 truncate">{v.payload.name}</b>
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    disabled={formPending || selected?.itemId === v.itemId}
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
                    {selected?.itemId === v.itemId ? "编辑中" : "编辑"}
                  </Button>
                  <Menu label="更多">
                    <MenuItem disabled={formPending} onSelect={() => removeItem(v)}>删除…</MenuItem>
                  </Menu>
                </div>
              </div>
              <small className="numeric mt-1 block">版本 {v.version.slice(0, 12)}</small>
              {v.payload.kind === "voice" && (
                <audio className="mt-2 w-full" controls src={mediaUrl(v.payload.reference)} />
              )}
            </article>
          ))}
          </AsyncRegion>
        </section>
        <section className="flex min-h-0 min-w-0 flex-col">
          <fieldset disabled={formPending} className="m-0 flex min-h-0 min-w-0 flex-1 flex-col border-0 p-0">
          <div className="scroll-region flex-1 p-5">
          <div className="narrow-content flex flex-col gap-5">
            <div className="panel-card flex flex-col gap-4 p-5">
              <div className="section-title">
                <h2 className="m-0">{selected ? hasChanges ? "编辑内容" : "已保存内容" : kind === "material" ? "新增素材" : `新建${meta.title}`}</h2>
                {selected && <Badge tone="accent">正在编辑 {selected.payload.name}</Badge>}
              </div>
          <Field label="名称" required>
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          {kind === "voice" && (
            <Field label="语音提供方">
              <NativeSelect
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
              </NativeSelect>
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
                <NativeSelect
                  value={clipAudio}
                  onChange={(e) => setClipAudio(e.target.value)}
                >
                  <option value="">不限制</option>
                  <option value="original">原声</option>
                  <option value="narration">旁白</option>
                  <option value="mix">混音</option>
                </NativeSelect>
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
              disabled={formPending}
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
            <Field label="参考文本" required hint="填写参考音频中实际说出的内容，也可自动转写。">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  aria-label={referenceText.trim() ? "重新转写参考音频" : "转写参考音频"}
                  disabled={generating || !canTranscribe || (!file && selected?.payload.kind !== "voice")}
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
                  {purpose === "transcribe" && generating ? "转写中…" : referenceText.trim() ? "重新转写参考音频" : "转写参考音频"}
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
                  disabled={generating || !canDesign}
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
                  {purpose === "design" && generating ? "生成中…" : preview.success ? "重新生成试听" : "生成试听"}
                </Button>
              </div>
              {purpose === "design" && preview.success && status === labels.succeeded && (
                <div className="subtle-card flex flex-col gap-3 p-3">
                  <audio className="w-full" controls src={mediaUrl(preview.data.digest)} />
                  <div className="actions">
                    {acceptedRunId === runId ? <Badge tone="ok" dot>已保存为音色</Badge> : <Button
                      variant="primary"
                      onClick={() => void acceptAction.run("accept", async () => {
                        const generation = formEpoch.current, accepted = runId;
                        try {
                          const saved = await api("/voice/accept", LibraryVersion, {
                            method: "POST", body: {runId: accepted, name: name || "新音色", expectedVersion: null, requestId: requestId()},
                          });
                          if (generation === formEpoch.current && saved.payload.kind === "voice") {
                            setAcceptedRunId(accepted);
                            setSelected(saved);
                            setName(saved.payload.name);
                            setReferenceText(saved.payload.referenceText);
                            setVoiceProvider(saved.payload.provider);
                            setStyle(saved.payload.style);
                            setFile(null);
                          }
                          await refresh();
                        } catch (error) { fail(error); }
                      })}
                    >
                      {acceptAction.pending ? "保存中…" : "保存为音色"}
                    </Button>}
                  </div>
                </div>
              )}
            </div>
          )}
          </div>
          </div>
          <div className="shrink-0 border-t border-line bg-panel px-5 py-3">
            <div className="narrow-content flex flex-wrap items-center justify-end gap-2">
              {generating && (
                <small className="hint mr-auto text-xs">试听或转写作业运行中，完成前不能保存。</small>
              )}
              {selected && (
                <Button variant="ghost" onClick={cancelEdit}>
                  {hasChanges ? "取消编辑" : kind === "material" ? "新增素材" : `新建${meta.title}`}
                </Button>
              )}
              <Button
                variant="primary"
                disabled={formPending || !canSave}
                onClick={() => void saveAction.run("save", async () => { await save().catch(fail); })}
              >
                {saveAction.isPending("save") ? "保存中…" : selected ? hasChanges ? "保存修改" : "已保存" : "保存"}
              </Button>
            </div>
          </div>
          </fieldset>
        </section>
      </div>
    </PageFrame>
  );
}
