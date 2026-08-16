import { useEffect, useState } from "react";
import { api, candidateMedia, libraryMedia, projectMedia } from "../api";
import { Link } from "../components/Link";
import { listVoicePacks, voiceCloneSource, type VoiceOrigin } from "../lib/voices";
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
  const [how, setHow] = useState<VoiceOrigin>("instruct");
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
      setError("instruct 铸源要先写一段描述");
      return;
    }
    try {
      await api.createVoicePack({ id: id.trim(), label: label.trim() || undefined, style: instruct.trim() });
      setMessage(`已建套 ${id.trim()}，铸试听后再收成克隆源`);
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
    try {
      await api.uploadLibrary(form);
      setMessage(`已用上传的录音作为 ${id.trim()} 的克隆源`);
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
      <p className="lede">上传录音或 instruct 铸一支，二选一，得到唯一克隆源。出片再 Hi-Fi clone。</p>
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
        <h2 className="h">新建克隆源</h2>
        <OriginPick name="voice-origin-new" value={how} onChange={setHow} />
        <div className="form-grid">
          <label className="field">
            <span>套 id</span>
            <input value={id} onChange={(event) => setId(event.target.value)} placeholder="voice.prompt" />
          </label>
          <label className="field">
            <span>名称</span>
            <input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="讲解女声" />
          </label>
          {how === "instruct" ? (
            <>
              <label className="field field-span">
                <span>instruct</span>
                <input value={instruct} onChange={(event) => setInstruct(event.target.value)} placeholder="青春女声，吐字清晰，语速从容" />
              </label>
              <div className="create-row">
                <button type="button" className="btn" onClick={() => void createPack()}>
                  建套，再铸
                </button>
              </div>
            </>
          ) : (
            <>
              <label className="field field-span">
                <span>这支在说</span>
                <input value={said} onChange={(event) => setSaid(event.target.value)} />
              </label>
              <div className="create-row">
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
            </>
          )}
        </div>
      </section>
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
    <ul className="kit-list lang-picks" style={{ marginBottom: 12 }}>
      <li>
        <label className={value === "upload" ? "kit-item is-on" : "kit-item"}>
          <input type="radio" name={name} checked={value === "upload"} onChange={() => onChange("upload")} />
          <span>
            <span className="item-title">上传录音</span>
            <span className="item-meta">现成 wav 当克隆源</span>
          </span>
        </label>
      </li>
      <li>
        <label className={value === "instruct" ? "kit-item is-on" : "kit-item"}>
          <input type="radio" name={name} checked={value === "instruct"} onChange={() => onChange("instruct")} />
          <span>
            <span className="item-title">instruct 铸</span>
            <span className="item-meta">铸出的收下后就是克隆源</span>
          </span>
        </label>
      </li>
    </ul>
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
  const source = voiceCloneSource(asset);
  const [label, setLabel] = useState(asset.label ?? "");
  const [how, setHow] = useState<VoiceOrigin>(source.origin);
  const [said, setSaid] = useState(source.said);
  const [instruct, setInstruct] = useState(source.instruct);
  const [trial, setTrial] = useState(source.said || TRIAL);
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
    const next = voiceCloneSource(asset);
    setLabel(asset.label ?? "");
    setHow(next.origin);
    setSaid(next.said);
    setInstruct(next.instruct);
    setTrial((current) => current || next.said || TRIAL);
  }, [asset]);

  async function saveMeta() {
    try {
      await api.patchLibrary(asset.id, {
        label,
        text: said,
        ...(how === "instruct" ? { style: instruct } : {}),
      });
      await onSaved();
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    }
  }

  async function mint() {
    if (!instruct.trim()) {
      onError("instruct 铸源要先写一段描述");
      return;
    }
    setBusy(true);
    try {
      const minted = await api.mintVoice({
        id: asset.id,
        text: trial.trim() || TRIAL,
        style: instruct.trim(),
        denoise,
        doNormalize,
        cfgValue: Number.isFinite(Number(cfgValue)) && cfgValue.trim() ? Number(cfgValue) : undefined,
      });
      setCandidate(minted);
      onMessage(`已铸试听 ${minted.seconds.toFixed(1)} 秒，听完再收成克隆源`);
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function keepDesigned() {
    if (!candidate) return;
    try {
      await api.keepVoice({
        id: asset.id,
        origin: "instruct",
        label,
        said: candidate.text,
        style: instruct,
        source: { kind: "candidate", rel: candidate.rel },
      });
      setCandidate(undefined);
      onMessage("已把 instruct 铸出的收成克隆源，出片走 Hi-Fi clone");
      await onSaved();
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    }
  }

  async function uploadReplace(file: File) {
    const form = new FormData();
    form.set("file", file);
    form.set("kind", "voice");
    form.set("id", asset.id);
    if (label.trim()) form.set("label", label.trim());
    if (said.trim()) form.set("text", said.trim());
    try {
      await api.uploadLibrary(form);
      onMessage("已换成上传的克隆源");
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
        origin: "upload",
        label,
        said: film.film.scenes.find((scene) => scene.id === sceneId)?.lines[lineLocale ?? ""] ?? "",
        source: { kind: "project", projectId: film.id, rel: line.rel },
      });
      onMessage(`已把 ${sceneId} 收成克隆源`);
      await onSaved();
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    }
  }

  const lines = (film?.paths.lineFiles ?? []).filter((item) => item.exists);

  return (
    <article className="voice-card">
      <div className="voice-main">
        <div>
          <div className="item-title">{asset.label ?? asset.id}</div>
          <div className="card-id">
            {asset.id} · 出片 Hi-Fi · {source.file ? (source.origin === "instruct" ? "克隆源来自 instruct" : "克隆源来自上传") : "还没有克隆源"}
          </div>
        </div>
      </div>
      <label className="field field-span">
        <span>名称</span>
        <input value={label} onChange={(event) => setLabel(event.target.value)} onBlur={() => void saveMeta()} />
      </label>

      <div>
        <div className="item-title">克隆源怎么来</div>
        <p className="item-meta">二选一。换一条路并收下后，会盖掉现在的克隆源。</p>
        <OriginPick name={`voice-origin-${asset.id}`} value={how} onChange={setHow} />
      </div>

      {how === "instruct" ? (
        <div className="voice-mint" style={{ marginTop: 0, paddingTop: 0, borderTop: 0 }}>
          <label className="field field-span">
            <span>instruct</span>
            <input
              value={instruct}
              onChange={(event) => setInstruct(event.target.value)}
              onBlur={() => void saveMeta()}
              placeholder="青春女声，吐字清晰，语速从容"
            />
          </label>
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
              <p className="item-meta">试听还不是克隆源。听完再收。</p>
              <audio controls preload="metadata" src={candidateMedia(candidate.rel)} />
              <p className="item-meta">{candidate.seconds.toFixed(1)} 秒</p>
              <button type="button" className="btn btn-primary" onClick={() => void keepDesigned()}>
                收下为克隆源
              </button>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="voice-mint" style={{ marginTop: 0, paddingTop: 0, borderTop: 0 }}>
          <label className="field field-span">
            <span>这支在说</span>
            <input value={said} onChange={(event) => setSaid(event.target.value)} onBlur={() => void saveMeta()} />
          </label>
          <div className="create-row">
            <label className="btn">
              上传 wav
              <input
                type="file"
                accept="audio/wav,audio/*"
                hidden
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void uploadReplace(file);
                  event.target.value = "";
                }}
              />
            </label>
          </div>
          <p className="item-meta" style={{ marginTop: 12 }}>
            或从片子旁白提一支，同样当作上传的克隆源。
          </p>
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
      )}

      <div className="voice-mint">
        <h2 className="h">克隆源</h2>
        <p className="item-meta">出片 Hi-Fi clone 用这支 + 逐字稿。</p>
        {source.file ? (
          <>
            <audio controls preload="metadata" src={libraryMedia(source.file)} />
            {how === "instruct" ? (
              <label className="field field-span" style={{ marginTop: 8 }}>
                <span>这支在说</span>
                <input value={said} onChange={(event) => setSaid(event.target.value)} onBlur={() => void saveMeta()} />
              </label>
            ) : null}
          </>
        ) : (
          <p className="item-meta">{how === "instruct" ? "还没有。铸试听并收下。" : "还没有。上传 wav，或从片子提。"}</p>
        )}
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
