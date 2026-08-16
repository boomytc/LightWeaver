import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { Link } from "../components/Link";
import { BriefPanel } from "../components/BriefPanel";
import { assetLabel, kindLabel, sourceLabel } from "../lib/labels";
import { listVoicePacks } from "../lib/voices";
import { missingStillSceneIds, outputPreview, stillPreviewSrc } from "../tasks/study-explainer";
import type { Asset, ProjectDetail, RecipeCard } from "../types";

export function Film({ id }: { id: string }) {
  const [detail, setDetail] = useState<ProjectDetail | null>(null);
  const [library, setLibrary] = useState<Asset[]>([]);
  const [recipes, setRecipes] = useState<RecipeCard[]>([]);
  const [locale, setLocale] = useState("zh");
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState<string>();
  const [sceneId, setSceneId] = useState<string>();

  const load = useCallback(async () => {
    const [next, nextLibrary, nextRecipes] = await Promise.all([api.project(id), api.library(), api.recipes()]);
    setDetail(next);
    setLibrary(nextLibrary);
    setRecipes(nextRecipes.filter((item) => item.level === "film"));
    setLocale((current) => (next.film.locales[current] ? current : Object.keys(next.film.locales)[0] ?? "zh"));
    setSceneId((current) => next.film.scenes.find((scene) => scene.id === current)?.id ?? next.film.scenes[0]?.id);
  }, [id]);

  useEffect(() => {
    load().catch((err: Error) => setError(err.message));
  }, [load]);

  const scene = detail?.film.scenes.find((item) => item.id === sceneId);
  const output = useMemo(() => (detail ? outputPreview(detail, locale) : undefined), [detail, locale]);
  const preview = useMemo(() => (detail ? stillPreviewSrc(detail, scene, locale) : undefined), [detail, scene, locale]);
  const missingStills = useMemo(() => (detail ? missingStillSceneIds(detail, locale) : []), [detail, locale]);
  const voicePacks = listVoicePacks(library);
  const materials = library.filter((asset) => asset.kind === "element" || asset.kind === "reference");

  async function assignVoicePack(ref: string) {
    if (!detail) return;
    try {
      setDetail(await api.setVoicePack(detail.id, ref));
      setMessage(`音色套已点名 ${assetLabel(library, ref)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function toggleKit(ref: string) {
    if (!detail) return;
    const current = detail.film.kit ?? [];
    const next = current.includes(ref) ? current.filter((item) => item !== ref) : [...current, ref];
    try {
      setDetail(await api.setKit(detail.id, next));
      setMessage(next.length ? `素材：${next.map((item) => assetLabel(library, item)).join("、")}` : "已清空素材点名");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  if (!detail) {
    return (
      <div className="page-width page">
        {error ? <div className="banner banner-error">{error}</div> : <p className="item-meta">载入片子…</p>}
      </div>
    );
  }

  const copy = detail.film.locales[locale];

  return (
    <div className="film-page">
      <div className="page-width page film-head">
        <p className="eyebrow crumb">
          <Link href="/films" className="text-link">
            片子
          </Link>
          <span> / {detail.id}</span>
        </p>
        <div className="film-title-row">
          <h1 className="page-title">{copy?.title ?? detail.id}</h1>
          <span className={detail.renderable ? "pill pill-ok" : "pill"}>{detail.renderable ? "可渲" : "未齐"}</span>
        </div>
        <p className="item-meta">
          {sourceLabel(detail.source)} · {detail.task ?? "study-explainer"} · {detail.film.scenes.length} 场
          {detail.studySlug ? ` · lab 文本 http://127.0.0.1:5173/s/${detail.studySlug}` : ""}
        </p>
        <p className="lede">人在这里点名音色、素材和方法卡，复制说明给 agent。这个站不排、不渲。</p>
        {error ? <div className="banner banner-error">{error}</div> : null}
        {message ? <div className="banner banner-ok">{message}</div> : null}
      </div>

      <div className="page-width film-board">
        <section className="surface">
          <h2 className="h">点名给 agent</h2>
          <label className="field">
            <span>方法卡</span>
            <select
              aria-label="方法卡"
              value={detail.film.recipe ?? ""}
              onChange={(event) =>
                void api.setRecipe(detail.id, event.target.value).then(setDetail).catch((err: Error) => setError(err.message))
              }
            >
              <option value="">未点名</option>
              {recipes.map((recipe) => (
                <option key={recipe.id} value={recipe.id}>
                  {recipe.title}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>预览语种</span>
            <select aria-label="预览语种" value={locale} onChange={(event) => setLocale(event.target.value)}>
              {Object.keys(detail.film.locales).map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>音色套（中英成对）</span>
            <select
              aria-label="音色套"
              value={detail.film.voices.zh ?? detail.film.voices[locale] ?? ""}
              onChange={(event) => void assignVoicePack(event.target.value)}
            >
              <option value="">未点名</option>
              {voicePacks.map((asset) => (
                <option key={asset.id} value={`library:${asset.id}`}>
                  {asset.label ?? asset.id}
                </option>
              ))}
            </select>
          </label>
          <p className="item-meta">
            当前：{assetLabel(library, detail.film.voices.zh)}
            {" · "}
            <Link href="/voices" className="text-link">
              音色
            </Link>
            {new Set(Object.values(detail.film.voices).filter(Boolean)).size > 1
              ? " · 中英还没绑成一套，重选一次就会对齐"
              : ""}
          </p>

          <h2 className="h" style={{ marginTop: 20 }}>
            用哪些素材
          </h2>
          {materials.length === 0 ? (
            <p className="item-meta">
              库里还没有元素。先去{" "}
              <Link href="/library" className="text-link">
                素材
              </Link>{" "}
              收入。
            </p>
          ) : (
            <ul className="kit-list">
              {materials.map((asset) => {
                const ref = `library:${asset.id}`;
                const on = (detail.film.kit ?? []).includes(ref);
                return (
                  <li key={asset.id}>
                    <label className={on ? "kit-item is-on" : "kit-item"}>
                      <input type="checkbox" checked={on} onChange={() => void toggleKit(ref)} />
                      <span>
                        <span className="item-title">{asset.label ?? asset.id}</span>
                        <span className="item-meta">
                          {kindLabel(asset.kind)} · {asset.id}
                        </span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="item-meta" style={{ marginTop: 10 }}>
            {(detail.film.kit ?? []).length
              ? `已点名 ${(detail.film.kit ?? []).map((ref) => assetLabel(library, ref)).join("、")}`
              : "还没点名素材，agent 不要自己加库外元素"}
          </p>
        </section>

        <aside className="surface">
          <h2 className="h">成片 / 静帧</h2>
          <div className="preview-frame">
            {output ? (
              <video controls playsInline preload="metadata" src={output.src} />
            ) : preview ? (
              <img src={preview} alt={scene?.id ?? "静帧"} />
            ) : (
              <span>还没有成片。agent 渲完会出现在这里。</span>
            )}
          </div>
          {output ? (
            <label className="field" style={{ marginTop: 12 }}>
              <span>成片路径</span>
              <input readOnly value={output.path} onFocus={(event) => event.currentTarget.select()} />
            </label>
          ) : null}
        </aside>
      </div>

      <div className="page-width" style={{ marginBottom: 16 }}>
        <BriefPanel
          input={{
            projectId: detail.id,
            title: copy?.title,
            task: detail.task,
            recipeId: detail.film.recipe,
            recipeTitle: recipes.find((item) => item.id === detail.film.recipe)?.title,
            requiresKinds: recipes.find((item) => item.id === detail.film.recipe)?.requires_kinds,
            voices: detail.film.voices,
            voiceSet: detail.film.voices.zh
              ? { ref: detail.film.voices.zh, label: assetLabel(library, detail.film.voices.zh) }
              : undefined,
            voiceLabels: Object.fromEntries(
              listVoicePacks(library).map((asset) => [`library:${asset.id}`, asset.label ?? asset.id]),
            ),
            kit: detail.film.kit ?? [],
            kitLabels: Object.fromEntries(
              library
                .filter((asset) => asset.kind === "element" || asset.kind === "reference")
                .map((asset) => [`library:${asset.id}`, asset.label ?? asset.id]),
            ),
          }}
        />
      </div>

      <section className="page-width surface film-scenes">
          <h2 className="h">场次一览</h2>
          <p className="item-meta">只看 agent 写好的场。缺静帧可以在本片补绑，不加场。</p>
          {missingStills.length ? <p className="issue issue-warning">缺 png：{missingStills.join(", ")}</p> : null}
          <div className="list">
            {detail.film.scenes.map((item) => (
              <button
                key={item.id}
                type="button"
                className={item.id === sceneId ? "item is-active" : "item"}
                onClick={() => setSceneId(item.id)}
              >
                <span className="kind">{item.kind}</span>
                <span>
                  <span className="item-title">{item.id}</span>
                  <span className="item-meta"> {(item.lines[locale] ?? "").slice(0, 72)}</span>
                </span>
              </button>
            ))}
          </div>
          {scene ? (
            <div className="field" style={{ marginTop: 16 }}>
              <label htmlFor="line-view">旁白 · {scene.id} · {locale}</label>
              <textarea id="line-view" readOnly value={scene.lines[locale] ?? ""} />
            </div>
          ) : null}
          {detail.issues.length ? (
            <section>
              <h2 className="h">校验</h2>
              {detail.issues.map((issue) => (
                <p key={`${issue.level}:${issue.path}`} className={`issue issue-${issue.level}`}>
                  {issue.level === "error" ? "错误" : "提示"} · {issue.path} · {issue.message}
                </p>
              ))}
            </section>
          ) : null}
      </section>
    </div>
  );
}
