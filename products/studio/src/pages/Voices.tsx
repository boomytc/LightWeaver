import { useEffect, useState } from "react";
import { api, candidateMedia, libraryMedia, projectMedia } from "../api";
import { Link } from "../components/Link";
import { listVoicePacks, voiceParts } from "../lib/voices";
import { MODELBEST_URL } from "../lib/prefs";
import type { Asset, ProjectDetail, ProjectSummary } from "../types";

const TRIAL = "先把名称、场景和规则说清楚，再动手做交互。";

type Candidate = { rel: string; seconds: number; text: string; style: string };

export function Voices() {
  const [library, setLibrary] = useState<Asset[]>([]);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState<string>();
  const [id, setId] = useState("voice.prompt");
  const [label, setLabel] = useState("");
  const [said, setSaid] = useState("");
  const [instruct, setInstruct] = useState("");

  async function reload() {
    const [nextLibrary, nextProjects] = await Promise.all([api.library(), api.projects()]);
    setLibrary(nextLibrary);
    setProjects(nextProjects);
  }

  useEffect(() => {
    reload().catch((err: Error) => setError(err.message));
  }, []);

  async function createPack() {
    if (!id.trim()) {
      setError("先写音色套 id，例如 voice.prompt");
      return;
    }
    if (!instruct.trim()) {
      setError("建套至少写一段 instruct");
      return;
    }
    try {
      await api.createVoicePack({ id: id.trim(), label: label.trim() || undefined, style: instruct.trim() });
      setMessage(`已建套 ${id.trim()}，用 instruct 铸试听`);
      setError(undefined);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function upload(file: File) {
    if (!id.trim()) {
      setError("先写音色套 id，例如 voice.prompt");
      return;
    }
    const form = new FormData();
    form.set("file", file);
    form.set("kind", "voice");
    form.set("id", id.trim());
    if (label.trim()) form.set("label", label.trim());
    if (said.trim()) form.set("text", said.trim());
    if (instruct.trim()) form.set("style", instruct.trim());
    try {
      await api.uploadLibrary(form);
      setMessage(`已收下 ${id.trim()} 的克隆源`);
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
        参考是克隆源或 instruct。instruct 铸出的放试听。出片 Hi-Fi（试听优先）。
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
        {listVoicePacks(library).map((asset) => (
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
        <h2 className="h">新建参考</h2>
        <p className="item-meta">没有录音就写 instruct 建套再铸。有录音就上传为克隆源。</p>
        <div className="form-grid">
          <label className="field">
            <span>套 id</span>
            <input value={id} onChange={(event) => setId(event.target.value)} placeholder="voice.prompt" />
          </label>
          <label className="field">
            <span>名称</span>
            <input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="讲解女声" />
          </label>
          <label className="field field-span">
            <span>instruct</span>
            <input value={instruct} onChange={(event) => setInstruct(event.target.value)} placeholder="青春女声，吐字清晰，语速从容" />
          </label>
          <label className="field field-span">
            <span>克隆源逐字稿（上传时填）</span>
            <input value={said} onChange={(event) => setSaid(event.target.value)} />
          </label>
          <div className="create-row">
            <button type="button" className="btn" onClick={() => void createPack()}>
              只写 instruct 建套
            </button>
            <label className="btn">
              上传克隆源
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
  const parts = voiceParts(asset);
  const [label, setLabel] = useState(asset.label ?? "");
  const [cloneSaid, setCloneSaid] = useState(parts.clone?.said ?? "");
  const [instruct, setInstruct] = useState(parts.instruct);
  const [previewSaid, setPreviewSaid] = useState(parts.preview?.said ?? "");
  const [trial, setTrial] = useState(parts.preview?.said || TRIAL);
  const [more, setMore] = useState(false);
  const [denoise, setDenoise] = useState(true);
  const [doNormalize, setDoNormalize] = useState(true);
  const [cfgValue, setCfgValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [candidate, setCandidate] = useState<Candidate>();
  const [filmId, setFilmId] = useState("");
  const [film, setFilm] = useState<ProjectDetail>();
  const [lineKey, setLineKey] = useState("");

  useEffect(() => {
    const next = voiceParts(asset);
    setLabel(asset.label ?? "");
    setCloneSaid(next.clone?.said ?? "");
    setInstruct(next.instruct);
    setPreviewSaid(next.preview?.said ?? "");
    setTrial((current) => current || next.preview?.said || TRIAL);
  }, [asset]);

  async function saveMeta() {
    try {
      await api.patchLibrary(asset.id, {
        label,
        text: previewSaid,
        style: instruct,
        texts: parts.clone ? { clone: cloneSaid } : undefined,
      });
      await onSaved();
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    }
  }

  async function mint() {
    if (!parts.clone && !instruct.trim()) {
      onError("先写 instruct，或先上传一支克隆源");
      return;
    }
    setBusy(true);
    try {
      const minted = await api.mintVoice({
        id: asset.id,
        text: trial.trim() || TRIAL,
        style: instruct.trim(),
        ref: parts.clone ? `library:${asset.id}` : "none",
        denoise,
        doNormalize,
        cfgValue: Number.isFinite(Number(cfgValue)) && cfgValue.trim() ? Number(cfgValue) : undefined,
      });
      setCandidate(minted);
      onMessage(`已铸试听 ${minted.seconds.toFixed(1)} 秒，听完再收成试听`);
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function keepPreview() {
    if (!candidate) return;
    try {
      await api.keepVoice({
        id: asset.id,
        as: "preview",
        label,
        said: candidate.text,
        style: instruct,
        source: { kind: "candidate", rel: candidate.rel },
      });
      setCandidate(undefined);
      onMessage("已收下为试听，出片将按这支做 Hi-Fi clone");
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
    const [lineLocale, sceneId] = lineKey.split(":");
    const line = film.paths.lineFiles.find((item) => item.locale === lineLocale && item.sceneId === sceneId && item.exists);
    if (!line?.rel) {
      onError("这场还没有旁白 wav");
      return;
    }
    try {
      await api.keepVoice({
        id: asset.id,
        as: "clone",
        label,
        said: film.film.scenes.find((scene) => scene.id === sceneId)?.lines[lineLocale ?? ""] ?? "",
        style: instruct,
        source: { kind: "project", projectId: film.id, rel: line.rel },
      });
      onMessage(`已把 ${sceneId} 收为克隆源`);
      await onSaved();
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    }
  }

  const lines = (film?.paths.lineFiles ?? []).filter((item) => item.exists);
  const hifi = parts.preview ? "试听" : parts.clone ? "克隆源" : "还没有";

  return (
    <article className="voice-card">
      <div className="voice-main">
        <div>
          <div className="item-title">{asset.label ?? asset.id}</div>
          <div className="card-id">
            {asset.id} · 出片 Hi-Fi · 现在用{hifi}
          </div>
        </div>
      </div>
      <label className="field field-span">
        <span>名称</span>
        <input value={label} onChange={(event) => setLabel(event.target.value)} onBlur={() => void saveMeta()} />
      </label>

      <div className="voice-stage">
        <div>
          <div className="item-title">克隆源</div>
          <p className="item-meta">上传的录音，或从片子旁白提出来的。</p>
          {parts.clone ? (
            <audio controls preload="metadata" src={libraryMedia(parts.clone.file)} />
          ) : (
            <p className="item-meta">没有录音。</p>
          )}
          {parts.clone ? (
            <label className="field field-span" style={{ marginTop: 8 }}>
              <span>这支在说</span>
              <input value={cloneSaid} onChange={(event) => setCloneSaid(event.target.value)} onBlur={() => void saveMeta()} />
            </label>
          ) : null}
        </div>
        <div>
          <div className="item-title">instruct</div>
          <p className="item-meta">没有克隆源时用这段描述铸试听。</p>
          <label className="field field-span">
            <span>描述</span>
            <input
              value={instruct}
              onChange={(event) => setInstruct(event.target.value)}
              onBlur={() => void saveMeta()}
              placeholder="青春女声，吐字清晰，语速从容"
            />
          </label>
        </div>
      </div>

      <div className="voice-mint">
        <h2 className="h">试听</h2>
        <p className="item-meta">
          {parts.clone ? "按克隆源铸。instruct 铸出来的也放这里。" : "用 instruct 铸。铸完听，收下后出片按这支 Hi-Fi。"}
        </p>
        {parts.preview ? (
          <div>
            <audio controls preload="metadata" src={libraryMedia(parts.preview.file)} />
            <label className="field field-span" style={{ marginTop: 8 }}>
              <span>这支在说（出片 Hi-Fi 逐字稿）</span>
              <input value={previewSaid} onChange={(event) => setPreviewSaid(event.target.value)} onBlur={() => void saveMeta()} />
            </label>
          </div>
        ) : (
          <p className="item-meta">还没有试听。</p>
        )}
        <label className="field field-span">
          <span>试听稿</span>
          <input value={trial} onChange={(event) => setTrial(event.target.value)} />
        </label>
        <button type="button" className="text-link" style={{ border: 0, background: "none", padding: 0 }} onClick={() => setMore((on) => !on)}>
          {more ? "收起选项" : "更多选项"}
        </button>
        {more ? (
          <div className="create-row">
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
        ) : null}
        <div className="create-row">
          <button type="button" className="btn" disabled={busy} onClick={() => void mint()}>
            {busy ? "正在铸…" : "铸试听"}
          </button>
        </div>
        {candidate ? (
          <div style={{ marginTop: 12 }}>
            <audio controls preload="metadata" src={candidateMedia(candidate.rel)} />
            <p className="item-meta">{candidate.seconds.toFixed(1)} 秒</p>
            <button type="button" className="btn btn-primary" onClick={() => void keepPreview()}>
              收下为试听
            </button>
          </div>
        ) : null}
      </div>

      <div className="voice-mint">
        <h2 className="h">从片子旁白提一支</h2>
        <p className="item-meta">提出来的是克隆源，不是试听。</p>
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
            收为克隆源
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
