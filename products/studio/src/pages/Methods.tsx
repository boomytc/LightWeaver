import { useEffect, useState } from "react";
import { api } from "../api";
import { Link } from "../components/Link";
import { recipeHint } from "../lib/labels";
import type { ProjectSummary, RecipeCard } from "../types";

export function Methods() {
  const [recipes, setRecipes] = useState<RecipeCard[]>([]);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [error, setError] = useState<string>();

  useEffect(() => {
    Promise.all([api.recipes(), api.projects()])
      .then(([nextRecipes, nextProjects]) => {
        setRecipes(nextRecipes);
        setProjects(nextProjects);
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  const filmCards = recipes.filter((item) => item.level === "film");
  const sceneCards = recipes.filter((item) => item.level === "scene");

  return (
    <div className="page-width page">
      <p className="eyebrow">人点名</p>
      <h1 className="page-title">方法</h1>
      <p className="lede">
        成片方法卡和音色、素材一样，是给 agent 的参数。点一张去首页拼进组合。场级卡只随成片卡带上，不单独点名。
      </p>
      {error ? <div className="banner banner-error">{error}</div> : null}

      <div className="card-grid">
        {filmCards.map((recipe) => {
          const usedBy = projects.filter((project) => project.recipe === recipe.id);
          return (
            <article key={recipe.id} className="film-card">
              <div className="film-card-top">
                <h2>{recipe.title}</h2>
                <span className="pill">{recipe.id}</span>
              </div>
              <p className="item-meta">{recipeHint(recipe.id)}</p>
              <p className="item-meta" style={{ marginTop: 10 }}>
                {usedBy.length
                  ? usedBy.map((project, index) => (
                      <span key={project.id}>
                        {index > 0 ? " · " : "用于 "}
                        <Link href={`/f/${encodeURIComponent(project.id)}`} className="text-link">
                          {project.titles.zh ?? project.id}
                        </Link>
                      </span>
                    ))
                  : "还没有片子点名这张卡"}
              </p>
              <p style={{ marginTop: 14 }}>
                <Link href={`/?recipe=${encodeURIComponent(recipe.id)}`} className="text-link">
                  用这张卡去组合
                </Link>
              </p>
            </article>
          );
        })}
      </div>

      <section className="section">
        <h2 className="h">随成片卡带上的场级步骤</h2>
        <p className="item-meta">这些不是给人单独选的。agent 铺骨架时按成片卡带上。</p>
        <div className="stack" style={{ marginTop: 12 }}>
          {sceneCards.map((recipe) => (
            <div key={recipe.id} className="film-row">
              <div>
                <div className="item-title">{recipe.title}</div>
                <div className="item-meta">{recipe.id}</div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
