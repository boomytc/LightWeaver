import { useEffect, useState } from "react";
import { api, candidateMedia, libraryMedia, projectMedia } from "../api";
import { Link } from "../components/Link";
import { listVoicePacks, slotLabel, voiceSlots } from "../lib/voices";
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
  const [asExtra, setAsExtra] = useState(false);
  const [extraLocale, setExtraLocale] = useState("en");

  async function reload() {
    const [nextLibrary, nextProjects] = await Promise.all([api.library(), api.projects()]);
    setLibrary(nextLibrary);
    setProjects(nextProjects);
  }

  useEffect(() => {
    reload().catch((err: Error) => setError(err.message));
  }, []);

  async function upload(file: File) {
    if (!id.trim()) {
      setError("先写音色套 id，例如 voice.prompt");
      return;
    }
    const form = new FormData();
    form.set("file", file);
    form.set("kind", "voice");
    form.set("id", id.trim());
    if (asExtra) form.set("locale", extraLocale);
    else {
      const existing = library.find((asset) => asset.id === id.trim());
      const primary = existing ? voiceSlots(existing)[0]?.key : undefined;
      if (primary && primary !== "main") form.set("locale", primary);
    }
    if (label.trim()) form.set("label", label.trim());
    try {
      await api.uploadLibrary(form);
      setMessage(asExtra ? `已加为备声 ${extraLocale}` : `已收下 ${id.trim()} 主声`);
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
        一支参考声就能克隆要出的语言。铸、听、收下主声；只有某语种腔调不稳，再加备声。
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
        <h2 className="h">上传一支 wav</h2>
        <p className="item-meta">默认收下为主声。同一套声可再加备声，给某语种加保险。</p>
        <div className="form-grid">
          <label className="field">
            <span>套 id</span>
            <input value={id} onChange={(event) => setId(event.target.value)} placeholder="voice.prompt" />
          </label>
          <label className="field">
            <span>名称</span>
            <input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="讲解女声" />
          </label>
          <label className="kit-item">
            <input type="checkbox" checked={asExtra} onChange={(event) => setAsExtra(event.target.checked)} />
            <span>加为备声</span>
          </label>
          {asExtra ? (
            <label className="field">
              <span>备声语种</span>
              <select value={extraLocale} onChange={(event) => setExtraLocale(event.target.value)} aria-label="备声语种">
                <option value="zh">中文</option>
                <option value="en">英文</option>
              </select>
            </label>
          ) : null}
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
  const slots = voiceSlots(asset);
  const hasRef = slots.length > 0;
  const [label, setLabel] = useState(asset.label ?? "");
  const [saids, setSaids] = useState<Record<string, string>>(() =>
    Object.fromEntries(slots.map((slot) => [slot.key, slot.said])),
  );
  const [style, setStyle] = useState(asset.style ?? asset.styles?.zh ?? asset.styles?.en ?? "");
  const [trial, setTrial] = useState(TRIAL);
  const [more, setMore] = useState(false);
  const [useRef, setUseRef] = useState(hasRef);
  const [denoise, setDenoise] = useState(true);
  const [doNormalize, setDoNormalize] = useState(true);
  const [cfgValue, setCfgValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [candidate, setCandidate] = useState<Candidate>();
  const [extraLocale, setExtraLocale] = useState("en");
  const [filmId, setFilmId] = useState("");
  const [film, setFilm] = useState<ProjectDetail>();
  const [lineKey, setLineKey] = useState("");

  useEffect(() => {
    setLabel(asset.label ?? "");
    setSaids(Object.fromEntries(voiceSlots(asset).map((slot) => [slot.key, slot.said])));
    setStyle(asset.style ?? asset.styles?.zh ?? asset.styles?.en ?? "");
    setUseRef(voiceSlots(asset).length > 0);
  }, [asset]);

  async function saveMeta() {
    try {
      await api.patchLibrary(asset.id, { label, texts: saids, style });
      await onSaved();
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    }
  }

  async function mint() {
    setBusy(true);
    try {
      const minted = await api.mintVoice({
        id: asset.id,
        text: trial.trim() || TRIAL,
        style: style.trim(),
        ref: useRef && hasRef ? `library:${asset.id}` : "none",
        denoise,
        doNormalize,
        cfgValue: Number.isFinite(Number(cfgValue)) && cfgValue.trim() ? Number(cfgValue) : undefined,
      });
      setCandidate(minted);
      onMessage(`已铸试听 ${minted.seconds.toFixed(1)} 秒，听完再收`);
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function keep(locale?: string) {
    if (!candidate) return;
    try {
      await api.keepVoice({
        id: asset.id,
        locale,
        label,
        said: candidate.text,
        style: candidate.style || style,
        source: { kind: "candidate", rel: candidate.rel },
      });
      setCandidate(undefined);
      onMessage(locale ? `已加为 ${slotLabel(locale)} 备声` : "已收下为主声");
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

  async function keepLine(asExtra: boolean) {
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
        locale: asExtra ? lineLocale : undefined,
        label,
        said: film.film.scenes.find((scene) => scene.id === sceneId)?.lines[lineLocale ?? ""] ?? "",
        style,
        source: { kind: "project", projectId: film.id, rel: line.rel },
      });
      onMessage(asExtra ? `已加为 ${slotLabel(lineLocale ?? "")} 备声` : `已把 ${sceneId} 收为主声`);
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
          <div className="card-id">{asset.id} · 主声克隆所有要出的语言</div>
        </div>
      </div>
      <label className="field field-span">
        <span>名称</span>
        <input value={label} onChange={(event) => setLabel(event.target.value)} onBlur={() => void saveMeta()} />
      </label>
      <div className="voice-stage">
        {slots.length ? (
          slots.map((slot) => (
            <div key={slot.key}>
              <div className="item-title">
                {slot.primary ? "主声" : `备声 · ${slotLabel(slot.key)}`}
              </div>
              <audio controls preload="metadata" src={libraryMedia(slot.file)} />
              <label className="field" style={{ marginTop: 8 }}>
                <span>这支在说</span>
                <input
                  value={saids[slot.key] ?? ""}
                  onChange={(event) => setSaids((current) => ({ ...current, [slot.key]: event.target.value }))}
                  onBlur={() => void saveMeta()}
                />
              </label>
            </div>
          ))
        ) : (
          <p className="item-meta">还没有参考声。铸一支或上传 wav 收下。</p>
        )}
      </div>

      <div className="voice-mint">
        <h2 className="h">铸一支试听</h2>
        <p className="item-meta">稿子用哪种语言都可以。听完收下为主声，不必按语种各铸一次。</p>
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
        <button type="button" className="text-link" style={{ border: 0, background: "none", padding: 0 }} onClick={() => setMore((on) => !on)}>
          {more ? "收起选项" : "更多选项"}
        </button>
        {more ? (
          <div className="create-row">
            <label className="kit-item">
              <input type="checkbox" checked={useRef} onChange={(event) => setUseRef(event.target.checked)} disabled={!hasRef} />
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
            <div className="create-row">
              <button type="button" className="btn btn-primary" onClick={() => void keep()}>
                收下为主声
              </button>
              <select value={extraLocale} onChange={(event) => setExtraLocale(event.target.value)} aria-label="备声语种">
                <option value="zh">中文备声</option>
                <option value="en">英文备声</option>
              </select>
              <button type="button" className="btn" onClick={() => void keep(extraLocale)}>
                加为备声
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <div className="voice-mint">
        <h2 className="h">从片子旁白提一支</h2>
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
          <button type="button" className="btn btn-primary" disabled={!lineKey} onClick={() => void keepLine(false)}>
            收为主声
          </button>
          <button type="button" className="btn" disabled={!lineKey} onClick={() => void keepLine(true)}>
            加为备声
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
