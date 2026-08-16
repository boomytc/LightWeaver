import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { BriefPanel } from "../components/BriefPanel";
import { recipeHint } from "../lib/labels";
import type { Asset, RecipeCard } from "../types";

export function Home() {
  const [library, setLibrary] = useState<Asset[]>([]);
  const [recipes, setRecipes] = useState<RecipeCard[]>([]);
  const [error, setError] = useState<string>();
  const [recipeId, setRecipeId] = useState("");
  const [voiceZh, setVoiceZh] = useState("");
  const [voiceEn, setVoiceEn] = useState("");
  const [kit, setKit] = useState<string[]>([]);

  useEffect(() => {
    Promise.all([api.library(), api.recipes()])
      .then(([nextLibrary, nextRecipes]) => {
        setLibrary(nextLibrary);
        setRecipes(nextRecipes.filter((item) => item.level === "film"));
        const wanted = new URLSearchParams(window.location.search).get("recipe") ?? "";
        if (wanted) setRecipeId(wanted);
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  const voices = library.filter((asset) => asset.kind === "voice");
  const materials = library.filter((asset) => asset.kind === "element" || asset.kind === "reference");
  const selectedRecipe = recipes.find((item) => item.id === recipeId);

  const voiceLabels = useMemo(() => {
    const map: Record<string, string> = {};
    for (const asset of voices) {
      map[`library:${asset.id}`] = asset.label ?? asset.id;
    }
    return map;
  }, [voices]);

  const kitLabels = useMemo(() => {
    const map: Record<string, string> = {};
    for (const asset of materials) {
      map[`library:${asset.id}`] = asset.label ?? asset.id;
    }
    return map;
  }, [materials]);

  function toggleMaterial(ref: string) {
    setKit((current) => (current.includes(ref) ? current.filter((item) => item !== ref) : [...current, ref]));
  }

  return (
    <div className="page-width page">
      <p className="eyebrow">工作台</p>
      <h1 className="page-title">选出一组，复制给 agent。</h1>
      <p className="lede">
        只点名音色、素材组和方法卡。不写进片子，不在这里排场。agent 拿说明去用 LightWeaver。
      </p>
      {error ? <div className="banner banner-error">{error}</div> : null}

      <div className="compose-grid">
        <section>
          <h2 className="h">方法卡</h2>
          <div className="pick-grid">
            {recipes.map((recipe) => (
              <button
                key={recipe.id}
                type="button"
                className={recipe.id === recipeId ? "pick is-on" : "pick"}
                onClick={() => setRecipeId(recipe.id === recipeId ? "" : recipe.id)}
              >
                <strong>{recipe.title}</strong>
                <span className="item-meta">{recipe.id}</span>
                <span className="item-meta">{recipeHint(recipe.id)}</span>
              </button>
            ))}
          </div>
        </section>

        <section>
          <h2 className="h">音色</h2>
          <label className="field">
            <span>中文</span>
            <select aria-label="中文音色" value={voiceZh} onChange={(event) => setVoiceZh(event.target.value)}>
              <option value="">未点名</option>
              {voices.map((asset) => (
                <option key={asset.id} value={`library:${asset.id}`}>
                  {asset.label ?? asset.id}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>英文</span>
            <select aria-label="英文音色" value={voiceEn} onChange={(event) => setVoiceEn(event.target.value)}>
              <option value="">未点名</option>
              {voices.map((asset) => (
                <option key={asset.id} value={`library:${asset.id}`}>
                  {asset.label ?? asset.id}
                </option>
              ))}
            </select>
          </label>
        </section>

        <section>
          <h2 className="h">素材组</h2>
          {materials.length === 0 ? (
            <p className="item-meta">还没有元素。先入库，再来勾选。</p>
          ) : (
            <ul className="kit-list">
              {materials.map((asset) => {
                const ref = `library:${asset.id}`;
                const on = kit.includes(ref);
                return (
                  <li key={asset.id}>
                    <label className={on ? "kit-item is-on" : "kit-item"}>
                      <input type="checkbox" checked={on} onChange={() => toggleMaterial(ref)} />
                      <span>
                        <span className="item-title">{asset.label ?? asset.id}</span>
                        <span className="item-meta">{asset.id}</span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      <BriefPanel
        input={{
          task: "study-explainer",
          recipeId: recipeId || undefined,
          recipeTitle: selectedRecipe?.title,
          requiresKinds: selectedRecipe?.requires_kinds,
          voices: { ...(voiceZh ? { zh: voiceZh } : {}), ...(voiceEn ? { en: voiceEn } : {}) },
          voiceLabels,
          kit,
          kitLabels,
        }}
      />
    </div>
  );
}
