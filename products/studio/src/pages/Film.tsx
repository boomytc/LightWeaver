import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { Link } from "../components/Link";
import { assetLabel, sourceLabel } from "../lib/labels";
import { Toast } from "../components/Toast";
import { useFlash } from "../lib/flash";
import { filmLangs, langLabel } from "../lib/langs";
import { methodLabel } from "../lib/method-brief";
import { filmVoiceRef } from "../lib/voices";
import { clipTime, missingSourceRefs, ostLabel, sceneLinePreview, sourcePreviewSrc } from "../tasks/footage-narration";
import { missingStillSceneIds, outputPreview, stillPreviewSrc } from "../tasks/study-explainer";
import type { Asset, ProjectDetail } from "../types";

export function Film({ id }: { id: string }) {
  const [detail, setDetail] = useState<ProjectDetail | null>(null);
  const [library, setLibrary] = useState<Asset[]>([]);
  const [locale, setLocale] = useState("zh");
  const { flash, error } = useFlash();
  const [loadFailed, setLoadFailed] = useState(false);
  const [sceneId, setSceneId] = useState<string>();

  const load = useCallback(async () => {
    const [next, nextLibrary] = await Promise.all([api.project(id), api.library()]);
    setDetail(next);
    setLibrary(nextLibrary);
    setLocale((current) => {
      const langs = filmLangs(next.film);
      if (langs.includes(current)) return current;
      return langs[0] ?? Object.keys(next.film.locales)[0] ?? "zh";
    });
    setSceneId((current) => next.film.scenes.find((scene) => scene.id === current)?.id ?? next.film.scenes[0]?.id);
  }, [id]);

  useEffect(() => {
    load().catch((err: Error) => {
      setLoadFailed(true);
      error(err.message);
    });
  }, [load]);

  const scene = detail?.film.scenes.find((item) => item.id === sceneId);
  const output = useMemo(() => (detail ? outputPreview(detail, locale) : undefined), [detail, locale]);
  const isFootage = detail?.task === "footage-narration";
  const preview = useMemo(() => {
    if (!detail) return undefined;
    if (detail.task === "footage-narration") return sourcePreviewSrc(detail);
    return stillPreviewSrc(detail, scene, locale);
  }, [detail, scene, locale]);
  const missingStills = useMemo(() => (detail && !isFootage ? missingStillSceneIds(detail, locale) : []), [detail, locale, isFootage]);
  const missingSources = useMemo(() => (detail && isFootage ? missingSourceRefs(detail) : []), [detail, isFootage]);

  if (!detail) {
    return (
      <div className="page-width page">
        <Toast flash={flash} />
        <p className="item-meta">{loadFailed ? "片子载不进来" : "载入片子…"}</p>
      </div>
    );
  }

  const copy = detail.film.locales[locale];
  const packRef = filmVoiceRef(detail.film.voices);
  const recipeTitle = methodLabel(library, detail.film.recipe) || detail.film.recipe;
  const langs = filmLangs(detail.film);
  const kit = detail.film.kit ?? [];

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
          {sourceLabel(detail.source)} · {detail.task || "未点"} · {detail.film.scenes.length} 场
        </p>
        <p className="lede">复盘这场出片：看场次、旁白和成片。不在这里改组合。给 agent 的说明只在工作台复制。</p>
        <Toast flash={flash} />
      </div>

      <div className="page-width film-board">
        <section className="surface">
          <h2 className="h">当时用了什么</h2>
          <div className="film-assign" style={{ justifyContent: "flex-start" }}>
            <span className="chip">
              <em>方法</em>
              {recipeTitle ?? "未点名"}
            </span>
            <span className="chip">
              <em>语言</em>
              {langs.map(langLabel).join("、") || "未点名"}
            </span>
            <span className="chip">
              <em>音色</em>
              {packRef ? assetLabel(library, packRef) : "未点名"}
            </span>
            <span className="chip">
              <em>参考</em>
              {kit.length ? kit.map((ref) => assetLabel(library, ref)).join("、") : "未点名"}
            </span>
          </div>
          <p className="item-meta" style={{ marginTop: 12 }}>
            点语言只换这边在看的成片和旁白。
          </p>
          <ul className="kit-list lang-picks">
            {Object.keys(detail.film.locales).map((item) => {
              const on = item === locale;
              return (
                <li key={item}>
                  <button type="button" className={on ? "kit-item is-on" : "kit-item"} onClick={() => setLocale(item)}>
                    <span className="item-title">
                      {langLabel(item)}
                      {on ? " · 正在看" : langs.includes(item) ? "" : " · 这次没出"}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        <aside className="surface">
          <h2 className="h">{isFootage ? "成片 / 源片" : "成片 / 静帧"}</h2>
          <div className="preview-frame">
            {output ? (
              <video controls playsInline preload="metadata" src={output.src} />
            ) : isFootage && preview ? (
              <video controls playsInline preload="metadata" src={preview} />
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

      <section className="page-width surface film-scenes">
        <h2 className="h">场次一览</h2>
        <p className="item-meta">只看已经写下的场和旁白。</p>
        {missingStills.length ? <p className="issue issue-warning">缺 png：{missingStills.join(", ")}</p> : null}
        {missingSources.length ? <p className="issue issue-warning">缺源视频：{missingSources.join(", ")}</p> : null}
        <div className="list">
          {detail.film.scenes.map((item) => (
            <button
              key={item.id}
              type="button"
              className={item.id === sceneId ? "item is-active" : "item"}
              onClick={() => setSceneId(item.id)}
            >
              <span className="kind">{item.kind}{item.ost ? ` · ${ostLabel(item.ost)}` : ""}</span>
              <span>
                <span className="item-title">{item.id}{clipTime(item) ? ` · ${clipTime(item)}` : ""}</span>
                <span className="item-meta"> {sceneLinePreview(item, locale)}</span>
              </span>
            </button>
          ))}
        </div>
        {scene ? (
          <div className="field" style={{ marginTop: 16 }}>
            <label htmlFor="line-view">
              旁白 · {scene.id} · {locale}
            </label>
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
