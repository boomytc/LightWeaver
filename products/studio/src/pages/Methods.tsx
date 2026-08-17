import { useEffect, useState } from "react";
import { api } from "../api";
import { Toast } from "../components/Toast";
import { useFlash } from "../lib/flash";
import { Link } from "../components/Link";
import { compactWhen, recipeHint, roleLabel } from "../lib/labels";
import { methodShape } from "../lib/method-brief";
import type { Asset, RecipeCard } from "../types";

function recipeIdOf(asset: Asset): string {
  return asset.id.replace(/^method\./, "");
}

export function Methods() {
  const [methods, setMethods] = useState<Asset[]>([]);
  const [recipes, setRecipes] = useState<RecipeCard[]>([]);
  const { flash, error } = useFlash();

  useEffect(() => {
    Promise.all([api.library(), api.recipes()])
      .then(([library, nextRecipes]) => {
        setMethods(library.filter((item) => item.kind === "method"));
        setRecipes(nextRecipes.filter((item) => item.level === "film"));
      })
      .catch((err: Error) => error(err.message));
  }, []);

  return (
    <div className="page-width page">
      <p className="eyebrow">工作台</p>
      <h1 className="page-title">方法</h1>
      <p className="lede">
        和音色、素材一样在库里。可选成片骨架：点上才用，不点就让 agent 自己铺场。内容是库里的方法资产，这里不改不删。点去组合，说明只在那边复制。
      </p>
      <Toast flash={flash} />

      {methods.length === 0 ? (
        <p className="item-meta">库里还没有方法。</p>
      ) : (
        <div className="stack" style={{ marginTop: 8 }}>
          {methods.map((asset) => (
            <MethodCard
              key={asset.id}
              asset={asset}
              recipe={recipes.find((item) => item.id === recipeIdOf(asset))}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function MethodCard({ asset, recipe }: { asset: Asset; recipe?: RecipeCard }) {
  const shape = recipe ? methodShape(recipe) : "";
  const when = asset.text?.trim() || (recipe ? recipeHint(recipe) : "") || compactWhen(recipe?.when);
  const roles = (recipe?.default_scenes ?? []).map((scene) => roleLabel(scene.role)).filter(Boolean);
  const title = asset.label ?? recipe?.title ?? recipeIdOf(asset);

  return (
    <article className="method-card">
      <div className="film-card-top">
        <div>
          <h2>{title}</h2>
          {when ? <p className="item-meta">{when}</p> : null}
        </div>
        <Link href={`/?recipe=${encodeURIComponent(recipeIdOf(asset))}`} className="btn btn-primary">
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
      ) : recipe?.requires_kinds ? (
        <p className="item-meta" style={{ marginTop: 8 }}>
          一种模型一场，不要合并。
        </p>
      ) : null}
    </article>
  );
}
