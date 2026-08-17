import { useEffect, useState } from "react";
import { api } from "../api";
import { Toast } from "../components/Toast";
import { useFlash } from "../lib/flash";
import { Link } from "../components/Link";
import { assetLabel, sourceLabel } from "../lib/labels";
import { methodLabel } from "../lib/method-brief";
import { langLabel } from "../lib/langs";
import type { Asset, ProjectSummary } from "../types";

export function Films() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [library, setLibrary] = useState<Asset[]>([]);
  const { flash, error } = useFlash();

  useEffect(() => {
    Promise.all([api.projects(), api.library()])
      .then(([nextProjects, nextLibrary]) => {
        setProjects(nextProjects);
        setLibrary(nextLibrary);
      })
      .catch((err: Error) => error(err.message));
  }, []);

  return (
    <div className="page-width page">
      <h1 className="sr">片子</h1>
      <p className="lede">看 agent 出过的任务：用了什么、渲到哪、齐不齐。给 agent 的说明只在工作台复制。</p>
      <Toast flash={flash} />

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
                {methodLabel(library, project.recipe) || project.recipe || "未点名"}
              </span>
              <span className="chip">
                <em>语言</em>
                {(project.langs?.length ? project.langs : project.locales).map(langLabel).join("、") || "未点名"}
              </span>
              <span className="chip">
                <em>音色</em>
                {formatVoices(project, library)}
              </span>
              <span className="chip">
                <em>参考</em>
                {formatKit(project, library)}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function formatVoices(project: ProjectSummary, library: Asset[]): string {
  const refs = [...new Set(Object.values(project.voices ?? {}).filter(Boolean))];
  if (!refs.length) return "未点名";
  if (refs.length > 1) return "中英未绑成一套";
  return assetLabel(library, refs[0]);
}

function formatKit(project: ProjectSummary, library: Asset[]): string {
  const kit = project.kit ?? [];
  return kit.length ? kit.map((ref) => assetLabel(library, ref)).join("、") : "未点名";
}
