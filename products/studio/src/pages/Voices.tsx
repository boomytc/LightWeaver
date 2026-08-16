import { useEffect, useState } from "react";
import { api, candidateMedia, libraryMedia, projectMedia } from "../api";
import { Link } from "../components/Link";
import { listVoicePacks, voiceFile } from "../lib/voices";
import { MODELBEST_URL } from "../lib/prefs";
import type { Asset, ProjectDetail, ProjectSummary } from "../types";

const TRIAL = "先把名称、场景和规则说清楚，再动手做交互。";

type Candidate = { rel: string; seconds: number; text: string; style: string; locale: string };

export function Voices() {
  const [library, setLibrary] = useState<Asset[]>([]);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState<string>();
  const [id, setId] = useState("voice.prompt");
  const [label, setLabel] = useState("");
  const [locale, setLocale] = useState("zh");

  async function reload() {
    const [nextLibrary, nextProjects] = await Promise.all([api.library(), api.projects()]);
    setLibrary(nextLibrary);
    setProjects(nextProjects);
  }

  useEffect(() => {
    reload().catch((err: Error) => setError(err.message));
  }, []);

  const packs = listVoicePacks(library);

  async function upload(file: File) {
    if (!id.trim()) {
      setError("先写音色套 id，例如 voice.prompt");
      return;
    }
    const form = new FormData();
    form.set("file", file);
    form.set("kind", "voice");
    form.set("id", id.trim());
    form.set("locale", locale);
    if (label.trim()) form.set("label", label.trim());
    try {
      await api.uploadLibrary(form);
      setMessage(`已收下 ${id.trim()} · ${locale === "zh" ? "中文" : "英文"} wav`);
      setError(undefined);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="page-width page">
      <p className="eyebrow">工作台</p>
      <h1 className="page-title">音色</h1>
      <p className="lede">
        收下的 wav 才是这套声。VoxCPM2 用来铸、听、留。片子只点名，不在这里出整片。
      </p>
      <p className="item-meta" style={{ marginTop: 8 }}>
        铸声走{" "}
        <a href={MODELBEST_URL} target="_blank" rel="noreferrer" className="text-link">
          ModelBest 控制台
        </a>
        。
      </p>
      {error ? <div className="banner banner-error">{error}</div> : null}
      {message ? <div className="banner banner-ok">{message}</div> : null}

      <div className="stack">
        {packs.map((asset) => (
          <VoicePackCard
            key={asset.id}
            asset={asset}
            projects={projects}
            usedBy={projects.filter((project) => Object.values(project.voices ?? {}).includes(`library:${asset.id}`))}
            onSaved={reload}
            onError={setError}
            onMessage={setMessage}
          />
        ))}
      </div>

      <section className="section">
        <h2 className="h">上传一支 wav 收下</h2>
        <p className="item-meta">同一 id 的中文 / 英文 wav 收成一套。音频是身份，稿子只是这支在说什么。</p>
        <div className="form-grid">
          <label className="field">
            <span>套 id</span>
            <input value={id} onChange={(event) => setId(event.target.value)} placeholder="voice.prompt" />
          </label>
          <label className="field">
            <span>收在哪一边</span>
            <select value={locale} onChange={(event) => setLocale(event.target.value)} aria-label="收在哪一边">
              <option value="zh">中文</option>
              <option value="en">英文</option>
            </select>
          </label>
          <label className="field field-span">
            <span>名称</span>
            <input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="讲解女声" />
          </label>
          <label className="btn">
            选择 wav
            <input
              type="file"
              accept="audio/wav,audio/*"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void upload(file);
                event.target.value = "";
              }}
            />
          </label>
        </div>
      </section>
    </div>
  );
}

function VoicePackCard({
  asset,
  projects,
  usedBy,
  onSaved,
  onError,
  onMessage,
}: {
  asset: Asset;
  projects: ProjectSummary[];
  usedBy: ProjectSummary[];
  onSaved: () => Promise<void>;
  onError: (message: string) => void;
  onMessage: (message: string) => void;
}) {
  const [label, setLabel] = useState(asset.label ?? "");
  const [saidZh, setSaidZh] = useState(asset.texts?.zh ?? asset.text ?? "");
  const [saidEn, setSaidEn] = useState(asset.texts?.en ?? "");
  const [style, setStyle] = useState(asset.style ?? asset.styles?.zh ?? asset.styles?.en ?? "");
  const [trial, setTrial] = useState(TRIAL);
  const [useRef, setUseRef] = useState(true);
  const [denoise, setDenoise] = useState(true);
  const [doNormalize, setDoNormalize] = useState(true);
  const [cfgValue, setCfgValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [candidate, setCandidate] = useState<Candidate>();
  const [keepSide, setKeepSide] = useState("zh");
  const [filmId, setFilmId] = useState("");
  const [film, setFilm] = useState<ProjectDetail>();
  const [lineKey, setLineKey] = useState("");

  useEffect(() => {
    setLabel(asset.label ?? "");
    setSaidZh(asset.texts?.zh ?? asset.text ?? "");
    setSaidEn(asset.texts?.en ?? "");
    setStyle(asset.style ?? asset.styles?.zh ?? asset.styles?.en ?? "");
  }, [asset]);

  async function saveMeta() {
    try {
      await api.patchLibrary(asset.id, { label, texts: { zh: saidZh, en: saidEn }, style });
      await onSaved();
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    }
  }

  async function mint(locale: string) {
    setBusy(true);
    try {
      const minted = await api.mintVoice({
        id: asset.id,
        locale,
        text: trial.trim() || TRIAL,
        style: style.trim(),
        ref: useRef ? `library:${asset.id}` : "none",
        denoise,
        doNormalize,
        cfgValue: Number.isFinite(Number(cfgValue)) && cfgValue.trim() ? Number(cfgValue) : undefined,
      });
      setCandidate({ ...minted, locale });
      setKeepSide(locale);
      onMessage(`已铸试听 ${minted.seconds.toFixed(1)} 秒，听完再决定收不收`);
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function keepCandidate() {
    if (!candidate) return;
    try {
      await api.keepVoice({
        id: asset.id,
        locale: keepSide,
        label,
        said: candidate.text,
        style: candidate.style || style,
        source: { kind: "candidate", rel: candidate.rel },
      });
      setCandidate(undefined);
      onMessage(`已收下为 ${keepSide === "zh" ? "中文" : "英文"} 参考声`);
      await onSaved();
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    }
  }

  async function pickFilm(nextId: string) {
    setFilmId(nextId);
    setLineKey("");
    if (!nextId) {
      setFilm(undefined);
      return;
    }
    try {
      setFilm(await api.project(nextId));
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    }
  }

  async function keepLine() {
    if (!film || !lineKey) return;
    const [locale, sceneId] = lineKey.split(":");
    const line = film.paths.lineFiles.find((item) => item.locale === locale && item.sceneId === sceneId && item.exists);
    if (!line?.rel) {
      onError("这场还没有旁白 wav");
      return;
    }
    try {
      await api.keepVoice({
        id: asset.id,
        locale: locale ?? "zh",
        label,
        said: film.film.scenes.find((scene) => scene.id === sceneId)?.lines[locale ?? ""] ?? "",
        style,
        source: { kind: "project", projectId: film.id, rel: line.rel },
      });
      onMessage(`已把 ${film.id} / ${sceneId} 收进这套声`);
      await onSaved();
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    }
  }

  const zhFile = voiceFile(asset, "zh");
  const enFile = voiceFile(asset, "en");
  const lines = (film?.paths.lineFiles ?? []).filter((item) => item.exists);

  return (
    <article className="voice-card">
      <div className="voice-main">
        <div>
          <div className="item-title">{asset.label ?? asset.id}</div>
          <div className="card-id">{asset.id} · 收下的 wav 是这套声</div>
        </div>
      </div>
      <label className="field field-span">
        <span>名称</span>
        <input value={label} onChange={(event) => setLabel(event.target.value)} onBlur={() => void saveMeta()} />
      </label>
      <div className="voice-stage">
        <div>
          <div className="item-title">中文参考声</div>
          {zhFile ? <audio controls preload="metadata" src={libraryMedia(zhFile)} /> : <p className="item-meta">还没有中文 wav</p>}
          <label className="field" style={{ marginTop: 8 }}>
            <span>这支在说</span>
            <input value={saidZh} onChange={(event) => setSaidZh(event.target.value)} onBlur={() => void saveMeta()} />
          </label>
        </div>
        <div>
          <div className="item-title">英文参考声</div>
          {enFile ? <audio controls preload="metadata" src={libraryMedia(enFile)} /> : <p className="item-meta">还没有英文 wav</p>}
          <label className="field" style={{ marginTop: 8 }}>
            <span>这支在说</span>
            <input value={saidEn} onChange={(event) => setSaidEn(event.target.value)} onBlur={() => void saveMeta()} />
          </label>
        </div>
      </div>

      <div className="voice-mint">
        <h2 className="h">铸一支试听</h2>
        <p className="item-meta">声音描述只在铸的时候用。听完再收下，出片只读参考 wav。</p>
        <label className="field field-span">
          <span>试听稿</span>
          <input value={trial} onChange={(event) => setTrial(event.target.value)} />
        </label>
        <label className="field field-span">
          <span>声音描述</span>
          <input
            value={style}
            onChange={(event) => setStyle(event.target.value)}
            onBlur={() => void saveMeta()}
            placeholder="青春女声，吐字清晰，语速从容"
          />
        </label>
        <div className="create-row">
          <label className="kit-item">
            <input type="checkbox" checked={useRef} onChange={(event) => setUseRef(event.target.checked)} />
            <span>用已收的 wav 克隆</span>
          </label>
          <label className="kit-item">
            <input type="checkbox" checked={denoise} onChange={(event) => setDenoise(event.target.checked)} />
            <span>去底噪</span>
          </label>
          <label className="kit-item">
            <input type="checkbox" checked={doNormalize} onChange={(event) => setDoNormalize(event.target.checked)} />
            <span>规范化读法</span>
          </label>
          <label className="field">
            <span>引导强度（可空）</span>
            <input value={cfgValue} onChange={(event) => setCfgValue(event.target.value)} placeholder="1–3" />
          </label>
        </div>
        <div className="create-row">
          <button type="button" className="btn" disabled={busy} onClick={() => void mint("zh")}>
            {busy ? "正在铸…" : "铸中文试听"}
          </button>
          <button type="button" className="btn" disabled={busy} onClick={() => void mint("en")}>
            {busy ? "正在铸…" : "铸英文试听"}
          </button>
        </div>
        {candidate ? (
          <div style={{ marginTop: 12 }}>
            <audio controls preload="metadata" src={candidateMedia(candidate.rel)} />
            <p className="item-meta">
              {candidate.seconds.toFixed(1)} 秒 · {candidate.locale}
            </p>
            <div className="create-row">
              <select value={keepSide} onChange={(event) => setKeepSide(event.target.value)} aria-label="收在哪一边">
                <option value="zh">收下为中文参考声</option>
                <option value="en">收下为英文参考声</option>
              </select>
              <button type="button" className="btn btn-primary" onClick={() => void keepCandidate()}>
                收下这支
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <div className="voice-mint">
        <h2 className="h">从片子旁白提一支</h2>
        <p className="item-meta">某场旁白特别稳，可以提成这套的参考声。</p>
        <div className="create-row">
          <select value={filmId} onChange={(event) => void pickFilm(event.target.value)} aria-label="片子">
            <option value="">选一部片子</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.titles.zh ?? project.id}
              </option>
            ))}
          </select>
          <select value={lineKey} onChange={(event) => setLineKey(event.target.value)} aria-label="旁白" disabled={!film}>
            <option value="">选一场已有的 wav</option>
            {lines.map((item) => (
              <option key={`${item.locale}:${item.sceneId}`} value={`${item.locale}:${item.sceneId}`}>
                {item.locale} · {item.sceneId}
              </option>
            ))}
          </select>
          <button type="button" className="btn" disabled={!lineKey} onClick={() => void keepLine()}>
            收下这场
          </button>
        </div>
        {lineKey && film
          ? (() => {
              const [locale, sceneId] = lineKey.split(":");
              const line = film.paths.lineFiles.find((item) => item.locale === locale && item.sceneId === sceneId);
              return line?.rel ? <audio controls preload="metadata" src={projectMedia(film.id, line.rel)} /> : null;
            })()
          : null}
      </div>

      <div className="item-meta" style={{ marginTop: 12 }}>
        {usedBy.length
          ? usedBy.map((project, index) => (
              <span key={project.id}>
                {index > 0 ? " · " : "片子点名 "}
                <Link href={`/f/${encodeURIComponent(project.id)}`} className="text-link">
                  {project.titles.zh ?? project.id}
                </Link>
              </span>
            ))
          : "还没有片子点名这套声"}
      </div>
    </article>
  );
}
