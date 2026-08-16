import { useEffect, useRef, useState } from "react";
import { api, candidateMedia, libraryMedia, type ModelbestStatus } from "../api";
import { useFlash } from "../lib/flash";
import { listVoicePacks, voiceCloneSource, type VoiceOrigin } from "../lib/voices";
import { IconUpload } from "../icons";
import { MODELBEST_URL } from "../lib/prefs";
import type { Asset } from "../types";

const TRIAL = "先把名称、场景和规则说清楚，再动手做交互。";

type Candidate = { rel: string; seconds: number; text: string; style: string; asr?: boolean };

export function Voices() {
  const [library, setLibrary] = useState<Asset[]>([]);
  const [error, setError] = useState<string>();
  const [message, setMessage] = useFlash();
  const [label, setLabel] = useState("");
  const [how, setHow] = useState<VoiceOrigin>("instruct");
  const [said, setSaid] = useState("");
  const [instruct, setInstruct] = useState("");
  const [trial, setTrial] = useState(TRIAL);
  const [denoise, setDenoise] = useState(true);
  const [doNormalize, setDoNormalize] = useState(true);
  const [cfgValue, setCfgValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [candidate, setCandidate] = useState<Candidate>();
  const [modelbest, setModelbest] = useState<ModelbestStatus>();
  const [probing, setProbing] = useState(false);
  const [probe, setProbe] = useState<{ ok: boolean; message: string }>();

  const packs = listVoicePacks(library);
  const canMint = Boolean(modelbest?.configured);

  async function reload() {
    const [nextLibrary, nextModelbest] = await Promise.all([api.library(), api.modelbest()]);
    setLibrary(nextLibrary);
    setModelbest(nextModelbest);
    setProbe(nextModelbest.probe);
  }

  useEffect(() => {
    reload().catch((err: Error) => setError(err.message));
  }, []);

  async function testLink() {
    setProbing(true);
    try {
      setProbe(await api.probeModelbest());
    } catch (err) {
      setProbe({ ok: false, message: err instanceof Error ? err.message : String(err) });
    } finally {
      setProbing(false);
    }
  }

  function taken(name: string): boolean {
    return packs.some((asset) => (asset.label ?? asset.id).trim() === name);
  }

  function resetCreate() {
    setLabel("");
    setSaid("");
    setInstruct("");
    setTrial(TRIAL);
    setCandidate(undefined);
  }

  function keepName(): string | undefined {
    const name = label.trim();
    if (!name) {
      setError("先写名称再保存");
      return;
    }
    if (taken(name)) {
      setError(`${name} 已在音色库里`);
      return;
    }
    return name;
  }

  async function mint() {
    if (!instruct.trim()) {
      setError("设计指令要先写一段描述");
      return;
    }
    if (!canMint) {
      setError("先写入 ModelBest API key");
      return;
    }
    setBusy(true);
    try {
      const minted = await api.mintVoice({
        id: label.trim() || undefined,
        text: trial.trim() || TRIAL,
        style: instruct.trim(),
        denoise,
        doNormalize,
        cfgValue: Number.isFinite(Number(cfgValue)) && cfgValue.trim() ? Number(cfgValue) : undefined,
      });
      setCandidate(minted);
      setMessage(`已合成试听 ${minted.seconds.toFixed(1)} 秒`);
      setError(undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function keepDesigned() {
    if (!candidate) return;
    const name = keepName();
    if (!name) return;
    try {
      await api.keepVoice({
        origin: "instruct",
        label: name,
        said: candidate.text,
        style: instruct,
        source: { kind: "candidate", rel: candidate.rel },
      });
      setMessage(`已保存 ${name}`);
      setError(undefined);
      resetCreate();
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function upload(file: File) {
    const replace = Boolean(candidate);
    const form = new FormData();
    form.set("file", file);
    if (replace) form.set("force", "1");
    setBusy(true);
    if (replace) setSaid("");
    try {
      const staged = await api.stageVoice(form);
      setCandidate({ rel: staged.rel, seconds: staged.seconds, text: staged.text, style: "", asr: staged.asr });
      setSaid(staged.text);
      setError(staged.error);
      if (staged.error) {
        setMessage("转写没写成，请手写这句");
      } else if (staged.asr) {
        setMessage(replace ? "已按新录音重新转写" : "已转写文本");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function keepUploaded() {
    if (!candidate) return;
    const name = keepName();
    if (!name) return;
    if (!said.trim()) {
      setError("先写文本，或等转写完成");
      return;
    }
    try {
      await api.keepVoice({
        origin: "upload",
        label: name,
        said: said.trim(),
        source: { kind: "candidate", rel: candidate.rel },
      });
      setMessage(`已保存 ${name}`);
      setError(undefined);
      resetCreate();
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="page-width page">
      <h1 className="sr">音色</h1>
      {error ? <div className="banner banner-error">{error}</div> : null}
      {message ? (
        <div className="banner banner-ok" role="status">
          {message}
        </div>
      ) : null}

      <section className="surface settings-row" aria-label="语音合成">
        <div className="settings-status">
          <span className="h">语音合成</span>
          <span className={ttsPillClass(modelbest, probing, probe)}>{ttsStatus(modelbest, probing, probe)}</span>
        </div>
        <div className="settings-actions">
          <button type="button" className="btn" disabled={probing} onClick={() => void testLink()}>
            {probing ? "正在测…" : "测试连接"}
          </button>
          <a href={MODELBEST_URL} target="_blank" rel="noreferrer" className="btn">
            获取密钥
          </a>
        </div>
      </section>

      <div className="voice-board">
        <section className="surface create-panel">
          <h2 className="sr">新建</h2>
          <label className="field">
            <span>名称</span>
            <input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="例如 讲解女声" />
          </label>
          <OriginPick
            name="voice-origin-new"
            value={how}
            onChange={(next) => {
              setHow(next);
              setCandidate(undefined);
            }}
          />
          {how === "instruct" ? (
            <>
              <label className="field">
                <span>设计指令</span>
                <input value={instruct} onChange={(event) => setInstruct(event.target.value)} placeholder="例如 青春女声，吐字清晰" />
              </label>
              <label className="field">
                <span>文本</span>
                <input value={trial} onChange={(event) => setTrial(event.target.value)} />
              </label>
              <div className="create-opts">
                <label className={denoise ? "kit-item is-on" : "kit-item"}>
                  <input type="checkbox" checked={denoise} onChange={(event) => setDenoise(event.target.checked)} />
                  <span>去底噪</span>
                </label>
                <label className={doNormalize ? "kit-item is-on" : "kit-item"}>
                  <input type="checkbox" checked={doNormalize} onChange={(event) => setDoNormalize(event.target.checked)} />
                  <span>规范化读法</span>
                </label>
                <label className="field">
                  <span>引导强度</span>
                  <input value={cfgValue} onChange={(event) => setCfgValue(event.target.value)} placeholder="1–3" />
                </label>
              </div>
              <div className="create-media">
                <button type="button" className="btn" disabled={busy || !canMint} onClick={() => void mint()}>
                  {busy ? "正在合成…" : "合成试听"}
                </button>
                {candidate ? <audio controls preload="metadata" src={candidateMedia(candidate.rel)} /> : null}
              </div>
              {candidate ? (
                <div className="create-save">
                  <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void keepDesigned()}>
                    保存音色
                  </button>
                </div>
              ) : null}
            </>
          ) : (
            <>
              <VoiceDrop
                busy={busy}
                src={candidate ? candidateMedia(candidate.rel) : undefined}
                onFile={(file) => void upload(file)}
                onReject={() => setError("请选一支音频")}
              />
              {candidate ? (
                <>
                  <label className="field">
                    <span>文本</span>
                    <input
                      value={said}
                      onChange={(event) => setSaid(event.target.value)}
                      placeholder="转写结果可改"
                    />
                  </label>
                  <div className="create-save">
                    <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void keepUploaded()}>
                      保存音色
                    </button>
                  </div>
                </>
              ) : null}
            </>
          )}
        </section>

        <section className="voice-shelf" aria-label="音色库">
          <h2 className="sr">音色库</h2>
          {packs.length ? (
            <div className="stack">
              {packs.map((asset) => (
                <VoiceLibraryCard
                  key={asset.id}
                  asset={asset}
                  taken={(name) => packs.some((item) => item.id !== asset.id && (item.label ?? item.id).trim() === name)}
                  onChanged={reload}
                  onError={setError}
                  onMessage={setMessage}
                />
              ))}
            </div>
          ) : (
            <p className="item-meta">还没有音色。在新建里做一套。</p>
          )}
        </section>
      </div>
    </div>
  );
}

function ttsStatus(
  modelbest: ModelbestStatus | undefined,
  probing: boolean,
  probe?: { ok: boolean; message: string },
): string {
  if (probing) return "正在测";
  if (probe) return probe.message;
  if (!modelbest) return "读取中";
  if (!modelbest.configured) return "未配置密钥";
  return "未测";
}

function ttsPillClass(
  modelbest: ModelbestStatus | undefined,
  probing: boolean,
  probe?: { ok: boolean; message: string },
): string {
  if (probe?.ok) return "pill pill-ok";
  if (probe && !probe.ok) return "pill pill-bad";
  if (!probing && modelbest && !modelbest.configured) return "pill pill-bad";
  return "pill";
}

function isAudioFile(file: File): boolean {
  if (file.type.startsWith("audio/")) return true;
  return /\.(wav|wave|mp3|m4a|flac|ogg|aac|webm)$/i.test(file.name);
}

function VoiceDrop({
  busy,
  src,
  onFile,
  onReject,
}: {
  busy: boolean;
  src?: string;
  onFile: (file: File) => void;
  onReject: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  function take(file?: File | null) {
    if (!file || busy) return;
    if (!isAudioFile(file)) {
      onReject();
      return;
    }
    onFile(file);
  }

  function openPicker() {
    if (!busy) input.current?.click();
  }

  return (
    <div
      className={["voice-drop", over ? "is-over" : "", src ? "has-audio" : "", busy ? "is-busy" : ""]
        .filter(Boolean)
        .join(" ")}
      role="button"
      tabIndex={busy ? -1 : 0}
      aria-label={src ? "换一支录音" : "点击或拖入 wav"}
      onClick={openPicker}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        openPicker();
      }}
      onDragOver={(event) => {
        event.preventDefault();
        if (!busy) setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setOver(false);
        take(event.dataTransfer.files?.[0]);
      }}
    >
      <input
        ref={input}
        type="file"
        accept="audio/wav,audio/*"
        hidden
        disabled={busy}
        onClick={(event) => event.stopPropagation()}
        onChange={(event) => {
          take(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
      {src ? (
        <audio controls preload="metadata" src={src} onClick={(event) => event.stopPropagation()} />
      ) : (
        <>
          <IconUpload />
          <span className="voice-drop-prompt">{busy ? "正在转写…" : "点击或拖入 wav"}</span>
        </>
      )}
    </div>
  );
}

function OriginPick({
  name,
  value,
  onChange,
}: {
  name: string;
  value: VoiceOrigin;
  onChange: (next: VoiceOrigin) => void;
}) {
  return (
    <ul className="origin-picks">
      <li>
        <label className={value === "instruct" ? "pick is-on" : "pick"}>
          <input type="radio" name={name} checked={value === "instruct"} onChange={() => onChange("instruct")} />
          <span>
            <strong>设计指令</strong>
          </span>
        </label>
      </li>
      <li>
        <label className={value === "upload" ? "pick is-on" : "pick"}>
          <input type="radio" name={name} checked={value === "upload"} onChange={() => onChange("upload")} />
          <span>
            <strong>上传录音</strong>
          </span>
        </label>
      </li>
    </ul>
  );
}

function VoiceLibraryCard({
  asset,
  taken,
  onChanged,
  onError,
  onMessage,
}: {
  asset: Asset;
  taken: (name: string) => boolean;
  onChanged: () => Promise<void>;
  onError: (message?: string) => void;
  onMessage: (message?: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const source = voiceCloneSource(asset);
  const origin = source.origin === "instruct" ? "设计指令合成" : "上传";
  const name = asset.label ?? asset.id;

  async function remove() {
    if (!window.confirm(`删除后，点过这套声的片子会缺音色。确定删除「${name}」？`)) return;
    try {
      await api.removeLibrary(asset.id);
      onError(undefined);
      onMessage(`已删除 ${name}`);
      setOpen(false);
      await onChanged();
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <>
      <article className="voice-row">
        <div>
          <div className="item-title">{name}</div>
          <div className="card-id">Hi-Fi · {origin}</div>
        </div>
        <div className="voice-row-actions">
          <button type="button" className="btn" onClick={() => setOpen(true)}>
            详情
          </button>
          <button type="button" className="btn btn-danger" onClick={() => void remove()}>
            删除
          </button>
        </div>
      </article>
      {open ? (
        <VoiceDetail
          asset={asset}
          taken={taken}
          onClose={() => setOpen(false)}
          onChanged={onChanged}
          onError={onError}
          onMessage={onMessage}
          onRemove={() => void remove()}
        />
      ) : null}
    </>
  );
}

function VoiceDetail({
  asset,
  taken,
  onClose,
  onChanged,
  onError,
  onMessage,
  onRemove,
}: {
  asset: Asset;
  taken: (name: string) => boolean;
  onClose: () => void;
  onChanged: () => Promise<void>;
  onError: (message?: string) => void;
  onMessage: (message?: string) => void;
  onRemove: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const source = voiceCloneSource(asset);
  const origin = source.origin === "instruct" ? "设计指令合成" : "上传";
  const titleId = `voice-detail-${asset.id}`;
  const [name, setName] = useState(asset.label ?? asset.id);
  const [said, setSaid] = useState(source.said);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (!el.open) el.showModal();
    const onCancel = (event: Event) => {
      event.preventDefault();
      onClose();
    };
    el.addEventListener("cancel", onCancel);
    return () => {
      el.removeEventListener("cancel", onCancel);
      if (el.open) el.close();
    };
  }, []);

  async function save() {
    const label = name.trim();
    const text = said.trim();
    if (!label) {
      onError("先写名称");
      return;
    }
    if (taken(label)) {
      onError(`${label} 已在音色库里`);
      return;
    }
    if (!text) {
      onError("文本不能空");
      return;
    }
    setBusy(true);
    try {
      await api.patchLibrary(asset.id, { label, text });
      onError(undefined);
      onMessage(`已保存 ${label}`);
      await onChanged();
      onClose();
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={dialog}
      className="modal"
      aria-labelledby={titleId}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="modal-card">
        <div className="voice-card-top">
          <h3 className="item-title" id={titleId}>
            {asset.label ?? asset.id}
          </h3>
          <span className="chip">
            <em>出片</em>
            Hi-Fi · {origin}
          </span>
        </div>
        {source.file ? <audio controls preload="metadata" src={libraryMedia(source.file)} /> : null}
        <label className="field">
          <span>名称</span>
          <input value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <label className="field">
          <span>文本</span>
          <input value={said} onChange={(event) => setSaid(event.target.value)} />
        </label>
        {source.instruct ? (
          <dl className="voice-dl">
            <div>
              <dt>设计指令</dt>
              <dd>{source.instruct}</dd>
            </div>
          </dl>
        ) : null}
        <div className="modal-actions">
          <button type="button" className="btn btn-danger" onClick={onRemove}>
            删除
          </button>
          <div className="create-actions">
            <button type="button" className="btn" onClick={onClose}>
              关闭
            </button>
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void save()}>
              {busy ? "正在保存…" : "保存"}
            </button>
          </div>
        </div>
      </div>
    </dialog>
  );
}
