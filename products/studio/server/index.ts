import fs from "node:fs";
import path from "node:path";
import cors from "cors";
import express from "express";
import multer from "multer";
import {
  guessExt,
  ingestUpload,
  isMaterialKind,
  isRenderable,
  keepLibraryVoice,
  libraryRoot,
  listProjects,
  filmTask,
  listTasks,
  loadLibrary,
  loadProject,
  asrRuntime,
  modelbestStatus,
  parseMethodExpand,
  parseMethodScenes,
  probeModelbest,
  projectPaths,
  projectSummary,
  removeLibraryAsset,
  resolveKeepSource,
  runAsr,
  runVoiceMint,
  safeJoin,
  tryGetTask,
  setModelbestApiKey,
  updateLibraryMaterial,
  updateLibraryMethod,
  updateLibraryVoice,
  validateProject,
  voiceCandidateRoot,
  wavFileSeconds,
  weaverRoot,
  createLibraryMethod,
  patchLibraryAsset,
} from "@lightweaver/weaver";

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

app.get("/api/settings/modelbest", (_req, res) => {
  res.json(modelbestStatus(root));
});

app.put("/api/settings/modelbest", (req, res) => {
  try {
    res.json(setModelbestApiKey(String(req.body?.apiKey ?? ""), root));
  } catch (error) {
    res.status(400).json({ error: messageOf(error) });
  }
});

app.get("/api/settings/asr", (_req, res) => {
  const runtime = asrRuntime(root);
  res.json({ ready: runtime.ready, hint: runtime.hint });
});

app.post("/api/settings/modelbest/probe", async (_req, res) => {
  try {
    res.json(await probeModelbest(root));
  } catch (error) {
    res.status(400).json({ error: messageOf(error) });
  }
});

app.get("/api/tasks", (_req, res) => {
  res.json(
    listTasks().map((task) => ({
      id: task.id,
      label: task.label,
      roles: task.roles ?? [],
      renderer: task.renderer,
      surface: task.surface,
    })),
  );
});

app.get("/api/projects", (_req, res) => {
  res.json(
    listProjects(root).map((project) => ({
      ...projectSummary(project),
      renderable: isRenderable(project, root),
    })),
  );
});

app.get("/api/projects/:id", (req, res) => {
  try {
    res.json(detailOf(loadProject(param(req.params.id), root)));
  } catch (error) {
    res.status(404).json({ error: messageOf(error) });
  }
});

app.post("/api/voices/mint", (req, res) => {
  req.setTimeout(200000);
  res.setTimeout(200000);
  try {
    const id = typeof req.body?.id === "string" ? req.body.id.trim() : "";
    const instruct = typeof req.body?.style === "string" ? req.body.style : "";
    if (!instruct.trim()) throw new Error("合成试听需要一段设计指令");
    const minted = runVoiceMint({
      text: String(req.body?.text ?? ""),
      style: instruct,
      destName: `${id || "mint"}-${Date.now()}.wav`,
      denoise: typeof req.body?.denoise === "boolean" ? req.body.denoise : undefined,
      doNormalize: typeof req.body?.doNormalize === "boolean" ? req.body.doNormalize : true,
      cfgValue:
        typeof req.body?.cfgValue === "number" && Number.isFinite(req.body.cfgValue) ? req.body.cfgValue : undefined,
      root,
    });
    res.json(minted);
  } catch (error) {
    res.status(400).json({ error: messageOf(error) });
  }
});

app.post("/api/voices/stage", upload.single("file"), (req, res) => {
  req.setTimeout(200000);
  res.setTimeout(200000);
  try {
    if (!req.file) throw new Error("缺少文件");
    const force = req.body?.force === "1" || req.body?.force === "true" || req.body?.force === true;
    const given = force ? "" : typeof req.body?.text === "string" ? req.body.text.trim() : "";
    const folder = voiceCandidateRoot(root);
    fs.mkdirSync(folder, { recursive: true });
    const ext = path.extname(req.file.originalname || "") || guessExt(req.file.mimetype) || ".wav";
    const rel = `upload-${Date.now()}-${process.pid}${ext}`.replace(/[^a-z0-9._-]+/gi, "-");
    const dest = path.join(folder, rel);
    fs.writeFileSync(dest, req.file.buffer);
    let text = given;
    let language = "";
    let asr = false;
    let error: string | undefined;
    if (!text) {
      try {
        const transcribed = runAsr({ audio: dest, root });
        text = transcribed.text;
        language = transcribed.language;
        asr = true;
      } catch (err) {
        error = messageOf(err);
      }
    }
    res.json({
      rel,
      dest,
      seconds: wavFileSeconds(dest),
      text,
      language,
      asr,
      error,
    });
  } catch (error) {
    res.status(400).json({ error: messageOf(error) });
  }
});

app.post("/api/voices/asr", (req, res) => {
  req.setTimeout(200000);
  res.setTimeout(200000);
  try {
    const source = req.body?.source as
      | { kind: "candidate"; rel: string }
      | { kind: "project"; projectId: string; rel: string }
      | undefined;
    if (!source || (source.kind !== "candidate" && source.kind !== "project")) {
      res.status(400).json({ error: "转写需要 candidate 或片子旁白路径" });
      return;
    }
    const abs = resolveKeepSource(source, root);
    res.json(runAsr({ audio: abs, root }));
  } catch (error) {
    res.status(400).json({ error: messageOf(error) });
  }
});

app.post("/api/voices/keep", (req, res) => {
  req.setTimeout(200000);
  res.setTimeout(200000);
  try {
    const source = req.body?.source as
      | { kind: "candidate"; rel: string }
      | { kind: "project"; projectId: string; rel: string }
      | undefined;
    if (!source || (source.kind !== "candidate" && source.kind !== "project")) {
      res.status(400).json({ error: "收下需要 candidate 或片子旁白路径" });
      return;
    }
    const origin = req.body?.origin === "instruct" ? "instruct" : "upload";
    const abs = resolveKeepSource(source, root);
    const givenId = typeof req.body?.id === "string" ? req.body.id.trim() : "";
    const asset = keepLibraryVoice(
      {
        id: givenId || undefined,
        origin,
        sourceAbs: abs,
        label: typeof req.body?.label === "string" ? req.body.label : undefined,
        said: typeof req.body?.said === "string" ? req.body.said : undefined,
        style: typeof req.body?.style === "string" ? req.body.style : undefined,
      },
      root,
    );
    res.json(asset);
  } catch (error) {
    res.status(400).json({ error: messageOf(error) });
  }
});

app.get("/api/media/candidate/:file", (req, res) => {
  try {
    const file = path.basename(param(req.params.file));
    const folder = voiceCandidateRoot(root);
    const dest = path.resolve(folder, file);
    if (!dest.startsWith(`${path.resolve(folder)}${path.sep}`)) {
      res.status(400).json({ error: "非法试听路径" });
      return;
    }
    if (!fs.existsSync(dest)) {
      res.status(404).end();
      return;
    }
    res.sendFile(dest);
  } catch (error) {
    res.status(400).json({ error: messageOf(error) });
  }
});

app.patch("/api/library/assets/:id", (req, res) => {
  try {
    const id = param(req.params.id);
    const current = loadLibrary(root).find((item) => item.id === id);
    if (current?.kind === "voice") {
      res.json(
        updateLibraryVoice(
          id,
          {
            label: typeof req.body?.label === "string" ? req.body.label : undefined,
            text: typeof req.body?.text === "string" ? req.body.text : undefined,
          },
          root,
        ),
      );
      return;
    }
    if (current?.kind === "method") {
      res.json(
        updateLibraryMethod(
          id,
          {
            label: typeof req.body?.label === "string" ? req.body.label : undefined,
            text: typeof req.body?.text === "string" ? req.body.text : undefined,
            expand: req.body?.expand !== undefined ? parseMethodExpand(req.body.expand) : undefined,
            scenes: req.body?.scenes !== undefined ? parseMethodScenes(req.body.scenes) : undefined,
          },
          root,
        ),
      );
      return;
    }
    if (current && isMaterialKind(current.kind)) {
      res.json(
        updateLibraryMaterial(
          id,
          { label: typeof req.body?.label === "string" ? req.body.label : undefined },
          root,
        ),
      );
      return;
    }
    const asset = patchLibraryAsset(id, {
      label: typeof req.body?.label === "string" ? req.body.label : undefined,
      text: typeof req.body?.text === "string" ? req.body.text : undefined,
      style: typeof req.body?.style === "string" ? req.body.style : undefined,
      locale: typeof req.body?.locale === "string" ? req.body.locale : undefined,
      texts: stringMap(req.body?.texts),
      styles: stringMap(req.body?.styles),
    });
    res.json(asset);
  } catch (error) {
    res.status(400).json({ error: messageOf(error) });
  }
});

app.delete("/api/library/assets/:id", (req, res) => {
  try {
    const removed = removeLibraryAsset(param(req.params.id), root);
    res.json({ ok: true, id: removed.id, label: removed.label ?? removed.id });
  } catch (error) {
    res.status(400).json({ error: messageOf(error) });
  }
});

app.get("/api/library", (_req, res) => {
  res.json(loadLibrary(root));
});

app.post("/api/library/methods", (req, res) => {
  try {
    const asset = createLibraryMethod(
      {
        label: String(req.body?.label ?? ""),
        text: String(req.body?.text ?? ""),
        expand: parseMethodExpand(req.body?.expand),
        scenes: req.body?.scenes,
        task: typeof req.body?.task === "string" ? req.body.task : undefined,
      },
      root,
    );
    res.status(201).json(asset);
  } catch (error) {
    res.status(400).json({ error: messageOf(error) });
  }
});

app.post("/api/library/assets", upload.single("file"), (req, res) => {
  try {
    if (!req.file) throw new Error("缺少文件");
    const asset = ingestUpload({
      scope: "library",
      kind: String(req.body?.kind ?? ""),
      id: String(req.body?.id ?? "").trim() || undefined,
      locale: typeof req.body?.locale === "string" && req.body.locale ? req.body.locale : undefined,
      label: typeof req.body?.label === "string" ? req.body.label : undefined,
      text: typeof req.body?.text === "string" ? req.body.text : undefined,
      style: typeof req.body?.style === "string" ? req.body.style : undefined,
      filename: req.file.originalname,
      mime: req.file.mimetype,
      buffer: req.file.buffer,
      root,
    });
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

function stringMap(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const next: Record<string, string> = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === "string") next[key] = item;
  }
  return next;
}

function readMatchReport(project: ReturnType<typeof loadProject>) {
  const file = path.join(project.root, "assets/match/report.json");
  if (!fs.existsSync(file)) return undefined;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
  } catch {
    return undefined;
  }
}

function detailOf(project: ReturnType<typeof loadProject>) {
  return {
    ...projectSummary(project),
    film: project.film,
    assets: project.assets,
    issues: validateProject(project, root),
    renderable: isRenderable(project, root),
    surface: tryGetTask(filmTask(project.film))?.surface,
    paths: projectPaths(project, root),
    match: readMatchReport(project),
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
