import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { Toast } from "../components/Toast";
import { useFlash } from "../lib/flash";
import { Link } from "../components/Link";
import { compactWhen, recipeHint } from "../lib/labels";
import { methodShape, methodShapeKind, methodShapeName, recipeIdOfMethod, type MethodShape } from "../lib/method-brief";
import type { Asset, RecipeCard } from "../types";

export function Methods() {
  const [methods, setMethods] = useState<Asset[]>([]);
  const [recipes, setRecipes] = useState<RecipeCard[]>([]);
  const { flash, ok, error } = useFlash();
  const [label, setLabel] = useState("");
  const [when, setWhen] = useState("");
  const [shape, setShape] = useState<MethodShape>("problem-then-rule");
  const [busy, setBusy] = useState(false);

  async function reload() {
    const [library, nextRecipes] = await Promise.all([api.library(), api.recipes()]);
    setMethods(library.filter((item) => item.kind === "method"));
    setRecipes(nextRecipes.filter((item) => item.level === "film"));
  }

  useEffect(() => {
    reload().catch((err: Error) => error(err.message));
  }, []);

  function taken(name: string, except?: string): boolean {
    return methods.some((item) => item.id !== except && (item.label ?? recipeIdOfMethod(item)).trim() === name);
  }

  async function create() {
    const name = label.trim();
    const text = when.trim();
    if (!name) {
      error("先写名称");
      return;
    }
    if (!text) {
      error("先写何时用");
      return;
    }
    if (taken(name)) {
      error(`${name} 已在方法库里`);
      return;
    }
    setBusy(true);
    try {
      await api.createMethod({ label: name, text, shape });
      ok(`已保存 ${name}`);
      setLabel("");
      setWhen("");
      setShape("problem-then-rule");
      await reload();
    } catch (err) {
      error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page-width page">
      <p className="eyebrow">工作台</p>
      <h1 className="page-title">方法</h1>
      <p className="lede">
        可选成片骨架，和音色、素材同类。这里管库：加、改、删。点上才约束 agent，不点就让它自己铺场。点去组合，说明只在那边复制。
      </p>
      <Toast flash={flash} />

      <div className="voice-board">
        <section className="surface create-panel">
          <h2 className="sr">新建</h2>
          <label className="field">
            <span>名称</span>
            <input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="例如 问题然后规则" />
          </label>
          <label className="field">
            <span>何时用</span>
            <textarea
              value={when}
              onChange={(event) => setWhen(event.target.value)}
              placeholder="一句话：什么片子该点这套骨架"
            />
          </label>
          <ShapePick name="method-shape-new" value={shape} onChange={setShape} />
          <div className="create-save">
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void create()}>
              {busy ? "正在保存…" : "保存方法"}
            </button>
          </div>
        </section>

        <section className="voice-shelf" aria-label="方法库">
          <h2 className="sr">方法库</h2>
          {methods.length ? (
            <div className="stack">
              {methods.map((asset) => (
                <MethodLibraryCard
                  key={asset.id}
                  asset={asset}
                  recipe={recipes.find((item) => item.id === recipeIdOfMethod(asset))}
                  taken={(name) => taken(name, asset.id)}
                  onChanged={reload}
                  onError={error}
                  onMessage={ok}
                />
              ))}
            </div>
          ) : (
            <p className="item-meta">还没有方法。在新建里收一套。</p>
          )}
        </section>
      </div>
    </div>
  );
}

function ShapePick({
  name,
  value,
  onChange,
}: {
  name: string;
  value: MethodShape;
  onChange: (next: MethodShape) => void;
}) {
  return (
    <ul className="origin-picks">
      <li>
        <label className={value === "problem-then-rule" ? "pick is-on" : "pick"}>
          <input
            type="radio"
            name={name}
            checked={value === "problem-then-rule"}
            onChange={() => onChange("problem-then-rule")}
          />
          <span>
            <strong>{methodShapeName("problem-then-rule")}</strong>
          </span>
        </label>
      </li>
      <li>
        <label className={value === "kinds" ? "pick is-on" : "pick"}>
          <input type="radio" name={name} checked={value === "kinds"} onChange={() => onChange("kinds")} />
          <span>
            <strong>{methodShapeName("kinds")}</strong>
          </span>
        </label>
      </li>
    </ul>
  );
}

function MethodLibraryCard({
  asset,
  recipe,
  taken,
  onChanged,
  onError,
  onMessage,
}: {
  asset: Asset;
  recipe?: RecipeCard;
  taken: (name: string) => boolean;
  onChanged: () => Promise<void>;
  onError: (message?: string) => void;
  onMessage: (message?: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const title = asset.label ?? recipe?.title ?? recipeIdOfMethod(asset);
  const when = asset.text?.trim() || (recipe ? recipeHint(recipe) : "") || compactWhen(recipe?.when);
  const shape = recipe ? methodShape(recipe) : "";

  async function remove() {
    if (!window.confirm(`删除后，点过这个方法的片子会缺骨架。确定删除「${title}」？`)) return;
    try {
      await api.removeLibrary(asset.id);
      onError(undefined);
      onMessage(`已删除 ${title}`);
      setOpen(false);
      await onChanged();
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <>
      <article className="voice-row">
        <div>
          <div className="item-title">{title}</div>
          {when ? <div className="item-meta">{when}</div> : null}
          {shape ? <div className="item-meta">骨架 · {shape}</div> : null}
        </div>
        <div className="voice-row-actions">
          <Link href={`/?recipe=${encodeURIComponent(recipeIdOfMethod(asset))}`} className="btn btn-primary">
            去组合
          </Link>
          <button type="button" className="btn" onClick={() => setOpen(true)}>
            详情
          </button>
          <button type="button" className="btn btn-danger" onClick={() => void remove()}>
            删除
          </button>
        </div>
      </article>
      {open ? (
        <MethodDetail
          asset={asset}
          recipe={recipe}
          taken={taken}
          onClose={() => setOpen(false)}
          onChanged={onChanged}
          onError={onError}
          onMessage={onMessage}
          onRemove={() => void remove()}
        />
      ) : null}
    </>
  );
}

function MethodDetail({
  asset,
  recipe,
  taken,
  onClose,
  onChanged,
  onError,
  onMessage,
  onRemove,
}: {
  asset: Asset;
  recipe?: RecipeCard;
  taken: (name: string) => boolean;
  onClose: () => void;
  onChanged: () => Promise<void>;
  onError: (message?: string) => void;
  onMessage: (message?: string) => void;
  onRemove: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = `method-detail-${asset.id}`;
  const [name, setName] = useState(asset.label ?? recipe?.title ?? recipeIdOfMethod(asset));
  const [when, setWhen] = useState(asset.text?.trim() || recipe?.when || "");
  const [shape, setShape] = useState<MethodShape>(methodShapeKind(recipe));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (!el.open) el.showModal();
    const onCancel = (event: Event) => {
      event.preventDefault();
      onClose();
    };
    el.addEventListener("cancel", onCancel);
    return () => {
      el.removeEventListener("cancel", onCancel);
      if (el.open) el.close();
    };
  }, []);

  async function save() {
    const label = name.trim();
    const text = when.trim();
    if (!label) {
      onError("先写名称");
      return;
    }
    if (taken(label)) {
      onError(`${label} 已在方法库里`);
      return;
    }
    if (!text) {
      onError("先写何时用");
      return;
    }
    setBusy(true);
    try {
      await api.patchLibrary(asset.id, { label, text, shape });
      onError(undefined);
      onMessage(`已保存 ${label}`);
      await onChanged();
      onClose();
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={dialog}
      className="modal"
      aria-labelledby={titleId}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="modal-card">
        <div className="voice-card-top">
          <h3 className="item-title" id={titleId}>
            {asset.label ?? recipe?.title ?? recipeIdOfMethod(asset)}
          </h3>
        </div>
        <label className="field">
          <span>名称</span>
          <input value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <label className="field">
          <span>何时用</span>
          <textarea value={when} onChange={(event) => setWhen(event.target.value)} />
        </label>
        <ShapePick name={`method-shape-${asset.id}`} value={shape} onChange={setShape} />
        <p className="item-meta">{shape === "kinds" ? "一种模型一场，不要合并。" : "先问题，再做法，再对照。"}</p>
        <div className="modal-actions">
          <button type="button" className="btn btn-danger" onClick={onRemove}>
            删除
          </button>
          <div className="create-actions">
            <button type="button" className="btn" onClick={onClose}>
              关闭
            </button>
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void save()}>
              {busy ? "正在保存…" : "保存"}
            </button>
          </div>
        </div>
      </div>
    </dialog>
  );
}
