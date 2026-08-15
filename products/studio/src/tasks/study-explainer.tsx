import { useState } from "react";
import { api, projectMedia } from "../api";
import type { Asset, ProjectDetail, SceneDef } from "../types";

export function StudyExplainerPane({
  detail,
  locale,
  sceneId,
  onSelect,
  onChange,
}: {
  detail: ProjectDetail;
  locale: string;
  sceneId?: string;
  onSelect: (id: string) => void;
  onChange: (next: ProjectDetail) => void;
}) {
  const selected = detail.film.scenes.find((scene) => scene.id === sceneId);
  const stills = detail.assets.filter((asset) => asset.kind === "still");
  const [newId, setNewId] = useState("");

  async function add() {
    const id = newId.trim();
    if (!id) return;
    onChange(await api.addScene(detail.id, { id, kind: "still", still: `asset:still.${id}`, fit: "contain" }));
    setNewId("");
    onSelect(id);
  }

  return (
    <>
      {detail.studySlug ? (
        <p className="item-meta">
          lab · http://127.0.0.1:5173/s/{detail.studySlug}
        </p>
      ) : null}
      <div className="toolbar">
        <input aria-label="新场景 id" placeholder="still-id" value={newId} onChange={(e) => setNewId(e.target.value)} />
        <button type="button" className="btn" onClick={() => void add()} disabled={!newId.trim()}>
          加静帧场
        </button>
      </div>
      {detail.film.scenes.map((scene) => (
        <button
          key={scene.id}
          type="button"
          className={scene.id === sceneId ? "item is-active" : "item"}
          onClick={() => onSelect(scene.id)}
        >
          <span className="scene-row" style={{ width: "100%", border: 0, padding: 0 }}>
            <span className="kind">
              {scene.kind}
              {scene.role ? ` · ${scene.role}` : ""}
            </span>
            <span>
              <span className="item-title">{scene.id}</span>
              <span className="item-meta"> {(scene.lines[locale] ?? "").slice(0, 48)}</span>
            </span>
          </span>
        </button>
      ))}
      {selected ? (
        <SceneEditor
          detail={detail}
          scene={selected}
          locale={locale}
          stills={stills}
          onChange={onChange}
        />
      ) : null}
    </>
  );
}

function SceneEditor({
  detail,
  scene,
  locale,
  stills,
  onChange,
}: {
  detail: ProjectDetail;
  scene: SceneDef;
  locale: string;
  stills: Asset[];
  onChange: (next: ProjectDetail) => void;
}) {
  const copy = detail.film.locales[locale];
  const scenes = detail.film.scenes;
  const index = scenes.findIndex((item) => item.id === scene.id);
  const before = index > 0 ? scenes[index - 1] : undefined;
  const after = index >= 0 ? scenes[index + 1] : undefined;

  return (
    <div style={{ marginTop: 16 }}>
      {scene.kind === "still" ? (
        <div className="toolbar">
          <button
            type="button"
            className="btn"
            disabled={!before || before.kind === "title"}
            onClick={() => void api.moveScene(detail.id, scene.id, scenes[index - 2]?.id).then(onChange)}
          >
            上移
          </button>
          <button
            type="button"
            className="btn"
            disabled={!after || after.kind === "close"}
            onClick={() => after && void api.moveScene(detail.id, scene.id, after.id).then(onChange)}
          >
            下移
          </button>
          <button type="button" className="btn" onClick={() => void api.removeScene(detail.id, scene.id).then(onChange)}>
            删除
          </button>
        </div>
      ) : null}

      {scene.kind === "title" && copy ? (
        <CardFields
          which="title"
          headline={copy.titleCard.headline ?? ""}
          lede={copy.titleCard.lede ?? ""}
          kicker={copy.titleCard.kicker ?? ""}
          tags={(copy.titleCard.tags ?? []).join(", ")}
          points={(copy.titleCard.points ?? []).join("\n")}
          onSave={(body) => api.setCard(detail.id, { locale, which: "title", ...body }).then(onChange)}
        />
      ) : null}
      {scene.kind === "close" && copy ? (
        <CardFields
          which="close"
          headline={copy.closeCard.headline ?? ""}
          lede={copy.closeCard.lede ?? ""}
          points={(copy.closeCard.points ?? []).join("\n")}
          onSave={(body) => api.setCard(detail.id, { locale, which: "close", ...body }).then(onChange)}
        />
      ) : null}

      {scene.kind === "still" ? (
        <>
          <div className="field">
            <label htmlFor="still-ref">静帧</label>
            <select
              id="still-ref"
              value={scene.still ?? ""}
              onChange={(event) =>
                void api.patchScene(detail.id, scene.id, { still: event.target.value || undefined }).then(onChange)
              }
            >
              <option value="">未绑定</option>
              {stills.map((asset) => (
                <option key={asset.id} value={`asset:${asset.id}`}>
                  {asset.label ?? asset.id}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="fit">fit</label>
            <select
              id="fit"
              value={scene.fit ?? "cover"}
              onChange={(event) => void api.patchScene(detail.id, scene.id, { fit: event.target.value }).then(onChange)}
            >
              <option value="cover">cover</option>
              <option value="contain">contain</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="role">role</label>
            <select
              id="role"
              value={scene.role ?? ""}
              onChange={(event) =>
                void api
                  .patchScene(detail.id, scene.id, { role: event.target.value || undefined })
                  .then(onChange)
              }
            >
              <option value="">（无）</option>
              <option value="problem">problem</option>
              <option value="rule">rule</option>
              <option value="contrast">contrast</option>
            </select>
          </div>
        </>
      ) : null}

      <div className="field">
        <label htmlFor="line">旁白 · {scene.id} · {locale}</label>
        <textarea
          id="line"
          key={`${scene.id}-${locale}-${scene.lines[locale] ?? ""}`}
          defaultValue={scene.lines[locale] ?? ""}
          onBlur={(event) => {
            if (event.target.value !== (scene.lines[locale] ?? "")) {
              void api.patchScene(detail.id, scene.id, { lines: { [locale]: event.target.value } }).then(onChange);
            }
          }}
        />
      </div>
    </div>
  );
}

function CardFields({
  which,
  headline,
  lede,
  kicker,
  tags,
  points,
  onSave,
}: {
  which: "title" | "close";
  headline: string;
  lede: string;
  kicker?: string;
  tags?: string;
  points?: string;
  onSave: (body: Record<string, unknown>) => Promise<void>;
}) {
  const [h, setH] = useState(headline);
  const [l, setL] = useState(lede);
  const [k, setK] = useState(kicker ?? "");
  const [t, setT] = useState(tags ?? "");
  const [p, setP] = useState(points ?? "");
  const save = (next?: { headline?: string; lede?: string; kicker?: string; tags?: string[]; points?: string[] }) => {
    const body: Record<string, unknown> = {
      headline: next?.headline ?? h,
      lede: next?.lede ?? l,
      points: (next?.points ?? p.split("\n").map((item) => item.trim()).filter(Boolean)),
    };
    if (which === "title") {
      body.kicker = next?.kicker ?? k;
      body.tags = next?.tags ?? t.split(",").map((item) => item.trim()).filter(Boolean);
    }
    void onSave(body);
  };
  return (
    <>
      {which === "title" ? (
        <div className="field">
          <label htmlFor="kicker">kicker</label>
          <input id="kicker" value={k} onChange={(e) => setK(e.target.value)} onBlur={() => save({ kicker: k })} />
        </div>
      ) : null}
      <div className="field">
        <label htmlFor="headline">headline</label>
        <input id="headline" value={h} onChange={(e) => setH(e.target.value)} onBlur={() => save({ headline: h })} />
      </div>
      <div className="field">
        <label htmlFor="lede">lede（一句）</label>
        <textarea id="lede" value={l} onChange={(e) => setL(e.target.value)} onBlur={() => save({ lede: l })} />
      </div>
      <div className="field">
        <label htmlFor="points">要点（一行一条；对照用 || ）</label>
        <textarea id="points" value={p} onChange={(e) => setP(e.target.value)} onBlur={() => save({ points: p.split("\n").map((item) => item.trim()).filter(Boolean) })} />
      </div>
      {which === "title" ? (
        <div className="field">
          <label htmlFor="tags">tags（逗号分隔）</label>
          <input id="tags" value={t} onChange={(e) => setT(e.target.value)} onBlur={() => save({ tags: t.split(",").map((item) => item.trim()).filter(Boolean) })} />
        </div>
      ) : null}
    </>
  );
}

export function stillPreviewSrc(detail: ProjectDetail, scene: SceneDef | undefined, locale: string): string | undefined {
  if (!detail || !scene?.still) return undefined;
  const id = scene.still.replace(/^asset:/, "");
  const asset = detail.assets.find((item) => item.id === id);
  const file = asset?.files?.[locale] ?? asset?.file;
  return file ? projectMedia(detail.id, file) : undefined;
}

export function outputPreview(
  detail: ProjectDetail,
  locale: string,
): { src: string; path: string } | undefined {
  const out = detail.paths.outputFiles[locale];
  if (!out?.exists || !out.rel) return undefined;
  return { src: projectMedia(detail.id, out.rel), path: out.path };
}

export function missingStillSceneIds(detail: ProjectDetail, locale: string): string[] {
  return detail.paths.stillFiles
    .filter((file) => file.locale === locale && file.exists !== true)
    .map((file) => file.sceneId);
}
