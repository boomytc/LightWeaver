import { useEffect, useId, useRef, useState } from "react";
import { LibraryVersion, ProviderDescriptor, RunRecord, z } from "@lightweaver/weaver/contracts";
import { api, ApiError, mediaUrl, requestId } from "../api";
import { useSession } from "../session/context";
import { isActiveRun, RunDetail } from "../domain/run";
import { notifyRunsChanged } from "../jobs/useRunList";
import { Field } from "../ui/Field";
import { PageFrame } from "../ui/PageFrame";
import { AsyncRegion } from "../ui/AsyncRegion";
import { Button } from "../ui/Button";
import { Badge } from "../ui/Badge";
import { RunStatus } from "../ui/RunStatus";
import { Dropzone } from "../ui/Dropzone";
import { Menu, MenuItem } from "../ui/Menu";
import { useAction } from "../ui/useAction";
import { useRunStream } from "../jobs/useRunStream";
import { NativeSelect } from "../ui/NativeSelect";

const kindMeta = {
  voice: {
    title: "音色",
    description: "保存参考音频，或生成试听后保存为新音色。",
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
  const referenceTextId = useId();
  const saveAction = useAction();
  const acceptAction = useAction();
  const runAction = useAction();
  const deleteAction = useAction();
  const [acceptedRunId, setAcceptedRunId] = useState("");
  const [selected, setSelected] = useState<z.infer<
      typeof LibraryVersion
    > | null>(null),
    [name, setName] = useState(""),
    [referenceText, setReferenceText] = useState(""),
    [description, setDescription] = useState(""),
    [file, setFile] = useState<File | null>(null),
    [style, setStyle] = useState(""),
    [sample, setSample] = useState(""),
    [detail, setDetail] = useState<z.infer<typeof RunDetail> | null>(null),
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
  useEffect(() => () => { formEpoch.current++; }, []);
  const run = detail?.run;
  const runId = run?.id || "";
  const result = detail?.nodes[0]?.result;
  const runStatus = runAction.pending ? <Badge tone="accent">提交中</Badge> : run ? <RunStatus state={run.state} dot /> : null;
  const generating = !!runAction.pending || !!run && isActiveRun(run.state);
  const stream = useRunStream({
    runId,
    onDetail: (next) => {
      if (next.run.id !== runId) return;
      setDetail(next);
      if (next.run.state === "succeeded" && purpose === "transcribe")
        setReferenceText(z.object({ text: z.string() }).parse(next.nodes[0]?.result).text);
      if (!isActiveRun(next.run.state)) notifyRunsChanged();
    },
  });
  const preview = z.object({ digest: z.string(), text: z.string() }).safeParse(result);
  const clearRun = () => {
    formEpoch.current++;
    setDetail(null);
    setAcceptedRunId("");
  };
  const startRun = (url: string, body: FormData | Record<string, string | undefined>, purpose: "design" | "transcribe") =>
    void runAction.run(purpose, async () => {
      if (generating || saveAction.pending || acceptAction.pending || deleteAction.pending) return;
      const generation = formEpoch.current;
      const fields = body instanceof FormData ? [...body.entries()] : Object.entries(body);
      const key = JSON.stringify(["voice-run", url, generation, fields.filter(([name]) => name !== "requestId")
        .map(([name, value]) => [name, value instanceof File ? [value.name, value.size, value.lastModified] : value])]);
      const attempt = session.stableRequest(key);
      if (body instanceof FormData) body.set("requestId", attempt.requestId);
      else body = { ...body, requestId: attempt.requestId };
      const send = () => api(url, RunRecord, { method: "POST", body });
      setDetail(null);
      setAcceptedRunId("");
      setPurpose(purpose);
      try {
        let next: z.infer<typeof RunRecord>;
        try { next = await send(); }
        catch (error) { if (error instanceof ApiError) throw error; next = await send(); }
        session.completeStableRequest(key, attempt);
        notifyRunsChanged();
        if (generation === formEpoch.current) setDetail({ run: next, nodes: [] });
      } catch (error) {
        if (generation === formEpoch.current) fail(error);
      }
    });
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
  const formPending = !!saveAction.pending || !!acceptAction.pending || !!deleteAction.pending;
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
  const editItem = (value: z.infer<typeof LibraryVersion> | null) => {
    clearRun();
    const payload = value?.payload;
    setSelected(value);
    setName(payload?.name || "");
    setFile(null);
    setReferenceText(payload?.kind === "voice" ? payload.referenceText : "");
    setStyle(payload?.kind === "voice" ? payload.style : "");
    setVoiceProvider(payload?.kind === "voice" ? payload.provider : "modelbest-voxcpm2");
    setSample("");
    setPurpose("design");
    setDescription(payload?.kind === "method" ? payload.description : "");
    setNeeds(payload?.kind === "method" ? payload.needs : []);
    setClipAudio(payload?.kind === "method" ? payload.clipAudio || "" : "");
    setObserved(payload?.kind === "method" && !!payload.clipAlignment);
  };
  const removeItem = (value: z.infer<typeof LibraryVersion>) => void deleteAction.run(value.itemId, async () => {
    const generation = formEpoch.current;
    const key = JSON.stringify(["library-delete", value.itemId, value.version]);
    const attempt = session.stableRequest(key);
    const remove = () => api(`/library/${value.itemId}`, z.unknown(), {
      method: "DELETE", body: { expectedVersion: value.version, requestId: attempt.requestId },
    });
    try {
      try { await remove(); }
      catch (error) { if (error instanceof ApiError) throw error; await remove(); }
      session.completeStableRequest(key, attempt);
      if (generation === formEpoch.current && selected?.itemId === value.itemId) editItem(null);
      const restore = { itemId: value.itemId, expectedVersion: value.version, payload: value.payload, requestId: requestId() };
      session.setNotice(`已删除「${value.payload.name}」`, {
        actionLabel: "撤销",
        onAction: () => void api("/library", LibraryVersion, { method: "POST", body: restore }).then(refresh).catch(fail),
      });
      await refresh();
    } catch (error) { fail(error); }
  });
  const items = library.filter((value) => value.payload.kind === kind);
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
                    disabled={formPending || generating || selected?.itemId === v.itemId}
                    onClick={() => editItem(v)}
                  >
                    {selected?.itemId === v.itemId ? "编辑中" : "编辑"}
                  </Button>
                  <Menu label="更多">
                    <MenuItem disabled={formPending || generating} onSelect={() => removeItem(v)}>{deleteAction.isPending(v.itemId) ? "删除中…" : "删除"}</MenuItem>
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
                <h2 className="m-0">{selected ? selected.payload.name : kind === "material" ? "新增素材" : `新建${meta.title}`}</h2>
                {selected && <Badge tone={hasChanges ? "warn" : "ok"} dot>{hasChanges ? "未保存" : "已保存"}</Badge>}
              </div>
          <Field label="名称" required>
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          {kind === "voice" && (
            <Field label="语音提供方">
              <NativeSelect
                value={voiceProvider}
                disabled={generating}
                onChange={(event) => { clearRun(); setVoiceProvider(event.target.value); }}
              >
                {providers.filter((provider) => provider.capabilities.includes("tts")).map((provider) => (
                  <option key={provider.id} value={provider.id}>{provider.name}{provider.ready ? "" : " · 未配置"}</option>
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
              disabled={formPending || generating}
              title={file?.name || "拖入或选择库文件"}
              description={kind === "voice" ? "选择音色参考音频" : "选择可复用素材文件"}
              onFiles={(files) => {
                clearRun();
                setFile(files[0] || null);
              }}
            />
          )}{" "}
          {kind === "voice" && (
            <Field label="参考文本" htmlFor={referenceTextId} required hint="填写参考音频中实际说出的内容，也可自动转写。">
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
                        };
                    if (body instanceof FormData && file) {
                      body.append("file", file);
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
                {purpose === "transcribe" && runStatus}
              </div>
              <textarea
                id={referenceTextId}
                aria-label="参考文本"
                value={referenceText}
                disabled={generating}
                onChange={(e) => {
                  if (purpose === "transcribe") {
                    clearRun();
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
                {purpose === "design" && runStatus}
              </div>
              <Field label="声音描述">
                <textarea
                  value={style}
                  disabled={generating}
                  onChange={(e) => { clearRun(); setStyle(e.target.value); }}
                />
              </Field>
              <Field label="试听文案">
                <textarea
                  value={sample}
                  disabled={generating}
                  onChange={(e) => { clearRun(); setSample(e.target.value); }}
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
                      },
                      "design",
                    )
                  }
                >
                  {purpose === "design" && generating ? "生成中…" : preview.success ? "重新生成试听" : "生成试听"}
                </Button>
              </div>
              {purpose === "design" && preview.success && run?.state === "succeeded" && (
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
                      {acceptAction.pending ? "保存中…" : "保存为新音色"}
                    </Button>}
                  </div>
                </div>
              )}
            </div>
          )}
          </div>
          </div>
          {stream.error && <div className="actions px-5 py-2"><small className="error">暂时无法读取任务进度。</small><Button size="sm" onClick={stream.retry}>重试连接</Button></div>}
          {run?.error && <p className="error m-0 px-5 py-2">{run.error.message}</p>}
          <div className="shrink-0 border-t border-line bg-panel px-5 py-3">
            <div className="narrow-content flex flex-wrap items-center justify-end gap-2">
              {generating && (
                <small className="hint mr-auto text-xs">任务完成后可保存。</small>
              )}
              {selected && (
                <Button variant="ghost" disabled={generating} onClick={() => editItem(null)}>
                  {hasChanges ? "取消编辑" : kind === "material" ? "新增素材" : `新建${meta.title}`}
                </Button>
              )}
              {(!selected || hasChanges) && <Button
                variant="primary"
                disabled={formPending || !canSave}
                onClick={() => void saveAction.run("save", async () => { await save().catch(fail); })}
              >
                {saveAction.isPending("save") ? "保存中…" : selected ? "保存修改" : "保存"}
              </Button>}
            </div>
          </div>
          </fieldset>
        </section>
      </div>
    </PageFrame>
  );
}
