import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { BriefPanel } from "../components/BriefPanel";
import { Link } from "../components/Link";
import { assetLabel, recipeHint, sourceLabel } from "../lib/labels";
import type { Asset, ProjectSummary, RecipeCard } from "../types";

export function Home() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [library, setLibrary] = useState<Asset[]>([]);
  const [recipes, setRecipes] = useState<RecipeCard[]>([]);
  const [error, setError] = useState<string>();
  const [projectId, setProjectId] = useState("");
  const [recipeId, setRecipeId] = useState("");
  const [voiceZh, setVoiceZh] = useState("");
  const [voiceEn, setVoiceEn] = useState("");
  const [kit, setKit] = useState<string[]>([]);
  const [message, setMessage] = useState<string>();

  useEffect(() => {
    Promise.all([api.projects(), api.library(), api.recipes()])
      .then(([nextProjects, nextLibrary, nextRecipes]) => {
        setProjects(nextProjects);
        setLibrary(nextLibrary);
        setRecipes(nextRecipes.filter((item) => item.level === "film"));
        const wanted = new URLSearchParams(window.location.search).get("recipe") ?? "";
        const first = nextProjects.find((item) => item.recipe === wanted) ?? nextProjects[0];
        if (first) applyProject(first);
        if (wanted) setRecipeId(wanted);
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  function applyProject(project: ProjectSummary | undefined) {
    if (!project) {
      setProjectId("");
      return;
    }
    setProjectId(project.id);
    setRecipeId(project.recipe ?? "");
    setVoiceZh(project.voices?.zh ?? "");
    setVoiceEn(project.voices?.en ?? "");
    setKit(project.kit ?? []);
  }

  const voices = library.filter((asset) => asset.kind === "voice");
  const materials = library.filter((asset) => asset.kind === "element" || asset.kind === "reference");
  const selected = projects.find((project) => project.id === projectId);
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

  async function persist(next: {
    recipe?: string;
    voiceZh?: string;
    voiceEn?: string;
    kit?: string[];
  }) {
    if (!projectId) return;
    try {
      if (next.recipe !== undefined) await api.setRecipe(projectId, next.recipe);
      if (next.voiceZh !== undefined) await api.setVoice(projectId, "zh", next.voiceZh);
      if (next.voiceEn !== undefined) await api.setVoice(projectId, "en", next.voiceEn);
      if (next.kit !== undefined) await api.setKit(projectId, next.kit);
      setProjects(await api.projects());
      setMessage("已写进片子，可复制给 agent。");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  function pickRecipe(id: string) {
    setRecipeId(id);
    void persist({ recipe: id });
  }

  function pickVoice(locale: "zh" | "en", ref: string) {
    if (locale === "zh") setVoiceZh(ref);
    else setVoiceEn(ref);
    void persist(locale === "zh" ? { voiceZh: ref } : { voiceEn: ref });
  }

  function toggleMaterial(ref: string) {
    const next = kit.includes(ref) ? kit.filter((item) => item !== ref) : [...kit, ref];
    setKit(next);
    void persist({ kit: next });
  }

  return (
    <div className="page-width page">
      <p className="eyebrow">组合</p>
      <h1 className="page-title">选音色、素材、方法卡，复制给 agent。</h1>
      <p className="lede">
        人在这里点名组合。agent 拿复制出的说明去用 LightWeaver，不在这个站里排场或出片。
      </p>
      {error ? <div className="banner banner-error">{error}</div> : null}
      {message ? <div className="banner banner-ok">{message}</div> : null}

      <label className="field" style={{ marginTop: 24, maxWidth: 360 }}>
        <span>绑到哪部片子（可选）</span>
        <select
          aria-label="片子"
          value={projectId}
          onChange={(event) => {
            const next = projects.find((item) => item.id === event.target.value);
            applyProject(next);
            if (!event.target.value) {
              setRecipeId("");
              setVoiceZh("");
              setVoiceEn("");
              setKit([]);
            }
          }}
        >
          <option value="">不绑片子，只复制说明</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.titles.zh ?? project.id}
            </option>
          ))}
        </select>
      </label>

      <div className="compose-grid">
        <section>
          <h2 className="h">方法卡</h2>
          <div className="pick-grid">
            {recipes.map((recipe) => (
              <button
                key={recipe.id}
                type="button"
                className={recipe.id === recipeId ? "pick is-on" : "pick"}
                onClick={() => pickRecipe(recipe.id)}
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
            <select aria-label="中文音色" value={voiceZh} onChange={(event) => pickVoice("zh", event.target.value)}>
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
            <select aria-label="英文音色" value={voiceEn} onChange={(event) => pickVoice("en", event.target.value)}>
              <option value="">未点名</option>
              {voices.map((asset) => (
                <option key={asset.id} value={`library:${asset.id}`}>
                  {asset.label ?? asset.id}
                </option>
              ))}
            </select>
          </label>
          <p className="item-meta">
            库不够去{" "}
            <Link href="/voices" className="text-link">
              音色
            </Link>
            ；方法卡目录在{" "}
            <Link href="/methods" className="text-link">
              方法
            </Link>
          </p>
        </section>

        <section>
          <h2 className="h">素材</h2>
          {materials.length === 0 ? (
            <p className="item-meta">
              还没有元素。去{" "}
              <Link href="/library" className="text-link">
                素材
              </Link>{" "}
              收入。
            </p>
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
          projectId: projectId || undefined,
          title: selected?.titles.zh,
          task: selected?.task ?? "study-explainer",
          recipeId: recipeId || undefined,
          recipeTitle: selectedRecipe?.title,
          requiresKinds: selectedRecipe?.requires_kinds,
          voices: { ...(voiceZh ? { zh: voiceZh } : {}), ...(voiceEn ? { en: voiceEn } : {}) },
          voiceLabels,
          kit,
          kitLabels,
        }}
      />

      <section className="section">
        <div className="section-head">
          <h2 className="h">已点名的片子</h2>
          <Link href="/films" className="text-link">
            全部
          </Link>
        </div>
        <div className="stack">
          {projects.map((project) => (
            <Link key={project.id} href={`/f/${encodeURIComponent(project.id)}`} className="film-row">
              <div>
                <div className="item-title">{project.titles.zh ?? project.id}</div>
                <div className="item-meta">
                  {sourceLabel(project.source)} · {project.scenes} 场
                </div>
              </div>
              <div className="film-assign">
                <span className="chip">
                  <em>方法</em>
                  {recipes.find((item) => item.id === project.recipe)?.title ?? project.recipe ?? "未点名"}
                </span>
                <span className="chip">
                  <em>音色</em>
                  {voiceSummary(project, library)}
                </span>
                <span className="chip">
                  <em>素材</em>
                  {kitSummary(project, library)}
                </span>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

function voiceSummary(project: ProjectSummary, library: Asset[]): string {
  const refs = Object.values(project.voices ?? {}).filter(Boolean);
  if (!refs.length) return "未点名";
  return [...new Set(refs.map((ref) => assetLabel(library, ref)))].join(" / ");
}

function kitSummary(project: ProjectSummary, library: Asset[]): string {
  const kit = project.kit ?? [];
  if (!kit.length) return "未点名";
  return kit.map((ref) => assetLabel(library, ref)).join("、");
}
