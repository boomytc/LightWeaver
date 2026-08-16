import { useEffect, useRef, useState } from "react";
import { api, candidateMedia, libraryMedia, type AsrStatus, type ModelbestStatus } from "../api";
import { listVoicePacks, voiceCloneSource, type VoiceOrigin } from "../lib/voices";
import { MODELBEST_URL } from "../lib/prefs";
import type { Asset } from "../types";

const TRIAL = "先把名称、场景和规则说清楚，再动手做交互。";

type Candidate = { rel: string; seconds: number; text: string; style: string; asr?: boolean };

export function Voices() {
  const [library, setLibrary] = useState<Asset[]>([]);
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState<string>();
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
  const [asr, setAsr] = useState<AsrStatus>();
  const [probing, setProbing] = useState(false);
  const [probe, setProbe] = useState<{ ok: boolean; message: string }>();

  const packs = listVoicePacks(library);
  const canMint = Boolean(modelbest?.configured);

  async function reload() {
    const [nextLibrary, nextModelbest, nextAsr] = await Promise.all([
      api.library(),
      api.modelbest(),
      api.asr().catch(() => ({ ready: false, hint: "转写状态读不到" })),
    ]);
    setLibrary(nextLibrary);
    setModelbest(nextModelbest);
    setAsr(nextAsr);
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
      setError("先写名称再收进音色库");
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
      setMessage(`已合成试听 ${minted.seconds.toFixed(1)} 秒，听完再收进音色库`);
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
      setMessage(`已把 ${name} 收进音色库`);
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
    else if (said.trim()) form.set("text", said.trim());
    setBusy(true);
    if (replace) setSaid("");
    try {
      const staged = await api.stageVoice(form);
      setCandidate({ rel: staged.rel, seconds: staged.seconds, text: staged.text, style: "", asr: staged.asr });
      setSaid(staged.text);
      setError(staged.error);
      if (staged.error) {
        setMessage("上传后直接听。转写没写成，请手写这句再说的话再收");
      } else if (staged.asr) {
        setMessage(
          `${replace ? "已按新录音重新转写" : "已转写文本"}，听完可改再收进音色库${staged.seconds ? ` · ${staged.seconds.toFixed(1)} 秒` : ""}`,
        );
      } else {
        setMessage("上传后直接听。文本用你写的。听完再收");
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
      setMessage(`已把 ${name} 收进音色库`);
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
      {message ? <div className="banner banner-ok">{message}</div> : null}

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
          <div className="form-grid">
            {how === "instruct" ? (
              <label className="field">
                <span>设计指令</span>
                <input value={instruct} onChange={(event) => setInstruct(event.target.value)} placeholder="例如 青春女声，吐字清晰" />
              </label>
            ) : candidate ? null : (
              <label className="field">
                <span>文本</span>
                <input
                  value={said}
                  onChange={(event) => setSaid(event.target.value)}
                  placeholder={asr?.ready ? "可空，上传后自动转写" : "转写未就绪，先手写这句"}
                />
              </label>
            )}
            {how === "instruct" ? (
              <label className="field">
                <span>文本</span>
                <input value={trial} onChange={(event) => setTrial(event.target.value)} />
              </label>
            ) : null}
          </div>
          {how === "instruct" ? (
            <>
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
              <p className="item-meta">引导强度可空。加大更贴指令和稿，减小更自然，太高容易噪。</p>
              <div className="create-actions">
                <button type="button" className="btn" disabled={busy || !canMint} onClick={() => void mint()}>
                  {busy ? "正在合成…" : "合成试听"}
                </button>
              </div>
              {candidate ? (
                <div className="create-result">
                  <div className="voice-main">
                    <div>
                      <div className="item-title">试听</div>
                      <p className="item-meta">还没进库。听完再收。 · {candidate.seconds.toFixed(1)} 秒</p>
                    </div>
                    <audio controls preload="metadata" src={candidateMedia(candidate.rel)} />
                  </div>
                  <div className="create-actions">
                    <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void keepDesigned()}>
                      收下进音色库
                    </button>
                  </div>
                </div>
              ) : null}
            </>
          ) : (
            <>
              <p className="item-meta">
                {asr?.ready ? "上传后直接听，空着的文本会自动转写，改完再收。" : (asr?.hint ?? "转写未就绪，上传后请手写文本再收。")}
              </p>
              <div className="create-actions">
                <label className="btn">
                  {busy ? "正在转写…" : candidate ? "换一支再转写" : "上传 wav"}
                  <input
                    type="file"
                    accept="audio/wav,audio/*"
                    hidden
                    disabled={busy}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void upload(file);
                      event.target.value = "";
                    }}
                  />
                </label>
              </div>
              {candidate ? (
                <div className="create-result">
                  <div className="voice-main">
                    <div>
                      <div className="item-title">试听</div>
                      <p className="item-meta">还没进库。听完再收。{candidate.seconds ? ` · ${candidate.seconds.toFixed(1)} 秒` : ""}</p>
                    </div>
                    <audio controls preload="metadata" src={candidateMedia(candidate.rel)} />
                  </div>
                  <label className="field">
                    <span>文本</span>
                    <input value={said} onChange={(event) => setSaid(event.target.value)} />
                  </label>
                  <div className="create-actions">
                    <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void keepUploaded()}>
                      收下进音色库
                    </button>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </section>

        <section className="voice-shelf" aria-label="音色库">
          <h2 className="sr">音色库</h2>
          {packs.length ? (
            <div className="stack">
              {packs.map((asset) => (
                <VoiceLibraryCard key={asset.id} asset={asset} />
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
            <span className="item-meta">合成后才出试听</span>
          </span>
        </label>
      </li>
      <li>
        <label className={value === "upload" ? "pick is-on" : "pick"}>
          <input type="radio" name={name} checked={value === "upload"} onChange={() => onChange("upload")} />
          <span>
            <strong>上传录音</strong>
            <span className="item-meta">上传后直接听</span>
          </span>
        </label>
      </li>
    </ul>
  );
}

function VoiceLibraryCard({ asset }: { asset: Asset }) {
  const [open, setOpen] = useState(false);
  const source = voiceCloneSource(asset);
  const origin = source.origin === "instruct" ? "设计指令合成" : "上传";
  return (
    <>
      <article className="voice-row">
        <div>
          <div className="item-title">{asset.label ?? asset.id}</div>
          <div className="card-id">Hi-Fi · {origin}</div>
        </div>
        <button type="button" className="btn" onClick={() => setOpen(true)}>
          详情
        </button>
      </article>
      {open ? <VoiceDetail asset={asset} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function VoiceDetail({ asset, onClose }: { asset: Asset; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const source = voiceCloneSource(asset);
  const origin = source.origin === "instruct" ? "设计指令合成" : "上传";
  const titleId = `voice-detail-${asset.id}`;

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
        {source.said || source.instruct ? (
          <dl className="voice-dl">
            {source.said ? (
              <div>
                <dt>文本</dt>
                <dd>{source.said}</dd>
              </div>
            ) : null}
            {source.instruct ? (
              <div>
                <dt>设计指令</dt>
                <dd>{source.instruct}</dd>
              </div>
            ) : null}
          </dl>
        ) : null}
        <div className="create-actions">
          <button type="button" className="btn" onClick={onClose}>
            关闭
          </button>
        </div>
      </div>
    </dialog>
  );
}
