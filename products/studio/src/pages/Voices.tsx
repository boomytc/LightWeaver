import { useEffect, useState } from "react";
import { api, candidateMedia, libraryMedia, projectMedia } from "../api";
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
  const [label, setLabel] = useState("");
  const [how, setHow] = useState<VoiceOrigin>("instruct");
  const [said, setSaid] = useState("");
  const [instruct, setInstruct] = useState("");
  const [trial, setTrial] = useState(TRIAL);
  const [more, setMore] = useState(false);
  const [denoise, setDenoise] = useState(true);
  const [doNormalize, setDoNormalize] = useState(true);
  const [cfgValue, setCfgValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [candidate, setCandidate] = useState<Candidate>();
  const [filmId, setFilmId] = useState("");
  const [film, setFilm] = useState<ProjectDetail>();
  const [lineKey, setLineKey] = useState("");

  const packs = listVoicePacks(library);

  async function reload() {
    const [nextLibrary, nextProjects] = await Promise.all([api.library(), api.projects()]);
    setLibrary(nextLibrary);
    setProjects(nextProjects);
  }

  useEffect(() => {
    reload().catch((err: Error) => setError(err.message));
  }, []);

  function taken(name: string): boolean {
    return packs.some((asset) => (asset.label ?? asset.id).trim() === name);
  }

  function resetCreate() {
    setLabel("");
    setSaid("");
    setInstruct("");
    setTrial(TRIAL);
    setCandidate(undefined);
    setFilmId("");
    setFilm(undefined);
    setLineKey("");
  }

  async function mint() {
    const name = label.trim();
    if (!name) {
      setError("先写名称");
      return;
    }
    if (taken(name)) {
      setError(`${name} 已在音色库里`);
      return;
    }
    if (!instruct.trim()) {
      setError("设计指令要先写一段描述");
      return;
    }
    setBusy(true);
    try {
      const minted = await api.mintVoice({
        id: name,
        text: trial.trim() || TRIAL,
        style: instruct.trim(),
        denoise,
        doNormalize,
        cfgValue: Number.isFinite(Number(cfgValue)) && cfgValue.trim() ? Number(cfgValue) : undefined,
      });
      setCandidate(minted);
      setMessage(`已铸试听 ${minted.seconds.toFixed(1)} 秒，听完再收进音色库`);
      setError(undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function keepDesigned() {
    if (!candidate) return;
    const name = label.trim();
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
    const name = label.trim();
    if (!name) {
      setError("先写名称");
      return;
    }
    if (taken(name)) {
      setError(`${name} 已在音色库里`);
      return;
    }
    const form = new FormData();
    form.set("file", file);
    form.set("kind", "voice");
    form.set("label", name);
    if (said.trim()) form.set("text", said.trim());
    try {
      await api.uploadLibrary(form);
      setMessage(`已把 ${name} 收进音色库`);
      setError(undefined);
      resetCreate();
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
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
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function keepLine() {
    const name = label.trim();
    if (!film || !lineKey || !name) return;
    if (taken(name)) {
      setError(`${name} 已在音色库里`);
      return;
    }
    const [lineLocale, sceneId] = lineKey.split(":");
    const line = film.paths.lineFiles.find((item) => item.locale === lineLocale && item.sceneId === sceneId && item.exists);
    if (!line?.rel) {
      setError("这场还没有旁白 wav");
      return;
    }
    try {
      await api.keepVoice({
        origin: "upload",
        label: name,
        said: film.film.scenes.find((scene) => scene.id === sceneId)?.lines[lineLocale ?? ""] ?? "",
        source: { kind: "project", projectId: film.id, rel: line.rel },
      });
      setMessage(`已把 ${name} 收进音色库`);
      setError(undefined);
      resetCreate();
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  const lines = (film?.paths.lineFiles ?? []).filter((item) => item.exists);

  return (
    <div className="page-width page">
      <p className="eyebrow">工作台</p>
      <h1 className="page-title">音色</h1>
      <p className="lede">
        上面新建一套，收下后进音色库。库里只听，不在这里改。出片走 Hi-Fi clone。
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

      <section className="section">
        <h2 className="h">新建</h2>
        <p className="item-meta">二选一。收进库之后只在下面听。</p>
        <OriginPick name="voice-origin-new" value={how} onChange={setHow} />
        <div className="form-grid">
          <label className="field field-span">
            <span>名称</span>
            <input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="例如 讲解女声" />
          </label>
          {how === "instruct" ? (
            <>
              <label className="field field-span">
                <span>设计指令</span>
                <input value={instruct} onChange={(event) => setInstruct(event.target.value)} placeholder="例如 青春女声，吐字清晰" />
              </label>
              <label className="field field-span">
                <span>文本</span>
                <input value={trial} onChange={(event) => setTrial(event.target.value)} />
              </label>
            </>
          ) : (
            <label className="field field-span">
              <span>文本</span>
              <input value={said} onChange={(event) => setSaid(event.target.value)} />
            </label>
          )}
        </div>
        {how === "instruct" ? (
          <>
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
              <div className="voice-mint">
                <div className="item-title">试听</div>
                <p className="item-meta">还没进库。听完再收。</p>
                <audio controls preload="metadata" src={candidateMedia(candidate.rel)} />
                <p className="item-meta">{candidate.seconds.toFixed(1)} 秒</p>
                <button type="button" className="btn btn-primary" onClick={() => void keepDesigned()}>
                  收下进音色库
                </button>
              </div>
            ) : null}
          </>
        ) : (
          <>
            <div className="create-row">
              <label className="btn">
                上传 wav
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
            <p className="item-meta" style={{ marginTop: 12 }}>
              或从片子旁白提一支。
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
                收进音色库
              </button>
            </div>
            {lineKey && film
              ? (() => {
                  const [locale, sceneId] = lineKey.split(":");
                  const line = film.paths.lineFiles.find((item) => item.locale === locale && item.sceneId === sceneId);
                  return line?.rel ? <audio controls preload="metadata" src={projectMedia(film.id, line.rel)} /> : null;
                })()
              : null}
          </>
        )}
      </section>

      <section className="section">
        <h2 className="h">音色库</h2>
        <p className="item-meta">已收下的克隆源。听，不在这里改。</p>
        {packs.length ? (
          <div className="stack">
            {packs.map((asset) => (
              <VoiceLibraryCard key={asset.id} asset={asset} />
            ))}
          </div>
        ) : (
          <p className="item-meta">还没有音色。上面新建一套。</p>
        )}
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
            <span className="item-meta">上传后直接听</span>
          </span>
        </label>
      </li>
      <li>
        <label className={value === "instruct" ? "kit-item is-on" : "kit-item"}>
          <input type="radio" name={name} checked={value === "instruct"} onChange={() => onChange("instruct")} />
          <span>
            <span className="item-title">设计指令</span>
            <span className="item-meta">点铸才出试听</span>
          </span>
        </label>
      </li>
    </ul>
  );
}

function VoiceLibraryCard({ asset }: { asset: Asset }) {
  const source = voiceCloneSource(asset);
  const origin = source.origin === "instruct" ? "设计指令铸出" : "上传";
  return (
    <article className="voice-card">
      <div className="voice-main">
        <div>
          <div className="item-title">{asset.label ?? asset.id}</div>
          <div className="card-id">出片 Hi-Fi · {origin}</div>
        </div>
        {source.file ? <audio controls preload="metadata" src={libraryMedia(source.file)} /> : null}
      </div>
      {source.said ? <p className="item-meta">文本：{source.said}</p> : null}
      {source.instruct ? <p className="item-meta">设计指令：{source.instruct}</p> : null}
    </article>
  );
}
