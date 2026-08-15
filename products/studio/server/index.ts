import fs from "node:fs";
import path from "node:path";
import cors from "cors";
import express from "express";
import multer from "multer";
import {
  addAsset,
  addScene,
  createProject,
  isImplementedTask,
  isRenderable,
  libraryRoot,
  listProjects,
  listTasks,
  loadLibrary,
  loadProject,
  moveScene,
  patchScene,
  projectPaths,
  projectSummary,
  removeScene,
  runPublish,
  saveFilm,
  saveAssets,
  setCard,
  setVoice,
  validateProject,
  weaverRoot,
  type Asset,
  type FilmDoc,
} from "@lightweaver/weaver";
import { getJob, listJobs, startJob } from "./jobs.ts";
import { safeJoin } from "./safePath.ts";

const host = process.env.LIGHTWEAVER_API_HOST ?? "127.0.0.1";
const port = Number(process.env.LIGHTWEAVER_API_PORT ?? 8788);
const root = weaverRoot();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 40 * 1024 * 1024 } });

const app = express();
app.use(
  cors({
    origin: (origin, next) => {
      if (!origin) return next(null, true);
      try {
        const url = new URL(origin);
        if (url.hostname === "127.0.0.1" || url.hostname === "localhost") return next(null, true);
      } catch {
        /* ignore */
      }
      next(new Error("CORS"));
    },
  }),
);
app.use(express.json({ limit: "2mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/tasks", (_req, res) => {
  res.json(listTasks().map((task) => ({ id: task.id, label: task.label })));
});

app.get("/api/projects", (_req, res) => {
  res.json(listProjects(root).map(projectSummary));
});

app.post("/api/projects", (req, res) => {
  try {
    const id = String(req.body?.id ?? "").trim();
    const title = typeof req.body?.title === "string" ? req.body.title : undefined;
    const task = typeof req.body?.task === "string" ? req.body.task : undefined;
    const project = createProject(id, { title, task }, root);
    res.status(201).json(detailOf(project));
  } catch (error) {
    res.status(400).json({ error: messageOf(error) });
  }
});

app.get("/api/projects/:id", (req, res) => {
  try {
    res.json(detailOf(loadProject(param(req.params.id), root)));
  } catch (error) {
    res.status(404).json({ error: messageOf(error) });
  }
});

app.put("/api/projects/:id/film", (req, res) => {
  try {
    const project = loadProject(param(req.params.id), root);
    const film = req.body as FilmDoc;
    if (!film || film.id !== project.id) {
      res.status(400).json({ error: "film.id 必须与项目一致" });
      return;
    }
    if (film.task && !isImplementedTask(String(film.task))) {
      res.status(400).json({ error: `未知任务类型：${film.task}` });
      return;
    }
    saveFilm(project, film);
    res.json({ film: project.film, issues: validateProject(project, root), renderable: isRenderable(project, root) });
  } catch (error) {
    res.status(400).json({ error: messageOf(error) });
  }
});

app.post("/api/projects/:id/scenes", (req, res) => {
  try {
    const project = loadProject(param(req.params.id), root);
    addScene(project, {
      id: String(req.body?.id ?? ""),
      kind: String(req.body?.kind ?? "still"),
      still: typeof req.body?.still === "string" ? req.body.still : undefined,
      fit: req.body?.fit,
      role: req.body?.role,
      after: typeof req.body?.after === "string" ? req.body.after : undefined,
    });
    res.status(201).json(detailOf(project));
  } catch (error) {
    res.status(400).json({ error: messageOf(error) });
  }
});

app.delete("/api/projects/:id/scenes/:sceneId", (req, res) => {
  try {
    const project = loadProject(param(req.params.id), root);
    removeScene(project, param(req.params.sceneId));
    res.json(detailOf(project));
  } catch (error) {
    res.status(400).json({ error: messageOf(error) });
  }
});

app.post("/api/projects/:id/scenes/:sceneId/move", (req, res) => {
  try {
    const project = loadProject(param(req.params.id), root);
    moveScene(project, param(req.params.sceneId), {
      after: req.body?.after,
      before: req.body?.before,
      index: req.body?.index,
    });
    res.json(detailOf(project));
  } catch (error) {
    res.status(400).json({ error: messageOf(error) });
  }
});

app.patch("/api/projects/:id/scenes/:sceneId", (req, res) => {
  try {
    const project = loadProject(param(req.params.id), root);
    if (req.body?.lines !== undefined && (typeof req.body.lines !== "object" || Array.isArray(req.body.lines))) {
      res.status(400).json({ error: "lines 必须是对象" });
      return;
    }
    patchScene(project, param(req.params.sceneId), {
      lines: req.body?.lines,
      still: req.body?.still,
      fit: req.body?.fit,
      role: req.body?.role,
    });
    res.json(detailOf(project));
  } catch (error) {
    res.status(400).json({ error: messageOf(error) });
  }
});

app.patch("/api/projects/:id/cards", (req, res) => {
  try {
    const project = loadProject(param(req.params.id), root);
    const which = req.body?.which;
    if (which !== "title" && which !== "close") {
      res.status(400).json({ error: "which 必须是 title 或 close" });
      return;
    }
    setCard(project, String(req.body?.locale ?? ""), which, {
      headline: req.body?.headline,
      lede: req.body?.lede,
      kicker: req.body?.kicker,
      tags: req.body?.tags,
    });
    res.json(detailOf(project));
  } catch (error) {
    res.status(400).json({ error: messageOf(error) });
  }
});

app.patch("/api/projects/:id/voices", (req, res) => {
  try {
    const project = loadProject(param(req.params.id), root);
    setVoice(project, String(req.body?.locale ?? ""), String(req.body?.ref ?? ""));
    res.json(detailOf(project));
  } catch (error) {
    res.status(400).json({ error: messageOf(error) });
  }
});

app.post("/api/projects/:id/publish", (req, res) => {
  try {
    const project = loadProject(param(req.params.id), root);
    const locale = typeof req.body?.locale === "string" ? req.body.locale : undefined;
    res.json(runPublish({ projectId: project.id, locale, root }));
  } catch (error) {
    res.status(400).json({ error: messageOf(error) });
  }
});

app.get("/api/library", (_req, res) => {
  res.json(loadLibrary(root));
});

app.post("/api/library/assets", upload.single("file"), (req, res) => {
  try {
    const asset = ingestUpload({ scope: "library" }, req);
    res.status(201).json(asset);
  } catch (error) {
    res.status(400).json({ error: messageOf(error) });
  }
});

app.post("/api/projects/:id/assets", upload.single("file"), (req, res) => {
  try {
    const project = loadProject(param(req.params.id), root);
    const asset = ingestUpload({ scope: "project", projectId: project.id }, req);
    res.status(201).json(asset);
  } catch (error) {
    res.status(400).json({ error: messageOf(error) });
  }
});

app.get("/api/media/library/*path", (req, res) => {
  try {
    const rel = req.params.path;
    const file = safeJoin(libraryRoot(root), Array.isArray(rel) ? rel.join("/") : String(rel ?? ""));
    if (!fs.existsSync(file)) {
      res.status(404).end();
      return;
    }
    res.sendFile(file);
  } catch (error) {
    res.status(400).json({ error: messageOf(error) });
  }
});

app.get("/api/media/project/:id/*path", (req, res) => {
  try {
    const project = loadProject(param(req.params.id), root);
    const rel = req.params.path;
    const file = safeJoin(project.root, Array.isArray(rel) ? rel.join("/") : String(rel ?? ""));
    if (!fs.existsSync(file)) {
      res.status(404).end();
      return;
    }
    res.sendFile(file);
  } catch (error) {
    res.status(400).json({ error: messageOf(error) });
  }
});

app.post("/api/projects/:id/validate", (req, res) => {
  try {
    const project = loadProject(param(req.params.id), root);
    res.json({ issues: validateProject(project, root) });
  } catch (error) {
    res.status(404).json({ error: messageOf(error) });
  }
});

app.post("/api/jobs", (req, res) => {
  const type = req.body?.type;
  const projectId = String(req.body?.projectId ?? "");
  const locale = typeof req.body?.locale === "string" ? req.body.locale : undefined;
  if (type !== "tts" && type !== "render") {
    res.status(400).json({ error: "type 必须是 tts 或 render" });
    return;
  }
  if (!projectId) {
    res.status(400).json({ error: "缺少 projectId" });
    return;
  }
  if (type === "render") {
    try {
      const project = loadProject(projectId, root);
      if (!isRenderable(project, root)) {
        res.status(400).json({ error: `静帧文件不存在：${projectId}；先按手截配方补 png` });
        return;
      }
    } catch (error) {
      res.status(400).json({ error: messageOf(error) });
      return;
    }
  }
  res.status(202).json(startJob(type, projectId, locale));
});

app.get("/api/jobs", (_req, res) => {
  res.json(listJobs());
});

app.get("/api/jobs/:id", (req, res) => {
  const job = getJob(param(req.params.id));
  if (!job) {
    res.status(404).json({ error: "找不到任务" });
    return;
  }
  res.json(job);
});

function ingestUpload(
  target: { scope: "library" } | { scope: "project"; projectId: string },
  req: express.Request,
): Asset {
  const kind = String(req.body?.kind ?? "");
  const id = String(req.body?.id ?? "").trim();
  const locale = typeof req.body?.locale === "string" && req.body.locale ? req.body.locale : undefined;
  const label = typeof req.body?.label === "string" ? req.body.label : undefined;
  const text = typeof req.body?.text === "string" ? req.body.text : undefined;
  const style = typeof req.body?.style === "string" ? req.body.style : undefined;
  if (!req.file) throw new Error("缺少文件");
  if (!id) throw new Error("缺少资产 id");

  const ext = path.extname(req.file.originalname || "") || guessExt(req.file.mimetype);
  const folder = folderFor(kind, locale);
  const filename = `${id.replace(/[^a-z0-9.-]+/gi, "-")}${ext}`;
  const rel = path.posix.join(folder, filename);

  if (target.scope === "library") {
    const dest = safeJoin(libraryRoot(root), rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, req.file.buffer);
    return addAsset({ kind: "library" }, { id, kind, locale, file: rel, text, style, label }, root);
  }
  const project = loadProject(target.projectId, root);
  const dest = safeJoin(project.root, rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, req.file.buffer);
  if (kind === "still" && locale) {
    const existing = project.assets.find((asset) => asset.id === id);
    const files = { ...(existing?.files ?? {}), [locale]: rel };
    const next: Asset = { id, kind: "still", files, label: label ?? existing?.label };
    const assets = [...project.assets.filter((asset) => asset.id !== id), next];
    saveAssets(project, assets);
    return next;
  }
  return addAsset({ kind: "project", project }, { id, kind, locale, file: rel, text, style, label }, root);
}

function folderFor(kind: string, locale?: string): string {
  if (kind === "voice") return locale ? `voices/${locale}` : "voices";
  if (kind === "still") return locale ? `assets/stills/${locale}` : "assets/stills";
  if (kind === "reference") return "assets/references";
  if (kind === "element") return "elements";
  if (kind === "line") return locale ? `assets/lines/${locale}` : "assets/lines";
  if (kind === "output") return "assets/outputs";
  return "assets/misc";
}

function guessExt(mime: string): string {
  if (mime.includes("png")) return ".png";
  if (mime.includes("jpeg")) return ".jpg";
  if (mime.includes("wav")) return ".wav";
  if (mime.includes("svg")) return ".svg";
  if (mime.includes("mp4")) return ".mp4";
  return "";
}

function detailOf(project: ReturnType<typeof loadProject>) {
  return {
    ...projectSummary(project),
    film: project.film,
    assets: project.assets,
    issues: validateProject(project, root),
    renderable: isRenderable(project, root),
    paths: projectPaths(project, root),
  };
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function param(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

app.listen(port, host, () => {
  console.log(`LightWeaver API http://${host}:${port}`);
});
