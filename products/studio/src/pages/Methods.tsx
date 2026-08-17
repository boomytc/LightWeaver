import { useEffect, useState } from "react";
import { api } from "../api";
import { Toast } from "../components/Toast";
import { useFlash } from "../lib/flash";
import { Link } from "../components/Link";
import { compactWhen, recipeHint, roleLabel } from "../lib/labels";
import { methodShape } from "../lib/method-brief";
import type { RecipeCard } from "../types";

export function Methods() {
  const [recipes, setRecipes] = useState<RecipeCard[]>([]);
  const { flash, error } = useFlash();

  useEffect(() => {
    api
      .recipes()
      .then((next) => setRecipes(next.filter((item) => item.level === "film")))
      .catch((err: Error) => error(err.message));
  }, []);

  return (
    <div className="page-width page">
      <p className="eyebrow">工作台</p>
      <h1 className="page-title">方法</h1>
      <p className="lede">看有哪几张可复用成片骨架、何时用。点去组合，说明只在那边复制。场级步骤随卡带上，不单独点。</p>
      <Toast flash={flash} />

      {recipes.length === 0 ? (
        <p className="item-meta">还没有成片卡。</p>
      ) : (
        <div className="stack" style={{ marginTop: 8 }}>
          {recipes.map((recipe) => (
            <MethodCard key={recipe.id} recipe={recipe} />
          ))}
        </div>
      )}
    </div>
  );
}

function MethodCard({ recipe }: { recipe: RecipeCard }) {
  const shape = methodShape(recipe);
  const when = recipeHint(recipe) || compactWhen(recipe.when);
  const roles = (recipe.default_scenes ?? []).map((scene) => roleLabel(scene.role)).filter(Boolean);

  return (
    <article className="method-card">
      <div className="film-card-top">
        <div>
          <h2>{recipe.title}</h2>
          {when ? <p className="item-meta">{when}</p> : null}
        </div>
        <Link href={`/?recipe=${encodeURIComponent(recipe.id)}`} className="btn btn-primary">
          去组合
        </Link>
      </div>
      {shape ? (
        <p className="item-meta" style={{ marginTop: 10 }}>
          骨架 · {shape}
        </p>
      ) : null}
      {roles.length ? (
        <div className="film-assign" style={{ justifyContent: "flex-start", marginTop: 10 }}>
          {roles.map((role) => (
            <span key={role} className="chip">
              {role}
            </span>
          ))}
        </div>
      ) : recipe.requires_kinds ? (
        <p className="item-meta" style={{ marginTop: 8 }}>
          一种模型一场，不要合并。
        </p>
      ) : null}
    </article>
  );
}
