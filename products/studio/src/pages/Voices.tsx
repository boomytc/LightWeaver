import { useEffect, useState } from "react";
import { api, libraryMedia } from "../api";
import { Link } from "../components/Link";
import type { Asset, ProjectSummary } from "../types";

export function Voices() {
  const [library, setLibrary] = useState<Asset[]>([]);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState<string>();
  const [id, setId] = useState("");
  const [locale, setLocale] = useState("zh");
  const [label, setLabel] = useState("");
  const [text, setText] = useState("");
  const [style, setStyle] = useState("");

  async function reload() {
    const [nextLibrary, nextProjects] = await Promise.all([api.library(), api.projects()]);
    setLibrary(nextLibrary);
    setProjects(nextProjects);
  }

  useEffect(() => {
    reload().catch((err: Error) => setError(err.message));
  }, []);

  const voices = library.filter((asset) => asset.kind === "voice");

  async function upload(file: File) {
    if (!id.trim()) {
      setError("先写音色 id，例如 voice.prompt-zh");
      return;
    }
    const form = new FormData();
    form.set("file", file);
    form.set("kind", "voice");
    form.set("id", id.trim());
    form.set("locale", locale);
    if (label.trim()) form.set("label", label.trim());
    if (text.trim()) form.set("text", text.trim());
    if (style.trim()) form.set("style", style.trim());
    try {
      await api.uploadLibrary(form);
      setMessage(`已入库 ${id.trim()}`);
      setError(undefined);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function saveMeta(asset: Asset, next: { label: string; text: string; style: string }) {
    try {
      await api.patchLibrary(asset.id, next);
      setMessage(`已更新 ${asset.label ?? asset.id}`);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="page-width page">
      <p className="eyebrow">人管</p>
      <h1 className="page-title">音色</h1>
      <p className="lede">人决定库里有哪些声、听起来对不对。片子页再点名用哪一支。agent 不自己换声。</p>
      {error ? <div className="banner banner-error">{error}</div> : null}
      {message ? <div className="banner banner-ok">{message}</div> : null}

      <div className="stack">
        {voices.map((asset) => (
          <VoiceCard
            key={asset.id}
            asset={asset}
            usedBy={projects.filter((project) => Object.values(project.voices ?? {}).includes(`library:${asset.id}`))}
            onSave={saveMeta}
          />
        ))}
      </div>

      <section className="section">
        <h2 className="h">入库一支新声</h2>
        <p className="item-meta">id 用 dotted 小写。参考稿和风格写清楚，agent 合成旁白时按这个克隆。</p>
        <div className="form-grid">
          <label className="field">
            <span>id</span>
            <input value={id} onChange={(event) => setId(event.target.value)} placeholder="voice.prompt-zh" />
          </label>
          <label className="field">
            <span>语种</span>
            <input value={locale} onChange={(event) => setLocale(event.target.value)} placeholder="zh" />
          </label>
          <label className="field">
            <span>名称</span>
            <input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="讲解女声（中）" />
          </label>
          <label className="field field-span">
            <span>参考稿</span>
            <input value={text} onChange={(event) => setText(event.target.value)} placeholder="克隆时跟读的句子" />
          </label>
          <label className="field field-span">
            <span>风格</span>
            <input value={style} onChange={(event) => setStyle(event.target.value)} placeholder="语速、气质" />
          </label>
          <label className="btn">
            选择 wav
            <input
              type="file"
              accept="audio/wav,audio/*"
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

function VoiceCard({
  asset,
  usedBy,
  onSave,
}: {
  asset: Asset;
  usedBy: ProjectSummary[];
  onSave: (asset: Asset, next: { label: string; text: string; style: string }) => Promise<void>;
}) {
  const [label, setLabel] = useState(asset.label ?? "");
  const [text, setText] = useState(asset.text ?? "");
  const [style, setStyle] = useState(asset.style ?? "");

  useEffect(() => {
    setLabel(asset.label ?? "");
    setText(asset.text ?? "");
    setStyle(asset.style ?? "");
  }, [asset.id, asset.label, asset.text, asset.style]);

  return (
    <article className="voice-card">
      <div className="voice-main">
        <div>
          <div className="item-title">{asset.label ?? asset.id}</div>
          <div className="card-id">
            {asset.id}
            {asset.locale ? ` · ${asset.locale}` : ""}
          </div>
        </div>
        {asset.file ? <audio controls preload="metadata" src={libraryMedia(asset.file)} /> : null}
      </div>
      <div className="form-grid">
        <label className="field">
          <span>名称</span>
          <input value={label} onChange={(event) => setLabel(event.target.value)} onBlur={() => void onSave(asset, { label, text, style })} />
        </label>
        <label className="field field-span">
          <span>参考稿</span>
          <input value={text} onChange={(event) => setText(event.target.value)} onBlur={() => void onSave(asset, { label, text, style })} />
        </label>
        <label className="field field-span">
          <span>风格</span>
          <input value={style} onChange={(event) => setStyle(event.target.value)} onBlur={() => void onSave(asset, { label, text, style })} />
        </label>
      </div>
      <div className="item-meta">
        {usedBy.length
          ? usedBy.map((project, index) => (
              <span key={project.id}>
                {index > 0 ? " · " : "用于 "}
                <Link href={`/f/${encodeURIComponent(project.id)}`} className="text-link">
                  {project.titles.zh ?? project.id}
                </Link>
              </span>
            ))
          : "还没有片子点名这支声"}
      </div>
    </article>
  );
}
