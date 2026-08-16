import { useEffect, useState } from "react";
import { api, libraryMedia } from "../api";
import { Link } from "../components/Link";
import { listVoicePacks, voiceFile } from "../lib/voices";
import type { Asset, ProjectSummary } from "../types";

export function Voices() {
  const [library, setLibrary] = useState<Asset[]>([]);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState<string>();
  const [id, setId] = useState("voice.prompt");
  const [label, setLabel] = useState("");
  const [locale, setLocale] = useState("zh");
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

  const packs = listVoicePacks(library);

  async function upload(file: File) {
    if (!id.trim()) {
      setError("先写音色套 id，例如 voice.prompt");
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
      setMessage(`已写入 ${id.trim()} · ${locale}`);
      setError(undefined);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="page-width page">
      <p className="eyebrow">工作台</p>
      <h1 className="page-title">音色</h1>
      <p className="lede">一套音色。中英可以各有一支参考声，出片时勾选要出的语言，不必两种都出。</p>
      {error ? <div className="banner banner-error">{error}</div> : null}
      {message ? <div className="banner banner-ok">{message}</div> : null}

      <div className="stack">
        {packs.map((asset) => (
          <VoicePackCard
            key={asset.id}
            asset={asset}
            usedBy={projects.filter((project) => Object.values(project.voices ?? {}).includes(`library:${asset.id}`))}
            onSaved={reload}
            onError={setError}
          />
        ))}
      </div>

      <section className="section">
        <h2 className="h">补一套或补一边</h2>
        <p className="item-meta">同一 id 上传 zh / en 两个 wav，会收成一套。</p>
        <div className="form-grid">
          <label className="field">
            <span>套 id</span>
            <input value={id} onChange={(event) => setId(event.target.value)} placeholder="voice.prompt" />
          </label>
          <label className="field">
            <span>这一边</span>
            <select value={locale} onChange={(event) => setLocale(event.target.value)} aria-label="语种">
              <option value="zh">中文</option>
              <option value="en">英文</option>
            </select>
          </label>
          <label className="field field-span">
            <span>名称</span>
            <input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="讲解女声" />
          </label>
          <label className="field field-span">
            <span>这一边的参考稿</span>
            <input value={text} onChange={(event) => setText(event.target.value)} />
          </label>
          <label className="field field-span">
            <span>这一边的风格</span>
            <input value={style} onChange={(event) => setStyle(event.target.value)} />
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

function VoicePackCard({
  asset,
  usedBy,
  onSaved,
  onError,
}: {
  asset: Asset;
  usedBy: ProjectSummary[];
  onSaved: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const [label, setLabel] = useState(asset.label ?? "");
  const [textZh, setTextZh] = useState(asset.texts?.zh ?? asset.text ?? "");
  const [textEn, setTextEn] = useState(asset.texts?.en ?? "");
  const [styleZh, setStyleZh] = useState(asset.styles?.zh ?? asset.style ?? "");
  const [styleEn, setStyleEn] = useState(asset.styles?.en ?? "");

  useEffect(() => {
    setLabel(asset.label ?? "");
    setTextZh(asset.texts?.zh ?? asset.text ?? "");
    setTextEn(asset.texts?.en ?? "");
    setStyleZh(asset.styles?.zh ?? asset.style ?? "");
    setStyleEn(asset.styles?.en ?? "");
  }, [asset]);

  async function save() {
    try {
      await api.patchLibrary(asset.id, {
        label,
        texts: { zh: textZh, en: textEn },
        styles: { zh: styleZh, en: styleEn },
      });
      await onSaved();
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    }
  }

  const zhFile = voiceFile(asset, "zh");
  const enFile = voiceFile(asset, "en");

  return (
    <article className="voice-card">
      <div className="voice-main">
        <div>
          <div className="item-title">{asset.label ?? asset.id}</div>
          <div className="card-id">{asset.id} · 一套音色</div>
        </div>
      </div>
      <div className="form-grid">
        <label className="field field-span">
          <span>名称</span>
          <input value={label} onChange={(event) => setLabel(event.target.value)} onBlur={() => void save()} />
        </label>
        <label className="field">
          <span>中文参考稿</span>
          <input value={textZh} onChange={(event) => setTextZh(event.target.value)} onBlur={() => void save()} />
          {zhFile ? <audio controls preload="metadata" src={libraryMedia(zhFile)} /> : <span className="item-meta">缺中文 wav</span>}
        </label>
        <label className="field">
          <span>英文参考稿</span>
          <input value={textEn} onChange={(event) => setTextEn(event.target.value)} onBlur={() => void save()} />
          {enFile ? <audio controls preload="metadata" src={libraryMedia(enFile)} /> : <span className="item-meta">缺英文 wav</span>}
        </label>
        <label className="field">
          <span>中文风格</span>
          <input value={styleZh} onChange={(event) => setStyleZh(event.target.value)} onBlur={() => void save()} />
        </label>
        <label className="field">
          <span>英文风格</span>
          <input value={styleEn} onChange={(event) => setStyleEn(event.target.value)} onBlur={() => void save()} />
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
          : "还没有片子点名这套声"}
      </div>
    </article>
  );
}
