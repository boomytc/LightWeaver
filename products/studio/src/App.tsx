import { useCallback, useEffect, useMemo, useState } from "react";
import { api, libraryMedia, projectMedia } from "./api";
import { IconFilm, IconImage, IconMark, IconWave } from "./icons";
import type { Asset, Job, ProjectDetail, ProjectSummary } from "./types";

type Pane = "scenes" | "assets";

export function App() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [projectId, setProjectId] = useState<string>();
  const [detail, setDetail] = useState<ProjectDetail | null>(null);
  const [library, setLibrary] = useState<Asset[]>([]);
  const [locale, setLocale] = useState("zh");
  const [pane, setPane] = useState<Pane>("scenes");
  const [sceneId, setSceneId] = useState<string>();
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();
  const [job, setJob] = useState<Job | null>(null);
  const [busy, setBusy] = useState(false);
  const [newId, setNewId] = useState("");
  const [newTitle, setNewTitle] = useState("");

  const loadList = useCallback(async () => {
    const next = await api.projects();
    setProjects(next);
    setProjectId((current) => current ?? next[0]?.id);
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    const next = await api.project(id);
    setDetail(next);
    setLocale((current) => (next.film.locales[current] ? current : Object.keys(next.film.locales)[0] ?? "zh"));
    setSceneId((current) => next.film.scenes.find((scene) => scene.id === current)?.id ?? next.film.scenes[0]?.id);
  }, []);

  useEffect(() => {
    loadList().catch((err: Error) => setError(err.message));
    api.library().then(setLibrary).catch((err: Error) => setError(err.message));
  }, [loadList]);

  useEffect(() => {
    if (!projectId) return;
    loadDetail(projectId).catch((err: Error) => setError(err.message));
  }, [projectId, loadDetail]);

  useEffect(() => {
    if (!job || job.status !== "running") return;
    const timer = window.setInterval(() => {
      api.job(job.id).then(setJob).catch((err: Error) => setError(err.message));
    }, 1200);
    return () => window.clearInterval(timer);
  }, [job]);

  const scene = detail?.film.scenes.find((item) => item.id === sceneId);
  const stillAsset = useMemo(() => {
    if (!detail || !scene?.still) return undefined;
    const id = scene.still.replace(/^asset:/, "");
    return detail.assets.find((asset) => asset.id === id);
  }, [detail, scene]);

  const stillSrc = stillAsset?.files?.[locale] ?? stillAsset?.file;

  async function saveLine(text: string) {
    if (!detail || !scene) return;
    const film = {
      ...detail.film,
      scenes: detail.film.scenes.map((item) =>
        item.id === scene.id ? { ...item, lines: { ...item.lines, [locale]: text } } : item,
      ),
    };
    const saved = await api.saveFilm(detail.id, film);
    setDetail({ ...detail, film: saved.film, issues: saved.issues });
  }

  async function run(type: Job["type"]) {
    if (!detail) return;
    setBusy(true);
    setError(undefined);
    try {
      const started = await api.startJob(type, detail.id, locale);
      setJob(started);
      setMessage(type === "tts" ? "正在合成旁白…" : "正在渲染…");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function validate() {
    if (!detail) return;
    const result = await api.validate(detail.id);
    setDetail({ ...detail, issues: result.issues });
    setMessage(`校验完成：${result.issues.filter((i) => i.level === "error").length} 个错误`);
  }

  async function create() {
    try {
      const created = await api.createProject(newId.trim(), newTitle.trim() || newId.trim());
      setNewId("");
      setNewTitle("");
      await loadList();
      setProjectId(created.id);
      setMessage(`已创建 ${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function onUpload(scope: "library" | "project", file: File, kind: string, id: string) {
    const form = new FormData();
    form.set("file", file);
    form.set("kind", kind);
    form.set("id", id);
    form.set("locale", locale);
    if (scope === "library") {
      const asset = await api.uploadLibrary(form);
      setLibrary(await api.library());
      setMessage(`已入库 ${asset.id}`);
      return;
    }
    if (!detail) return;
    await api.uploadProject(detail.id, form);
    await loadDetail(detail.id);
    setMessage("项目资产已更新");
  }

  return (
    <div className="app">
      <a className="skip" href="#main">
        跳到主内容
      </a>
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">
            <IconMark />
          </span>
          LightWeaver
        </div>
        <div className="spacer" />
        {detail ? (
          <label className="field" style={{ margin: 0, minWidth: 88 }}>
            <span className="sr">语种</span>
            <select aria-label="语种" value={locale} onChange={(event) => setLocale(event.target.value)}>
              {Object.keys(detail.film.locales).map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <div className="actions">
          <button type="button" className="btn" onClick={() => void validate()} disabled={!detail}>
            校验
          </button>
          <button type="button" className="btn" onClick={() => void run("tts")} disabled={!detail || busy}>
            合成旁白
          </button>
          <button type="button" className="btn btn-primary" onClick={() => void run("render")} disabled={!detail || busy}>
            渲染
          </button>
        </div>
      </header>

      <div className="workspace">
        <aside className="pane sidebar">
          <h2 className="h">项目</h2>
          <div className="list">
            {projects.map((project) => (
              <button
                key={project.id}
                type="button"
                className={project.id === projectId ? "item is-active" : "item"}
                onClick={() => setProjectId(project.id)}
              >
                <span className="item-title">{project.titles[locale] ?? project.id}</span>
                <span className="item-meta">
                  {project.source === "first-party" ? "内置" : "本地"} · {project.scenes} 场
                </span>
              </button>
            ))}
          </div>
          <div className="create">
            <h2 className="h">新建项目</h2>
            <input aria-label="项目 id" placeholder="kebab-id" value={newId} onChange={(e) => setNewId(e.target.value)} />
            <input aria-label="标题" placeholder="标题（可选）" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
            <button type="button" className="btn" onClick={() => void create()} disabled={!newId.trim()}>
              创建到 data/projects
            </button>
          </div>
        </aside>

        <main className="pane main" id="main">
          {error ? (
            <div className="banner banner-error" role="alert">
              {error}
            </div>
          ) : null}
          {message ? <div className="banner banner-ok">{message}</div> : null}

          <div className="toolbar">
            <div className="tabs" role="tablist" aria-label="主视图">
              <button type="button" className={pane === "scenes" ? "tab is-active" : "tab"} onClick={() => setPane("scenes")}>
                场景
              </button>
              <button type="button" className={pane === "assets" ? "tab is-active" : "tab"} onClick={() => setPane("assets")}>
                资产
              </button>
            </div>
            {detail ? (
              <span className="item-meta">
                {detail.brand} · {detail.id}
              </span>
            ) : null}
          </div>

          {!detail ? (
            <p className="item-meta">还没有项目。先创建一个，或确认 first-party 片子已迁入。</p>
          ) : pane === "scenes" ? (
            <Scenes
              detail={detail}
              locale={locale}
              sceneId={sceneId}
              onSelect={setSceneId}
              onLine={(text) => void saveLine(text)}
            />
          ) : (
            <Assets
              library={library}
              detail={detail}
              locale={locale}
              onUpload={onUpload}
            />
          )}

          {detail?.issues.length ? (
            <section>
              <h2 className="h">校验</h2>
              {detail.issues.map((issue) => (
                <p key={`${issue.level}:${issue.path}`} className={`issue issue-${issue.level}`}>
                  {issue.level === "error" ? "错误" : "提示"} · {issue.path} · {issue.message}
                </p>
              ))}
            </section>
          ) : null}

          {job ? (
            <pre className="status" aria-live="polite">
              {job.type} {job.status}
              {job.error ? `\n${job.error}` : ""}
              {job.log ? `\n${job.log.slice(-2000)}` : ""}
            </pre>
          ) : null}
        </main>

        <aside className="pane preview">
          <h2 className="h">预览</h2>
          <div className="preview-frame">
            {detail && stillSrc ? (
              <img src={projectMedia(detail.id, stillSrc)} alt={scene?.id ?? "静帧"} />
            ) : (
              <span>{scene?.kind === "still" ? "没有静帧" : "片头 / 片尾无静帧"}</span>
            )}
          </div>
          {scene ? (
            <p className="item-meta" style={{ marginTop: 12 }}>
              {scene.id} · {scene.kind}
              {scene.still ? ` · ${scene.still}` : ""}
            </p>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

function Scenes({
  detail,
  locale,
  sceneId,
  onSelect,
  onLine,
}: {
  detail: ProjectDetail;
  locale: string;
  sceneId?: string;
  onSelect: (id: string) => void;
  onLine: (text: string) => void;
}) {
  const selected = detail.film.scenes.find((scene) => scene.id === sceneId);
  return (
    <>
      {detail.film.scenes.map((scene) => (
        <button
          key={scene.id}
          type="button"
          className={scene.id === sceneId ? "item is-active" : "item"}
          onClick={() => onSelect(scene.id)}
        >
          <span className="scene-row" style={{ width: "100%", border: 0, padding: 0 }}>
            <span className="kind">{scene.kind}</span>
            <span>
              <span className="item-title">{scene.id}</span>
              <span className="item-meta"> {(scene.lines[locale] ?? "").slice(0, 48)}</span>
            </span>
          </span>
        </button>
      ))}
      {selected ? (
        <div className="field" style={{ marginTop: 16 }}>
          <label htmlFor="line">旁白 · {selected.id} · {locale}</label>
          <textarea
            id="line"
            defaultValue={selected.lines[locale] ?? ""}
            key={`${selected.id}-${locale}-${selected.lines[locale] ?? ""}`}
            onBlur={(event) => {
              if (event.target.value !== (selected.lines[locale] ?? "")) onLine(event.target.value);
            }}
          />
        </div>
      ) : null}
    </>
  );
}

function Assets({
  library,
  detail,
  locale,
  onUpload,
}: {
  library: Asset[];
  detail: ProjectDetail;
  locale: string;
  onUpload: (scope: "library" | "project", file: File, kind: string, id: string) => Promise<void>;
}) {
  const [kind, setKind] = useState("still");
  const [id, setId] = useState("");
  const [scope, setScope] = useState<"library" | "project">("project");

  return (
    <>
      <h2 className="h">库 · 音色 / 元素 / 参考</h2>
      <AssetGrid assets={library} hrefFor={(asset) => (asset.file ? libraryMedia(asset.file) : undefined)} />
      <h2 className="h" style={{ marginTop: 20 }}>
        本项目
      </h2>
      <AssetGrid
        assets={detail.assets}
        hrefFor={(asset) => {
          const file = asset.files?.[locale] ?? asset.file;
          return file ? projectMedia(detail.id, file) : undefined;
        }}
      />
      <div className="toolbar" style={{ marginTop: 16 }}>
        <select aria-label="入库范围" value={scope} onChange={(e) => setScope(e.target.value as "library" | "project")}>
          <option value="project">项目</option>
          <option value="library">共享库</option>
        </select>
        <select aria-label="资产类型" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="still">静帧</option>
          <option value="voice">音色</option>
          <option value="reference">参考图</option>
          <option value="element">元素</option>
        </select>
        <input aria-label="资产 id" placeholder="still.hero" value={id} onChange={(e) => setId(e.target.value)} />
        <label className="btn">
          选择文件
          <input
            type="file"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file || !id.trim()) return;
              void onUpload(scope, file, kind, id.trim());
              event.target.value = "";
            }}
          />
        </label>
      </div>
    </>
  );
}

function AssetGrid({ assets, hrefFor }: { assets: Asset[]; hrefFor: (asset: Asset) => string | undefined }) {
  return (
    <div className="assets">
      {assets.map((asset) => {
        const href = hrefFor(asset);
        const visual = asset.kind === "still" || asset.kind === "reference" || asset.kind === "element";
        return (
          <article key={asset.id} className="card">
            <div className="thumb">
              {visual && href ? (
                <img src={href} alt={asset.label ?? asset.id} />
              ) : asset.kind === "voice" || asset.kind === "line" ? (
                <IconWave />
              ) : asset.kind === "output" ? (
                <IconFilm />
              ) : (
                <IconImage />
              )}
            </div>
            <div className="card-body">
              <div>{asset.label ?? asset.id}</div>
              <div className="card-id">
                {asset.kind}
                {asset.locale ? ` · ${asset.locale}` : ""}
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
