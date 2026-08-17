import { useEffect, useRef, useState } from "react";
import { api, libraryMedia } from "../api";
import { Toast } from "../components/Toast";
import { useFlash } from "../lib/flash";
import { IconUpload } from "../icons";
import { kindLabel } from "../lib/labels";
import type { Asset } from "../types";

type MaterialKind = "element" | "reference";

export function Library() {
  const [library, setLibrary] = useState<Asset[]>([]);
  const { flash, ok, error } = useFlash();
  const [label, setLabel] = useState("");
  const [kind, setKind] = useState<MaterialKind>("element");
  const [file, setFile] = useState<File>();
  const [preview, setPreview] = useState<string>();
  const [busy, setBusy] = useState(false);

  const materials = library.filter((asset) => asset.kind === "element" || asset.kind === "reference");

  async function reload() {
    setLibrary(await api.library());
  }

  useEffect(() => {
    reload().catch((err: Error) => error(err.message));
  }, []);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  function taken(name: string, except?: string): boolean {
    return materials.some((item) => item.id !== except && (item.label ?? item.id).trim() === name);
  }

  function takeFile(next?: File) {
    if (!next) return;
    if (!isImageFile(next)) {
      error("请选一张图");
      return;
    }
    if (preview) URL.revokeObjectURL(preview);
    setFile(next);
    setPreview(URL.createObjectURL(next));
  }

  async function create() {
    const name = label.trim();
    if (!name) {
      error("先写名称");
      return;
    }
    if (taken(name)) {
      error(`${name} 已在素材库里`);
      return;
    }
    if (!file) {
      error("先选一张图");
      return;
    }
    const form = new FormData();
    form.set("file", file);
    form.set("kind", kind);
    form.set("label", name);
    setBusy(true);
    try {
      await api.uploadLibrary(form);
      ok(`已保存 ${name}`);
      setLabel("");
      setFile(undefined);
      if (preview) URL.revokeObjectURL(preview);
      setPreview(undefined);
      await reload();
    } catch (err) {
      error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page-width page">
      <h1 className="sr">素材</h1>
      <p className="lede">
        可选画面增强，和音色、方法同类。这里管库：加、改、删。点上才给 agent 作参考，不点就不强制。选用在组合页。
      </p>
      <Toast flash={flash} />

      <div className="voice-board">
        <section className="surface create-panel">
          <h2 className="sr">新建</h2>
          <label className="field">
            <span>名称</span>
            <input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="例如 Light mark" />
          </label>
          <KindPick name="material-kind-new" value={kind} onChange={setKind} />
          <MaterialDrop src={preview} busy={busy} onFile={takeFile} onClear={() => {
            setFile(undefined);
            if (preview) URL.revokeObjectURL(preview);
            setPreview(undefined);
          }} />
          <div className="create-save">
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void create()}>
              {busy ? "正在保存…" : "保存素材"}
            </button>
          </div>
        </section>

        <section className="voice-shelf" aria-label="素材库">
          <h2 className="sr">素材库</h2>
          {materials.length ? (
            <div className="stack">
              {materials.map((asset) => (
                <MaterialLibraryCard
                  key={asset.id}
                  asset={asset}
                  taken={(name) => taken(name, asset.id)}
                  onChanged={reload}
                  onError={error}
                  onMessage={ok}
                />
              ))}
            </div>
          ) : (
            <p className="item-meta">还没有素材。在新建里收一件。</p>
          )}
        </section>
      </div>
    </div>
  );
}

function KindPick({
  name,
  value,
  onChange,
}: {
  name: string;
  value: MaterialKind;
  onChange: (next: MaterialKind) => void;
}) {
  return (
    <ul className="origin-picks">
      <li>
        <label className={value === "element" ? "pick is-on" : "pick"}>
          <input type="radio" name={name} checked={value === "element"} onChange={() => onChange("element")} />
          <span>
            <strong>元素</strong>
          </span>
        </label>
      </li>
      <li>
        <label className={value === "reference" ? "pick is-on" : "pick"}>
          <input type="radio" name={name} checked={value === "reference"} onChange={() => onChange("reference")} />
          <span>
            <strong>参考图</strong>
          </span>
        </label>
      </li>
    </ul>
  );
}

function isImageFile(file: File): boolean {
  if (file.type.startsWith("image/")) return true;
  return /\.(png|jpe?g|gif|webp|svg)$/i.test(file.name);
}

function MaterialDrop({
  src,
  busy,
  onFile,
  onClear,
}: {
  src?: string;
  busy: boolean;
  onFile: (file: File) => void;
  onClear: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  return (
    <div
      className={["voice-drop", over ? "is-over" : "", src ? "has-image" : "", busy ? "is-busy" : ""]
        .filter(Boolean)
        .join(" ")}
      role="button"
      tabIndex={busy ? -1 : 0}
      aria-label="点击或拖入图片"
      onClick={() => {
        if (!busy) input.current?.click();
      }}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        if (!busy) input.current?.click();
      }}
      onDragOver={(event) => {
        event.preventDefault();
        if (!busy) setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setOver(false);
        const next = event.dataTransfer.files?.[0];
        if (next) onFile(next);
      }}
    >
      <input
        ref={input}
        type="file"
        accept="image/*,.svg"
        hidden
        disabled={busy}
        onClick={(event) => event.stopPropagation()}
        onChange={(event) => {
          const next = event.target.files?.[0];
          if (next) onFile(next);
          event.target.value = "";
        }}
      />
      {src ? (
        <div className="material-preview">
          <img src={src} alt="" />
          <button
            type="button"
            className="btn"
            onClick={(event) => {
              event.stopPropagation();
              onClear();
            }}
          >
            去掉
          </button>
        </div>
      ) : (
        <>
          <IconUpload />
          <span className="voice-drop-prompt">{busy ? "正在保存…" : "点击或拖入图片"}</span>
        </>
      )}
    </div>
  );
}

function MaterialLibraryCard({
  asset,
  taken,
  onChanged,
  onError,
  onMessage,
}: {
  asset: Asset;
  taken: (name: string) => boolean;
  onChanged: () => Promise<void>;
  onError: (message?: string) => void;
  onMessage: (message?: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const name = asset.label ?? asset.id;
  const href = asset.file ? libraryMedia(asset.file) : undefined;

  async function remove() {
    if (!window.confirm(`删除后，点过这件素材的片子会缺参考。确定删除「${name}」？`)) return;
    try {
      await api.removeLibrary(asset.id);
      onError(undefined);
      onMessage(`已删除 ${name}`);
      setOpen(false);
      await onChanged();
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <>
      <article className="voice-row">
        {href ? <img className="material-thumb" src={href} alt="" /> : null}
        <div>
          <div className="item-title">{name}</div>
          <div className="item-meta">{kindLabel(asset.kind)}</div>
        </div>
        <div className="voice-row-actions">
          <button type="button" className="btn" onClick={() => setOpen(true)}>
            详情
          </button>
          <button type="button" className="btn btn-danger" onClick={() => void remove()}>
            删除
          </button>
        </div>
      </article>
      {open ? (
        <MaterialDetail
          asset={asset}
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

function MaterialDetail({
  asset,
  taken,
  onClose,
  onChanged,
  onError,
  onMessage,
  onRemove,
}: {
  asset: Asset;
  taken: (name: string) => boolean;
  onClose: () => void;
  onChanged: () => Promise<void>;
  onError: (message?: string) => void;
  onMessage: (message?: string) => void;
  onRemove: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = `material-detail-${asset.id}`;
  const [name, setName] = useState(asset.label ?? asset.id);
  const [file, setFile] = useState<File>();
  const [preview, setPreview] = useState<string | undefined>(asset.file ? libraryMedia(asset.file) : undefined);
  const [localPreview, setLocalPreview] = useState(false);
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
      if (localPreview && preview) URL.revokeObjectURL(preview);
    };
  }, []);

  function takeFile(next: File) {
    if (!isImageFile(next)) {
      onError("请选一张图");
      return;
    }
    if (localPreview && preview) URL.revokeObjectURL(preview);
    setFile(next);
    setPreview(URL.createObjectURL(next));
    setLocalPreview(true);
  }

  async function save() {
    const label = name.trim();
    if (!label) {
      onError("先写名称");
      return;
    }
    if (taken(label)) {
      onError(`${label} 已在素材库里`);
      return;
    }
    setBusy(true);
    try {
      if (file) {
        const form = new FormData();
        form.set("file", file);
        form.set("kind", asset.kind);
        form.set("id", asset.id);
        form.set("label", label);
        await api.uploadLibrary(form);
      } else {
        await api.patchLibrary(asset.id, { label });
      }
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
            {asset.label ?? asset.id}
          </h3>
          <span className="item-meta">{kindLabel(asset.kind)}</span>
        </div>
        <MaterialDrop src={preview} busy={busy} onFile={takeFile} onClear={() => {
          if (localPreview && preview) URL.revokeObjectURL(preview);
          setFile(undefined);
          setPreview(asset.file ? libraryMedia(asset.file) : undefined);
          setLocalPreview(false);
        }} />
        <label className="field">
          <span>名称</span>
          <input value={name} onChange={(event) => setName(event.target.value)} />
        </label>
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
