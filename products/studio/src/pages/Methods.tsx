import { useEffect, useState } from "react";
import { api } from "../api";
import { Toast } from "../components/Toast";
import { useFlash } from "../lib/flash";
import { Link } from "../components/Link";
import { compactWhen, recipeHint, roleLabel } from "../lib/labels";
import { buildMethodBrief, methodApplyLine, methodShape } from "../lib/method-brief";
import type { ProjectSummary, RecipeCard } from "../types";

export function Methods() {
  const [recipes, setRecipes] = useState<RecipeCard[]>([]);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const { flash, error } = useFlash();

  useEffect(() => {
    Promise.all([api.recipes(), api.projects()])
      .then(([nextRecipes, nextProjects]) => {
        setRecipes(nextRecipes);
        setProjects(nextProjects);
      })
      .catch((err: Error) => error(err.message));
  }, []);

  const filmCards = recipes.filter((item) => item.level === "film");
  const byTask = new Map<string, RecipeCard[]>();
  for (const recipe of filmCards) {
    const bucket = byTask.get(recipe.task) ?? [];
    bucket.push(recipe);
    byTask.set(recipe.task, bucket);
  }

  return (
    <div className="page-width page">
      <p className="eyebrow">工作台</p>
      <h1 className="page-title">方法</h1>
      <p className="lede">
        可复用的成片骨架。下一张同类片子点同一张卡就能铺同样的形状。片子是实例，卡不是。
      </p>
      <Toast flash={flash} />

      {[...byTask.entries()].map(([task, cards]) => (
        <section key={task} style={{ marginTop: 28 }}>
          <h2 className="h">{task}</h2>
          <p className="item-meta">这个任务下的成片卡。场级步骤随卡带上，不单独点名。</p>
          <div className="stack" style={{ marginTop: 14 }}>
            {cards.map((recipe) => (
              <MethodCard key={recipe.id} recipe={recipe} projects={projects} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function MethodCard({ recipe, projects }: { recipe: RecipeCard; projects: ProjectSummary[] }) {
  const [copied, setCopied] = useState(false);
  const brief = buildMethodBrief(recipe);
  const shape = methodShape(recipe);
  const examples = recipe.canon ?? [];

  async function copy() {
    try {
      await navigator.clipboard.writeText(brief);
    } catch {
      const box = document.createElement("textarea");
      box.value = brief;
      document.body.appendChild(box);
      box.select();
      document.execCommand("copy");
      box.remove();
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <article className="method-card">
      <div className="film-card-top">
        <div>
          <h2>{recipe.title}</h2>
          <div className="card-id">{recipe.id}</div>
        </div>
        <button type="button" className="btn" onClick={() => void copy()}>
          {copied ? "已复制" : "复制用法"}
        </button>
      </div>
      <p className="item-meta">{recipeHint(recipe) || compactWhen(recipe.when)}</p>
      {shape ? (
        <p className="item-meta" style={{ marginTop: 8 }}>
          骨架 · {shape}
        </p>
      ) : null}
      {recipe.default_scenes?.length ? (
        <div className="film-assign" style={{ justifyContent: "flex-start", marginTop: 10 }}>
          {recipe.default_scenes.map((scene) => (
            <span key={scene.id} className="chip">
              <em>{roleLabel(scene.role) || scene.kind}</em>
              {scene.id}
            </span>
          ))}
        </div>
      ) : recipe.requires_kinds ? (
        <p className="item-meta" style={{ marginTop: 8 }}>
          下一张片子传入 kinds，一种模型一场。
        </p>
      ) : null}
      <pre className="brief-text" style={{ marginTop: 12 }}>
        {methodApplyLine(recipe)}
      </pre>
      <div className="method-actions">
        <Link href={`/?recipe=${encodeURIComponent(recipe.id)}`} className="text-link">
          用这张卡去组合
        </Link>
        <span className="item-meta">
          {examples.length
            ? examples.map((id, index) => {
                const project = projects.find((item) => item.id === id);
                return (
                  <span key={id}>
                    {index > 0 ? " · " : "举过例 "}
                    {project ? (
                      <Link href={`/f/${encodeURIComponent(project.id)}`} className="text-link">
                        {project.titles.zh ?? id}
                      </Link>
                    ) : (
                      id
                    )}
                  </span>
                );
              })
            : "还没有实例。下一张片子可以直接 apply。"}
        </span>
      </div>
    </article>
  );
}
