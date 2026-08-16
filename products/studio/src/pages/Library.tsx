import { useEffect, useState } from "react";
import { api, libraryMedia } from "../api";
import { Link } from "../components/Link";
import { useFlash } from "../lib/flash";
import { kindLabel } from "../lib/labels";
import type { Asset, ProjectSummary } from "../types";

export function Library() {
  const [library, setLibrary] = useState<Asset[]>([]);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [error, setError] = useState<string>();
  const [message, setMessage] = useFlash();
  const [id, setId] = useState("");
  const [kind, setKind] = useState<"element" | "reference">("element");
  const [label, setLabel] = useState("");

  async function reload() {
    const [nextLibrary, nextProjects] = await Promise.all([api.library(), api.projects()]);
    setLibrary(nextLibrary);
    setProjects(nextProjects);
  }

  useEffect(() => {
    reload().catch((err: Error) => setError(err.message));
  }, []);

  const materials = library.filter((asset) => asset.kind === "element" || asset.kind === "reference");

  async function upload(file: File) {
    if (!id.trim()) {
      setError("先写素材 id，例如 element.mark");
      return;
    }
    const form = new FormData();
    form.set("file", file);
    form.set("kind", kind);
    form.set("id", id.trim());
    if (label.trim()) form.set("label", label.trim());
    try {
      await api.uploadLibrary(form);
      setMessage(`已入库 ${id.trim()}`);
      setError(undefined);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="page-width page">
      <p className="eyebrow">工作台</p>
      <h1 className="page-title">素材</h1>
      <p className="lede">
        只收会进片子的元素和参考图，不是通用文件库。片子页勾选之后，agent 按这份清单用，不自己加。
      </p>
      {error ? <div className="banner banner-error">{error}</div> : null}
      {message ? (
        <div className="banner banner-ok" role="status">
          {message}
        </div>
      ) : null}

      <div className="assets">
        {materials.map((asset) => {
          const href = asset.file ? libraryMedia(asset.file) : undefined;
          const usedBy = projects.filter((project) => (project.kit ?? []).includes(`library:${asset.id}`));
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
                <div className="item-meta" style={{ marginTop: 6 }}>
                  {usedBy.length
                    ? usedBy.map((project, index) => (
                        <span key={project.id}>
                          {index > 0 ? " · " : null}
                          <Link href={`/f/${encodeURIComponent(project.id)}`} className="text-link">
                            {project.titles.zh ?? project.id}
                          </Link>
                        </span>
                      ))
                    : "还没有片子点名"}
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
