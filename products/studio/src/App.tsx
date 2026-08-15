import { useCallback, useEffect, useMemo, useState } from "react";
import { api, libraryMedia, projectMedia } from "./api";
import { IconFilm, IconImage, IconMark, IconWave } from "./icons";
import { missingStillSceneIds, outputPreview, stillPreviewSrc, StudyExplainerPane } from "./tasks/study-explainer";
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
      api
        .job(job.id)
        .then((next) => {
          setJob(next);
          if (next.status === "ok" && detail) void loadDetail(detail.id);
        })
        .catch((err: Error) => setError(err.message));
    }, 1200);
    return () => window.clearInterval(timer);
  }, [job, detail, loadDetail]);

  const scene = detail?.film.scenes.find((item) => item.id === sceneId);
  const output = useMemo(() => (detail ? outputPreview(detail, locale) : undefined), [detail, locale]);
  const preview = useMemo(() => (detail ? stillPreviewSrc(detail, scene, locale) : undefined), [detail, scene, locale]);
  const missingStills = useMemo(
    () => (detail ? missingStillSceneIds(detail, locale) : []),
    [detail, locale],
  );
  const voices = library.filter((asset) => asset.kind === "voice");
  const task = detail?.film.task ?? "study-explainer";
  const canPublish = Boolean(detail?.film.publish?.dir);
  const canRender = Boolean(detail?.renderable);

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
    const next = await api.project(detail.id);
    setDetail(next);
    setMessage(`校验完成：${next.issues.filter((i) => i.level === "error").length} 个错误`);
  }

  async function publish() {
    if (!detail) return;
    await api.publish(detail.id, locale);
    setMessage("已发布到 LightUI references");
  }

  async function create() {
    try {
      const created = await api.createProject(newId.trim(), newTitle.trim() || newId.trim());
      setNewId("");
      setNewTitle("");
      await loadList();
      setProjectId(created.id);
      setDetail(created);
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
      await api.uploadLibrary(form);
      setLibrary(await api.library());
      setMessage(`已入库 ${id}`);
      return;
    }
    if (!detail) return;
    await api.uploadProject(detail.id, form);
    const next = await api.project(detail.id);
    if (kind === "still" && sceneId) {
      onChange(await api.patchScene(detail.id, sceneId, { still: `asset:${id}` }));
    } else {
      onChange(next);
    }
    setMessage("项目资产已更新");
  }

  function onChange(next: ProjectDetail) {
    setDetail(next);
    setSceneId((current) => next.film.scenes.find((scene) => scene.id === current)?.id ?? next.film.scenes[0]?.id);
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
          <span className="item-meta" style={{ marginLeft: 12, fontWeight: 400 }}>
            片子由 agent 经 weaver 写；这里复核、改词、补静帧。
          </span>
        </div>
        <div className="spacer" />
        {detail ? (
          <>
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
            <label className="field" style={{ margin: 0, minWidth: 160 }}>
              <span className="sr">音色</span>
              <select
                aria-label="音色"
                value={detail.film.voices[locale] ?? ""}
                onChange={(event) => void api.setVoice(detail.id, locale, event.target.value).then(onChange)}
              >
                {voices.map((asset) => (
                  <option key={asset.id} value={`library:${asset.id}`}>
                    {asset.label ?? asset.id}
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : null}
        <div className="actions">
          <button type="button" className="btn" onClick={() => void validate()} disabled={!detail}>
            校验
          </button>
          <button type="button" className="btn" onClick={() => void run("tts")} disabled={!detail || busy}>
            合成旁白
          </button>
          <button type="button" className="btn btn-primary" onClick={() => void run("render")} disabled={!detail || busy || !canRender}>
            渲染
          </button>
          {canPublish ? (
            <button type="button" className="btn" onClick={() => void publish()} disabled={!detail || !canRender}>
              发布
            </button>
          ) : null}
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
                  {project.source === "first-party" ? "内置" : "本地"} · {project.task ?? "study-explainer"} · {project.scenes} 场
                </span>
              </button>
            ))}
          </div>
          <div className="create">
            <h2 className="h">新建（本机收尾）</h2>
            <p className="item-meta">片子由 agent 经 weaver 写；这里复核、改词、补静帧。</p>
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
                {detail.brand} · {detail.id} · {task}
              </span>
            ) : null}
          </div>

          {!detail ? (
            <p className="item-meta">还没有项目。</p>
          ) : pane === "assets" ? (
            <Assets library={library} detail={detail} locale={locale} onUpload={onUpload} />
          ) : task === "study-explainer" ? (
            <StudyExplainerPane detail={detail} locale={locale} sceneId={sceneId} onSelect={setSceneId} onChange={onChange} />
          ) : (
            <p>此任务尚未实现编辑器（{task}）</p>
          )}

          {detail ? (
            <p className="item-meta">
              {detail.renderable ? "可渲" : "不可渲"}
              {missingStills.length ? ` · 缺 png：${missingStills.join(", ")}` : ""}
            </p>
          ) : null}

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
            {output ? (
              <video controls playsInline preload="metadata" src={output.src} />
            ) : preview ? (
              <img src={preview} alt={scene?.id ?? "静帧"} />
            ) : (
              <span>{scene?.kind === "still" ? "没有静帧" : "片头 / 片尾无静帧"}</span>
            )}
          </div>
          {output ? (
            <label className="field" style={{ marginTop: 12 }}>
              <span>成片路径</span>
              <input readOnly value={output.path} onFocus={(event) => event.currentTarget.select()} />
            </label>
          ) : null}
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
