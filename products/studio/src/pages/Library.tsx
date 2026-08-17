import { useEffect, useState } from "react";
import { api, libraryMedia } from "../api";
import { Toast } from "../components/Toast";
import { useFlash } from "../lib/flash";
import { kindLabel } from "../lib/labels";
import type { Asset } from "../types";

export function Library() {
  const [library, setLibrary] = useState<Asset[]>([]);
  const { flash, ok, error } = useFlash();
  const [id, setId] = useState("");
  const [kind, setKind] = useState<"element" | "reference">("element");
  const [label, setLabel] = useState("");

  async function reload() {
    setLibrary(await api.library());
  }

  useEffect(() => {
    reload().catch((err: Error) => error(err.message));
  }, []);

  const materials = library.filter((asset) => asset.kind === "element" || asset.kind === "reference");

  async function upload(file: File) {
    if (!id.trim()) {
      error("先写素材 id，例如 element.mark");
      return;
    }
    const form = new FormData();
    form.set("file", file);
    form.set("kind", kind);
    form.set("id", id.trim());
    if (label.trim()) form.set("label", label.trim());
    try {
      await api.uploadLibrary(form);
      ok(`已入库 ${id.trim()}`);
      await reload();
    } catch (err) {
      error(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="page-width page">
      <p className="eyebrow">工作台</p>
      <h1 className="page-title">素材</h1>
      <p className="lede">
        收可供参考的元素和参考图。agent 可以按这些做，有自己想法也可以不用或另找。
      </p>
      <Toast flash={flash} />

      <div className="assets">
        {materials.map((asset) => {
          const href = asset.file ? libraryMedia(asset.file) : undefined;
          return (
            <article key={asset.id} className="card">
              <div className="thumb">
                {href ? <img src={href} alt={asset.label ?? asset.id} /> : kindLabel(asset.kind)}
              </div>
              <div className="card-body">
                <div>{asset.label ?? asset.id}</div>
                <div className="card-id">
                  {kindLabel(asset.kind)} · {asset.id}
                </div>
              </div>
            </article>
          );
        })}
      </div>

      <section className="section">
        <h2 className="h">收一件进库</h2>
        <div className="create-row">
          <select aria-label="类型" value={kind} onChange={(event) => setKind(event.target.value as "element" | "reference")}>
            <option value="element">元素</option>
            <option value="reference">参考图</option>
          </select>
          <input aria-label="素材 id" placeholder="element.mark" value={id} onChange={(event) => setId(event.target.value)} />
          <input aria-label="名称" placeholder="名称" value={label} onChange={(event) => setLabel(event.target.value)} />
          <label className="btn">
            选择文件
            <input
              type="file"
              accept="image/*,.svg"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void upload(file);
                event.target.value = "";
              }}
            />
          </label>
        </div>
      </section>
    </div>
  );
}
