import { useEffect, useState } from "react";
import { api } from "../api";
import { Link } from "../components/Link";
import { navigate } from "../lib/nav";
import { assetLabel, sourceLabel } from "../lib/labels";
import type { Asset, ProjectSummary } from "../types";

export function Films() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [library, setLibrary] = useState<Asset[]>([]);
  const [error, setError] = useState<string>();
  const [newId, setNewId] = useState("");
  const [newTitle, setNewTitle] = useState("");

  useEffect(() => {
    Promise.all([api.projects(), api.library()])
      .then(([nextProjects, nextLibrary]) => {
        setProjects(nextProjects);
        setLibrary(nextLibrary);
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  async function create() {
    try {
      const created = await api.createProject(newId.trim(), newTitle.trim() || newId.trim());
      navigate(`/f/${encodeURIComponent(created.id)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="page-width page">
      <p className="eyebrow">复核</p>
      <h1 className="page-title">片子</h1>
      <p className="lede">看每部片子点名了哪支声、哪些素材。编排和出片走 agent，不要在这里加场或生成。</p>
      {error ? <div className="banner banner-error">{error}</div> : null}

      <div className="card-grid">
        {projects.map((project) => (
          <Link key={project.id} href={`/f/${encodeURIComponent(project.id)}`} className="film-card">
            <div className="film-card-top">
              <h2>{project.titles.zh ?? project.id}</h2>
              <span className={project.renderable ? "pill pill-ok" : "pill"}>{project.renderable ? "可渲" : "未齐"}</span>
            </div>
            <p className="item-meta">
              {sourceLabel(project.source)} · {project.task ?? "study-explainer"} · {project.scenes} 场
            </p>
            <div className="film-assign" style={{ justifyContent: "flex-start", marginTop: 12 }}>
              <span className="chip">
                <em>方法</em>
                {project.recipe ?? "未点名"}
              </span>
              <span className="chip">
                <em>音色</em>
                {formatVoices(project, library)}
              </span>
              <span className="chip">
                <em>素材</em>
                {formatKit(project, library)}
              </span>
            </div>
          </Link>
        ))}
      </div>

      <section className="section">
        <h2 className="h">给 agent 留一个空壳</h2>
        <p className="item-meta">只建目录，不在这里写旁白。agent 随后用 weaver 填场。</p>
        <div className="create-row">
          <input aria-label="项目 id" placeholder="kebab-id" value={newId} onChange={(event) => setNewId(event.target.value)} />
          <input aria-label="标题" placeholder="标题（可选）" value={newTitle} onChange={(event) => setNewTitle(event.target.value)} />
          <button type="button" className="btn" onClick={() => void create()} disabled={!newId.trim()}>
            建到 data/projects
          </button>
        </div>
      </section>
    </div>
  );
}

function formatVoices(project: ProjectSummary, library: Asset[]): string {
  const locales = Object.keys(project.voices ?? {});
  if (!locales.length) return "未点名";
  return locales.map((locale) => `${locale} · ${assetLabel(library, project.voices[locale])}`).join("；");
}

function formatKit(project: ProjectSummary, library: Asset[]): string {
  const kit = project.kit ?? [];
  return kit.length ? kit.map((ref) => assetLabel(library, ref)).join("、") : "未点名";
}
