import { useEffect, useState } from "react";
import { api } from "../api";
import { Link } from "../components/Link";
import { assetLabel, sourceLabel } from "../lib/labels";
import type { Asset, ProjectSummary } from "../types";

export function Home() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [library, setLibrary] = useState<Asset[]>([]);
  const [error, setError] = useState<string>();

  useEffect(() => {
    Promise.all([api.projects(), api.library()])
      .then(([nextProjects, nextLibrary]) => {
        setProjects(nextProjects);
        setLibrary(nextLibrary);
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  const voices = library.filter((asset) => asset.kind === "voice");
  const materials = library.filter((asset) => asset.kind === "element" || asset.kind === "reference");
  const ready = projects.filter((project) => project.renderable).length;

  return (
    <div className="page-width page">
      <p className="eyebrow">本机控制站</p>
      <h1 className="page-title">人管音色和素材，片子交给 agent。</h1>
      <p className="lede">
        在这里指定用哪支声、用哪些可复用元素。场次、旁白、配音和成片仍由 agent 经 weaver 写，不在这个站里排。
      </p>

      {error ? <div className="banner banner-error">{error}</div> : null}

      <div className="door-grid">
        <Link href="/films" className="door">
          <span className="door-kicker">复核</span>
          <strong>片子</strong>
          <span className="item-meta">
            {projects.length} 部 · {ready} 部可渲
          </span>
        </Link>
        <Link href="/voices" className="door">
          <span className="door-kicker">人管</span>
          <strong>音色</strong>
          <span className="item-meta">{voices.length} 支，点名给片子用</span>
        </Link>
        <Link href="/library" className="door">
          <span className="door-kicker">人管</span>
          <strong>素材</strong>
          <span className="item-meta">{materials.length} 件元素 / 参考图</span>
        </Link>
      </div>

      <section className="section">
        <div className="section-head">
          <h2 className="h">片子用了什么</h2>
          <Link href="/films" className="text-link">
            全部
          </Link>
        </div>
        {projects.length === 0 ? (
          <p className="item-meta">还没有片子。agent 用 weaver 建片后会出现在这里。</p>
        ) : (
          <div className="stack">
            {projects.map((project) => (
              <Link key={project.id} href={`/f/${encodeURIComponent(project.id)}`} className="film-row">
                <div>
                  <div className="item-title">{project.titles.zh ?? project.id}</div>
                  <div className="item-meta">
                    {sourceLabel(project.source)} · {project.task ?? "study-explainer"} · {project.scenes} 场
                  </div>
                </div>
                <div className="film-assign">
                  <span>音色 {voiceSummary(project, library)}</span>
                  <span>素材 {kitSummary(project, library)}</span>
                  <span className={project.renderable ? "pill pill-ok" : "pill"}>{project.renderable ? "可渲" : "未齐"}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function voiceSummary(project: ProjectSummary, library: Asset[]): string {
  const refs = Object.values(project.voices ?? {}).filter(Boolean);
  if (!refs.length) return "未点名音色";
  return [...new Set(refs.map((ref) => assetLabel(library, ref)))].join(" / ");
}

function kitSummary(project: ProjectSummary, library: Asset[]): string {
  const kit = project.kit ?? [];
  if (!kit.length) return "未点名素材";
  return kit.map((ref) => assetLabel(library, ref)).join("、");
}
