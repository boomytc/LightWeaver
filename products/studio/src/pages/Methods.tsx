import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { Toast } from "../components/Toast";
import { useFlash } from "../lib/flash";
import { Link } from "../components/Link";
import {
  methodExpandName,
  methodExpandOf,
  methodPlanLine,
  recipeIdOf,
  type MethodExpand,
} from "../lib/method-brief";
import type { Asset } from "../types";

type SceneDraft = { id: string; role: string };

const emptyScene = (): SceneDraft => ({ id: "", role: "" });

export function Methods() {
  const [methods, setMethods] = useState<Asset[]>([]);
  const [tasks, setTasks] = useState<{ id: string; label: { zh: string; en: string }; roles: string[] }[]>([]);
  const [taskId, setTaskId] = useState("");
  const [roles, setRoles] = useState<string[]>([]);
  const { flash, ok, error } = useFlash();
  const [label, setLabel] = useState("");
  const [when, setWhen] = useState("");
  const [expand, setExpand] = useState<MethodExpand>("fixed");
  const [scenes, setScenes] = useState<SceneDraft[]>([emptyScene()]);
  const [busy, setBusy] = useState(false);

  async function reload() {
    const [library, nextTasks] = await Promise.all([api.library(), api.tasks()]);
    setMethods(library.filter((item) => item.kind === "method"));
    setTasks(nextTasks);
    const task = nextTasks.find((item) => item.id === taskId) ?? nextTasks[0];
    setTaskId(task?.id ?? "");
    setRoles(task?.roles ?? []);
  }

  useEffect(() => {
    reload().catch((err: Error) => error(err.message));
  }, []);

  function taken(name: string, except?: string): boolean {
    return methods.some((item) => item.id !== except && (item.label ?? recipeIdOf(item.id)).trim() === name);
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
    const nextScenes = scenes.map((scene) => ({ id: scene.id.trim(), role: scene.role || undefined })).filter((scene) => scene.id);
    if (expand === "fixed" && nextScenes.length === 0) {
      error("固定场次至少写一场");
      return;
    }
    setBusy(true);
    try {
      await api.createMethod({
        label: name,
        text,
        expand,
        scenes: expand === "fixed" ? nextScenes : undefined,
        task: taskId || undefined,
      });
      ok(`已保存 ${name}`);
      setLabel("");
      setWhen("");
      setExpand("fixed");
      setScenes([emptyScene()]);
      await reload();
    } catch (err) {
      error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page-width page">
      <h1 className="sr">方法</h1>
      <p className="lede">
        可选铺场方案，和音色、素材同类。写名称、何时用，再决定是固定这几场，还是清单里一项一场。点去组合，说明只在那边复制。
      </p>
      <Toast flash={flash} />

      <div className="voice-board">
        <section className="surface create-panel">
          <h2 className="sr">新建</h2>
          <label className="field">
            <span>任务</span>
            <select
              value={taskId}
              onChange={(event) => {
                const id = event.target.value;
                setTaskId(id);
                setRoles(tasks.find((item) => item.id === id)?.roles ?? []);
              }}
            >
              {tasks.map((task) => (
                <option key={task.id} value={task.id}>
                  {task.label.zh}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>名称</span>
            <input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="例如 问题然后规则" />
          </label>
          <label className="field">
            <span>何时用</span>
            <textarea
              value={when}
              onChange={(event) => setWhen(event.target.value)}
              placeholder="一句话：什么片子该点这套铺场"
            />
          </label>
          <ExpandPick name="method-expand-new" value={expand} onChange={setExpand} />
          {expand === "fixed" ? <SceneEditor roles={roles} scenes={scenes} onChange={setScenes} /> : (
            <p className="item-meta">apply 时再给清单。一项一场，不要合并。</p>
          )}
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
                  roles={roles}
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

function ExpandPick({
  name,
  value,
  onChange,
}: {
  name: string;
  value: MethodExpand;
  onChange: (next: MethodExpand) => void;
}) {
  return (
    <ul className="origin-picks">
      <li>
        <label className={value === "fixed" ? "pick is-on" : "pick"}>
          <input type="radio" name={name} checked={value === "fixed"} onChange={() => onChange("fixed")} />
          <span>
            <strong>{methodExpandName("fixed")}</strong>
          </span>
        </label>
      </li>
      <li>
        <label className={value === "list" ? "pick is-on" : "pick"}>
          <input type="radio" name={name} checked={value === "list"} onChange={() => onChange("list")} />
          <span>
            <strong>{methodExpandName("list")}</strong>
          </span>
        </label>
      </li>
    </ul>
  );
}

function SceneEditor({
  roles,
  scenes,
  onChange,
}: {
  roles: string[];
  scenes: SceneDraft[];
  onChange: (next: SceneDraft[]) => void;
}) {
  function patch(index: number, next: Partial<SceneDraft>) {
    onChange(scenes.map((scene, i) => (i === index ? { ...scene, ...next } : scene)));
  }

  return (
    <div className="stack">
      {scenes.map((scene, index) => (
        <div key={index} className="create-row">
          <input
            aria-label={`场次 ${index + 1} id`}
            placeholder="id"
            value={scene.id}
            onChange={(event) => patch(index, { id: event.target.value })}
          />
          <select aria-label={`场次 ${index + 1} role`} value={scene.role} onChange={(event) => patch(index, { role: event.target.value })}>
            <option value="">role 可选</option>
            {roles.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn"
            disabled={scenes.length <= 1}
            onClick={() => onChange(scenes.filter((_, i) => i !== index))}
          >
            去掉
          </button>
        </div>
      ))}
      <button type="button" className="btn" onClick={() => onChange([...scenes, emptyScene()])}>
        加一场
      </button>
    </div>
  );
}

function MethodLibraryCard({
  asset,
  roles,
  taken,
  onChanged,
  onError,
  onMessage,
}: {
  asset: Asset;
  roles: string[];
  taken: (name: string) => boolean;
  onChanged: () => Promise<void>;
  onError: (message?: string) => void;
  onMessage: (message?: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const title = asset.label ?? recipeIdOf(asset.id);
  const when = asset.text?.trim() ?? "";

  async function remove() {
    if (!window.confirm(`删除后，点过这个方法的片子会缺铺场。确定删除「${title}」？`)) return;
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
          <div className="item-meta">铺场 · {methodPlanLine(asset)}</div>
        </div>
        <div className="voice-row-actions">
          <Link href={`/?recipe=${encodeURIComponent(recipeIdOf(asset.id))}`} className="btn btn-primary">
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
          roles={roles}
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
  roles,
  taken,
  onClose,
  onChanged,
  onError,
  onMessage,
  onRemove,
}: {
  asset: Asset;
  roles: string[];
  taken: (name: string) => boolean;
  onClose: () => void;
  onChanged: () => Promise<void>;
  onError: (message?: string) => void;
  onMessage: (message?: string) => void;
  onRemove: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = `method-detail-${asset.id}`;
  const [name, setName] = useState(asset.label ?? recipeIdOf(asset.id));
  const [when, setWhen] = useState(asset.text?.trim() ?? "");
  const [expand, setExpand] = useState<MethodExpand>(methodExpandOf(asset));
  const [scenes, setScenes] = useState<SceneDraft[]>(
    (asset.scenes ?? []).map((scene) => ({ id: scene.id, role: scene.role ?? "" })),
  );
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
    const nextScenes = scenes.map((scene) => ({ id: scene.id.trim(), role: scene.role || undefined })).filter((scene) => scene.id);
    if (expand === "fixed" && nextScenes.length === 0) {
      onError("固定场次至少写一场");
      return;
    }
    setBusy(true);
    try {
      await api.patchLibrary(asset.id, {
        label,
        text,
        expand,
        scenes: expand === "fixed" ? nextScenes : [],
      });
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
            {asset.label ?? recipeIdOf(asset.id)}
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
        <ExpandPick name={`method-expand-${asset.id}`} value={expand} onChange={setExpand} />
        {expand === "fixed" ? (
          <SceneEditor
            roles={roles}
            scenes={scenes.length ? scenes : [emptyScene()]}
            onChange={setScenes}
          />
        ) : (
          <p className="item-meta">apply 时再给清单。一项一场，不要合并。</p>
        )}
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
