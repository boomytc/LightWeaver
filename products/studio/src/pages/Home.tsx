import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { Toast } from "../components/Toast";
import { useFlash } from "../lib/flash";
import { BriefPanel } from "../components/BriefPanel";
import { recipeHint } from "../lib/labels";
import type { OutputHome } from "../lib/brief";
import { langLabel } from "../lib/langs";
import { listVoicePacks } from "../lib/voices";
import type { Asset, RecipeCard } from "../types";

export function Home() {
  const [library, setLibrary] = useState<Asset[]>([]);
  const [recipes, setRecipes] = useState<RecipeCard[]>([]);
  const { flash, error } = useFlash();
  const [recipeId, setRecipeId] = useState("");
  const [voiceRef, setVoiceRef] = useState("");
  const [langs, setLangs] = useState<string[]>(["zh", "en"]);
  const [kit, setKit] = useState<string[]>([]);
  const [outputHome, setOutputHome] = useState<OutputHome | "">("");
  const [publishLightui, setPublishLightui] = useState(true);

  useEffect(() => {
    Promise.all([api.library(), api.recipes()])
      .then(([nextLibrary, nextRecipes]) => {
        setLibrary(nextLibrary);
        setRecipes(nextRecipes.filter((item) => item.level === "film"));
        const wanted = new URLSearchParams(window.location.search).get("recipe") ?? "";
        if (wanted) setRecipeId(wanted);
      })
      .catch((err: Error) => error(err.message));
  }, []);

  const voicePacks = listVoicePacks(library);
  const materials = library.filter((asset) => asset.kind === "element" || asset.kind === "reference");
  const selectedRecipe = recipes.find((item) => item.id === recipeId);
  const selectedVoice = voicePacks.find((asset) => `library:${asset.id}` === voiceRef);

  const voiceLabels = useMemo(() => {
    const map: Record<string, string> = {};
    for (const asset of voicePacks) {
      map[`library:${asset.id}`] = asset.label ?? asset.id;
    }
    return map;
  }, [voicePacks]);

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
        点名音色、素材组、方法卡、要出哪些语言，以及成片写到哪。不写进片子，不在这里排场。agent 拿说明去用 LightWeaver。
      </p>
      <Toast flash={flash} />

      <section>
        <h2 className="h">要出的语言</h2>
        <p className="item-meta">可选中文、英文，或两个都出。音色还是一套，不必两种都勾。</p>
        <ul className="kit-list lang-picks">
          {["zh", "en"].map((item) => {
            const on = langs.includes(item);
            return (
              <li key={item}>
                <label className={on ? "kit-item is-on" : "kit-item"}>
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() =>
                      setLangs((current) =>
                        current.includes(item) ? current.filter((locale) => locale !== item) : [...current, item],
                      )
                    }
                  />
                  <span>
                    <span className="item-title">{langLabel(item)}</span>
                    <span className="item-meta">{item}</span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </section>

      <section>
        <h2 className="h">产物写到哪</h2>
        <p className="item-meta">成片跟片子走，只进 data/，不进渲染器。没点就让 agent 先问。</p>
        <div className="pick-grid pick-grid-row">
          <button
            type="button"
            className={outputHome === "user" ? "pick is-on" : "pick"}
            onClick={() => setOutputHome(outputHome === "user" ? "" : "user")}
          >
            <strong>用户片</strong>
            <span className="item-meta">data/projects/&lt;id&gt;/assets/outputs/</span>
          </button>
          <button
            type="button"
            className={outputHome === "first-party" ? "pick is-on" : "pick"}
            onClick={() => setOutputHome(outputHome === "first-party" ? "" : "first-party")}
          >
            <strong>LightUI 顾客片</strong>
            <span className="item-meta">data/first-party/&lt;slug&gt;/assets/outputs/</span>
          </button>
        </div>
        {outputHome === "first-party" ? (
          <label className={publishLightui ? "kit-item is-on" : "kit-item"} style={{ marginTop: 8 }}>
            <input
              type="checkbox"
              checked={publishLightui}
              onChange={() => setPublishLightui((current) => !current)}
            />
            <span>
              <span className="item-title">再拷一份到 LightUI</span>
              <span className="item-meta">studies/&lt;slug&gt;/references/，只 mp4</span>
            </span>
          </label>
        ) : null}
      </section>

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
                <span className="item-meta">{recipeHint(recipe)}</span>
              </button>
            ))}
          </div>
        </section>

        <section>
          <h2 className="h">音色套</h2>
          <div className="pick-grid">
            {voicePacks.map((asset) => {
              const ref = `library:${asset.id}`;
              return (
                <button
                  key={asset.id}
                  type="button"
                  className={voiceRef === ref ? "pick is-on" : "pick"}
                  onClick={() => setVoiceRef(voiceRef === ref ? "" : ref)}
                >
                  <strong>{asset.label ?? asset.id}</strong>
                  <span className="item-meta">Hi-Fi clone</span>
                </button>
              );
            })}
          </div>
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
          voices: Object.fromEntries(langs.map((locale) => [locale, voiceRef])),
          voiceLabels,
          voiceSet: selectedVoice ? { ref: voiceRef, label: selectedVoice.label ?? selectedVoice.id } : undefined,
          langs,
          langLabels: Object.fromEntries(langs.map((locale) => [locale, langLabel(locale)])),
          kit,
          kitLabels,
          outputHome: outputHome || undefined,
          publish: outputHome === "first-party" ? publishLightui : outputHome === "user" ? false : undefined,
        }}
      />
    </div>
  );
}
