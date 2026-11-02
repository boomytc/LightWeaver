import express from "express";
import multer from "multer";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  Application,
  cliInvocation,
  errorProtocol,
  httpStatus,
  WeaverError,
} from "@lightweaver/weaver/app";
import {
  installRuntime,
  type RuntimeContext,
} from "@lightweaver/weaver/app";
import {
  z,
  MediaProvenance,
  MediaRef,
  SourceRange,
} from "@lightweaver/weaver/contracts";
import { ClientStateStore } from "./client-state.ts";

export type ServiceMode = "development" | "production";

export type StudioServiceOptions = {
  mode: ServiceMode;
  token: string;
  runtime: RuntimeContext;
  port?: number;
  staticDir?: string;
  devOrigins?: string[];
};

export type StudioService = {
  port: number;
  origin: string;
  token: string;
  close: () => Promise<void>;
};

const loopback = new Set(["127.0.0.1", "localhost", "::1"]);

function deny(res: express.Response, code: string, message: string, status = 403) {
  res.status(status).json({
    ok: false,
    error: { code, message, retryable: false, hints: [] },
  });
}

export async function startStudioService(
  options: StudioServiceOptions,
): Promise<StudioService> {
  if (process.versions.electron)
    throw new Error("业务服务不能在 Electron 进程内启动");
  if (options.mode === "production" && options.token.length < 16)
    throw new Error("生产服务拒绝匿名访问");
  const runtime = installRuntime({
    ...options.runtime,
    mode: options.mode,
    tools: {
      ...options.runtime.tools,
      node: process.execPath,
    },
  });
  const sessionDir = path.join(runtime.tempDir, `session-${randomUUID()}`);
  fs.mkdirSync(sessionDir, { recursive: true });
  const app = new Application({ runtime });
  const server = express();
  const upload = multer({
    dest: sessionDir,
    limits: { fileSize: 10 * 1024 ** 3, files: 1 },
  });
  const clientState = new ClientStateStore(
    path.join(runtime.dataDir, "client-state.json"),
  );
  let port = 0;
  let origin = "";

  server.use((req, res, next) => {
    const host = req.hostname;
    const hostHeader = req.get("host") || "";
    const requestOrigin = typeof req.headers.origin === "string" ? req.headers.origin : "";
    if (!loopback.has(host) || !hostHeader.endsWith(`:${port}`)) {
      deny(res, "LOCAL_ONLY", "仅允许本机回环地址");
      return;
    }
    if (options.mode === "production") {
      if (requestOrigin && requestOrigin !== origin) {
        deny(res, "LOCAL_ONLY", "生产服务拒绝外部来源");
        return;
      }
      if (req.headers.authorization !== `Bearer ${options.token}`) {
        deny(res, "UNAUTHORIZED", "生产服务需要本应用会话", 401);
        return;
      }
    } else {
      const allowed = new Set([origin, ...(options.devOrigins || [])]);
      if (requestOrigin && !allowed.has(requestOrigin)) {
        deny(res, "LOCAL_ONLY", "开发服务拒绝未登记的来源");
        return;
      }
      const header = req.headers.authorization;
      if (header && header !== `Bearer ${options.token}`) {
        deny(res, "UNAUTHORIZED", "开发服务拒绝错误的会话", 401);
        return;
      }
      if (!header && options.token && requestOrigin && !allowed.has(requestOrigin)) {
        deny(res, "UNAUTHORIZED", "开发服务拒绝未登记的来源", 401);
        return;
      }
    }
    next();
  });
  if (options.mode === "production") {
    server.use((_req, res, next) => {
      res.setHeader(
        "Content-Security-Policy",
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
      );
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Referrer-Policy", "no-referrer");
      next();
    });
  }
  server.use(express.json({ limit: "16mb" }));
  const route = (
    method: "get" | "post" | "put" | "delete",
    routePath: string,
    handler: (req: express.Request) => unknown | Promise<unknown>,
  ) =>
    server[method](routePath, async (req, res, next) => {
      try {
        res.json({ ok: true, result: await handler(req) });
      } catch (error) {
        next(error);
      }
    });
  const Write = z.object({ expectedRevision: z.string(), requestId: z.string() });
  const existingLocalPath = (file: string, kind: "file" | "bundle") => {
    if (!path.isAbsolute(file) || file.includes("\0"))
      throw new WeaverError("INVALID_INPUT", "需要绝对文件路径");
    try {
      const real = fs.realpathSync(file), stat = fs.statSync(real);
      if (!stat.isFile() && !(kind === "bundle" && stat.isDirectory()))
        throw new WeaverError("INVALID_INPUT", kind === "bundle" ? "需要项目包 ZIP 或目录" : "需要普通文件");
      return real;
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT")
        throw new WeaverError("NOT_FOUND", `文件或目录不存在：${file}`, undefined, ["重新选择文件或项目包，检查位置是否已被移动、改名、删除或断开连接。"]);
      throw error;
    }
  };

  route("get", "/api/runtime", () => ({
    platform: process.platform,
    mode: options.mode,
    dataDir: runtime.dataDir,
    configFile: runtime.configFile,
    configBase: runtime.configBase,
    modelDir: runtime.modelDir,
    logDir: runtime.logDir,
    resourcesDir: runtime.resourcesDir,
    requirements: ["requirements.txt", "requirements.models.txt", "requirements.models.mlx.txt", "requirements.speech.txt"]
      .map((name) => ({ name, file: path.join(runtime.resourcesDir, "weaver", name) }))
      .filter((item) => fs.existsSync(item.file)),
    interchangePython: runtime.tools.python,
    cli: cliInvocation(runtime),
    tools: {
      node: fs.existsSync(runtime.tools.node),
      ffmpeg: runtime.tools.ffmpeg ? fs.existsSync(runtime.tools.ffmpeg) : false,
      ffprobe: runtime.tools.ffprobe ? fs.existsSync(runtime.tools.ffprobe) : false,
      cardRenderer: fs.existsSync(runtime.tools.cardRenderer),
      cardBrowser: runtime.tools.cardBrowser
        ? fs.existsSync(runtime.tools.cardBrowser)
        : false,
      cardSite: runtime.tools.cardSite ? fs.existsSync(runtime.tools.cardSite) : false,
      python: runtime.tools.python ? fs.existsSync(runtime.tools.python) : false,
    },
  }));
  server.get("/api/runtime/requirements/:name", (req, res, next) => {
    try {
      const name = z.enum(["requirements.txt", "requirements.models.txt", "requirements.models.mlx.txt", "requirements.speech.txt"]).parse(req.params.name);
      res.download(path.join(runtime.resourcesDir, "weaver", name), name, (error) => {
        if (error && !res.headersSent) next(error);
      });
    } catch (error) { next(error); }
  });
  route("get", "/api/client/state", () => clientState.read());
  route("put", "/api/client/state", (req) => clientState.write(req.body));
  route("get", "/api/capabilities", () => app.capabilities());
  route("get", "/api/doctor", () => app.providers.doctor());
  route("get", "/api/models", (req) =>
    app.models.view(z.string().min(1).optional().parse(req.query.root)),
  );
  route("get", "/api/models/settings", () => app.models.settings());
  route("put", "/api/models/settings", (req) => {
    const { requestId, ...payload } = z.object({ requestId: z.string().min(1) }).passthrough().parse(req.body);
    return app.models.save({ payload, requestId });
  });
  route("post", "/api/models/providers/:id/adopt", (req) =>
    app.models.adoptProvider({
      id: z.string().parse(req.params.id),
      ...z.object({ expectedRevision: z.string(), requestId: z.string() }).parse(req.body),
    }),
  );
  route("post", "/api/models/:id/download", (req) =>
    app.models.download({
      id: z.string().parse(req.params.id),
      ...z.object({ root: z.string(), requestId: z.string() }).parse(req.body),
    }),
  );
  route("post", "/api/models/:id/verify", (req) =>
    app.models.verify(
      z.string().parse(req.params.id),
      z.object({ root: z.string() }).parse(req.body).root,
    ),
  );
  route("post", "/api/models/:id/verify-active", (req) =>
    app.models.verifyActive(z.string().parse(req.params.id)),
  );
  route("post", "/api/models/:id/adopt", (req) =>
    app.models.adopt({
      id: z.string().parse(req.params.id),
      directory: z.object({ path: z.string() }).parse(req.body).path,
      ...z.object({ expectedRevision: z.string(), requestId: z.string() }).parse(req.body),
    }),
  );
  route("get", "/api/projects", () => app.projects.list());
  route("post", "/api/projects/import-bundle", async (req) => {
    const input = z.object({ file: z.string().min(1), requestId: z.string(), projectId: z.string().optional() }).strict().parse(req.body);
    return app.interchange.importBundle(existingLocalPath(input.file, "bundle"), input.requestId, input.projectId);
  });
  server.post("/api/projects/import-bundle/upload", upload.single("file"), async (req, res, next) => {
    try {
      if (!req.file) throw new Error("先选择项目包");
      const input = z.object({ requestId: z.string(), projectId: z.string().optional() }).parse(req.body);
      res.json({ ok: true, result: await app.interchange.importBundle(req.file.path, input.requestId, input.projectId) });
    } catch (error) { next(error); }
    finally { if (req.file) await fsp.rm(req.file.path, { force: true }); }
  });
  route("post", "/api/projects", (req) =>
    app.projects.create(
      z
        .object({
          id: z.string().optional(),
          title: z.string(),
          workflow: z.string(),
          template: z.literal("starter").optional(),
          requestId: z.string(),
        })
        .parse(req.body),
    ),
  );
  route("get", "/api/projects/:id", (req) =>
    app.projects.read(
      z.string().parse(req.params.id),
      z.string().optional().parse(req.query.revision),
    ),
  );
  route("get", "/api/projects/:id/context", (req) =>
    app.projectContext(z.string().parse(req.params.id)),
  );
  route("post", "/api/projects/:id/impact", (req) =>
    app.previewEdit(
      z.string().parse(req.params.id),
      z.object({ document: z.unknown() }).parse(req.body).document,
    ),
  );
  route("get", "/api/projects/:id/brief", (req) =>
    app.agentBrief(z.string().parse(req.params.id)),
  );
  route("post", "/api/projects/:id/ops", (req) =>
    app.projects.apply({
      projectId: z.string().parse(req.params.id),
      ...Write.extend({ ops: z.unknown() }).parse(req.body),
    }),
  );
  route("put", "/api/projects/:id", (req) =>
    app.projects.update({
      projectId: z.string().parse(req.params.id),
      ...Write.extend({ document: z.unknown() }).parse(req.body),
    }),
  );
  const importAsset = async (
    projectId: string,
    file: string,
    name: string | undefined,
    body: {
      expectedRevision: string;
      requestId: string;
      provenance?: z.infer<typeof MediaProvenance>;
    },
  ) =>
    app.addAsset({
      projectId,
      ...body,
      file,
      name,
    });
  server.post(
    "/api/projects/:id/assets",
    upload.single("file"),
    async (req, res, next) => {
      try {
        if (!req.file) throw Error("先选择素材");
        const body = Write.extend({ provenance: z.string().optional() }).parse(req.body);
        let provenance: z.infer<typeof MediaProvenance> | undefined;
        if (body.provenance !== undefined) {
          let value: unknown;
          try { value = JSON.parse(body.provenance); }
          catch { throw new WeaverError("INVALID_INPUT", "素材来源必须是有效 JSON"); }
          provenance = MediaProvenance.parse(value);
        }
        res.json({
          ok: true,
          result: await importAsset(
            z.string().parse(req.params.id),
            req.file.path,
            req.file.originalname,
            { ...body, provenance },
          ),
        });
      } catch (error) {
        next(error);
      } finally {
        if (req.file) await fsp.rm(req.file.path, { force: true });
      }
    },
  );
  route("post", "/api/projects/:id/assets/path", async (req) => {
    const body = Write.extend({
      file: z.string(),
      name: z.string().optional(),
      provenance: MediaProvenance.optional(),
    }).parse(req.body);
    const file = existingLocalPath(body.file, "file");
    return importAsset(
      z.string().parse(req.params.id),
      file,
      body.name || path.basename(file),
      body,
    );
  });
  route("post", "/api/projects/:id/adopt", (req) =>
    app.adoptMaterial({
      projectId: z.string().parse(req.params.id),
      ...Write.extend({ itemId: z.string(), version: z.string() }).parse(req.body),
    }),
  );
  route("post", "/api/voice/transcribe", (req) =>
    app.transcribeVoice(
      z
        .object({
          voiceId: z.string(),
          voiceVersion: z.string(),
          requestId: z.string(),
        })
        .parse(req.body),
    ),
  );
  server.post(
    "/api/voice/transcribe-upload",
    upload.single("file"),
    async (req, res, next) => {
      try {
        if (!req.file) throw Error("选择参考音频");
        const { requestId } = z.object({ requestId: z.string() }).parse(req.body);
        res.json({
          ok: true,
          result: await app.analysis.standalone({
            kind: "asr",
            file: req.file.path,
            requestId,
          }),
        });
      } catch (error) {
        next(error);
      } finally {
        if (req.file) await fsp.rm(req.file.path, { force: true });
      }
    },
  );
  route("get", "/api/library", () => app.library.list());
  route("get", "/api/library/:id", (req) =>
    app.library.read(
      z.string().parse(req.params.id),
      z.string().optional().parse(req.query.version),
    ),
  );
  route("post", "/api/library", (req) =>
    app.library.publish(
      z
        .object({
          itemId: z.string().optional(),
          expectedVersion: z.string().nullable(),
          requestId: z.string(),
          payload: z.unknown(),
        })
        .parse(req.body),
    ),
  );
  server.post(
    "/api/library/upload",
    upload.single("file"),
    async (req, res, next) => {
      try {
        if (!req.file) throw Error("先选择文件");
        const body = z
          .object({
            itemId: z.string().optional(),
            expectedVersion: z.string().optional(),
            requestId: z.string(),
            kind: z.enum(["voice", "material"]),
            name: z.string(),
            referenceText: z.string().optional(),
            provider: z.string().optional(),
            style: z.string().optional(),
          })
          .parse(req.body);
        res.json({
          ok: true,
          result: await app.importLibrary({
            itemId: body.itemId,
            expectedVersion: body.expectedVersion || null,
            requestId: body.requestId,
            file: req.file.path,
            fileName: req.file.originalname,
            payload: {
              kind: body.kind,
              name: body.name,
              referenceText: body.referenceText,
              provider: body.provider,
              style: body.style,
            },
          }),
        });
      } catch (error) {
        next(error);
      } finally {
        if (req.file) await fsp.rm(req.file.path, { force: true });
      }
    },
  );
  route("delete", "/api/library/:id", (req) =>
    app.library.remove({
      itemId: z.string().parse(req.params.id),
      ...z
        .object({ expectedVersion: z.string(), requestId: z.string() })
        .parse(req.body),
    }),
  );
  route("post", "/api/projects/:id/build", (req) =>
    app.builds.submit({
      projectId: z.string().parse(req.params.id),
      ...z
        .object({
          locales: z.array(z.string()).optional(),
          profiles: z.array(z.string()).optional(),
          regenerate: z.boolean().optional(),
          expectedRevision: z.string().min(1),
          requestId: z.string(),
        })
        .parse(req.body),
    }),
  );
  route("post", "/api/projects/:id/plan", async (req) => {
    const { nodes, snapshot, ...plan } = await app.builds.plan({
      projectId: z.string().parse(req.params.id),
      ...z
        .object({
          locales: z.array(z.string()).optional(),
          profiles: z.array(z.string()).optional(),
          requestId: z.string(),
        })
        .parse(req.body),
    });
    return { ...plan, revision: snapshot.projectRevision.id };
  });
  route("post", "/api/projects/:id/analyze", (req) =>
    app.analysis.submit({
      projectId: z.string().parse(req.params.id),
      ...z
        .object({
          kinds: z.array(z.string()),
          requestId: z.string(),
          sourceId: z.string().optional(),
          vlmProvider: z.string().optional(),
          locale: z.string().optional(),
          align: z.boolean().optional(),
          fromUs: z.number().int().nonnegative().optional(),
          durationUs: z.number().int().positive().optional(),
        })
        .parse(req.body),
    }),
  );
  route("post", "/api/projects/:id/search", (req) => {
    const input = z
      .object({
        query: z.string(),
        requestId: z.string(),
        mode: z.enum(["text", "semantic", "visual"]),
        rerank: z.boolean().optional(),
        sourceIds: z.array(z.string()).optional(),
        fromUs: z.number().int().nonnegative().optional(),
        toUs: z.number().int().positive().optional(),
      })
      .refine((value) => !value.rerank || value.mode === "semantic", "候选重排只适用于语义检索")
      .parse(req.body);
    const { mode, rerank, ...request } = input;
    const projectId = z.string().parse(req.params.id);
    if (mode === "visual") return app.visual.submit({ projectId, ...request });
    return mode === "semantic"
      ? app.analysis.submitSemantic({ projectId, ...request, rerank })
      : app.analysis.search({ projectId, ...request });
  });
  route("post", "/api/projects/:id/match", (req) =>
    app.analysis.submitMatch({
      projectId: z.string().parse(req.params.id),
      ...z
        .object({
          editedId: z.string(),
          sourceIds: z.array(z.string()).optional(),
          requestId: z.string(),
        })
        .parse(req.body),
    }),
  );
  route("post", "/api/projects/:id/proposal", (req) =>
    app.analysis.apply({
      projectId: z.string().parse(req.params.id),
      ...z
        .object({
          proposalId: z.string(),
          selection: z.array(z.string()),
          expectedRevision: z.string(),
          requestId: z.string(),
          allowReuse: z.boolean().optional(),
          ranges: z.record(z.string(), SourceRange).optional(),
        })
        .parse(req.body),
    }),
  );
  route("post", "/api/projects/:id/captions/from-analysis", (req) =>
    app.analysis.adoptCaptions({
      projectId: z.string().parse(req.params.id),
      ...Write.extend({
        locale: z.string(),
        sourceId: z.string().optional(),
        runId: z.string().optional(),
      }).parse(req.body),
    }),
  );
  route("put", "/api/projects/:id/creative-plan", (req) =>
    app.authoring.save({
      projectId: z.string().parse(req.params.id),
      ...Write.extend({ plan: z.unknown() }).parse(req.body),
    }),
  );
  route("post", "/api/projects/:id/creative-plan/apply", (req) =>
    app.authoring.apply({
      projectId: z.string().parse(req.params.id),
      ...Write.extend({ append: z.boolean().optional() }).parse(req.body),
    }),
  );
  route("post", "/api/projects/:id/captions/assist", (req) =>
    app.captions.submit({
      projectId: z.string().parse(req.params.id),
      ...Write.extend({ locale: z.string(), targetLocale: z.string() }).parse(req.body),
    }),
  );
  route("post", "/api/projects/:id/captions/assist/apply", (req) =>
    app.captions.apply({
      projectId: z.string().parse(req.params.id),
      ...Write.extend({ runId: z.string() }).parse(req.body),
    }),
  );
  route("post", "/api/projects/:id/speakers", (req) =>
    app.speakers.submit({
      projectId: z.string().parse(req.params.id),
      ...z
        .object({
          sourceId: z.string(),
          locale: z.string(),
          requestId: z.string(),
          fromUs: z.number().optional(),
          durationUs: z.number().optional(),
        })
        .parse(req.body),
    }),
  );
  route("post", "/api/projects/:id/speakers/apply", (req) =>
    app.speakers.apply({
      projectId: z.string().parse(req.params.id),
      ...Write.extend({ runId: z.string() }).parse(req.body),
    }),
  );
  route("post", "/api/voice/design", (req) =>
    app.analysis.standalone({
      kind: "voice-design",
      ...z
        .object({
          text: z.string(),
          style: z.string(),
          provider: z.string().optional(),
          requestId: z.string(),
        })
        .parse(req.body),
    }),
  );
  route("post", "/api/voice/accept", (req) =>
    app.acceptVoice(
      z
        .object({
          runId: z.string(),
          name: z.string(),
          requestId: z.string(),
          itemId: z.string().optional(),
          expectedVersion: z.string().nullable(),
        })
        .parse(req.body),
    ),
  );
  route("post", "/api/captions/parse", (req) => {
    const input = z
      .object({
        body: z.string(),
        locale: z.string(),
        source: MediaRef.optional(),
        fps: z.object({
          num: z.number().int().positive(),
          den: z.number().int().positive(),
        }),
      })
      .parse(req.body);
    return app.parseCaptions(input.body, input.locale, input.fps, input.source);
  });
  route("get", "/api/artifacts/:digest", (req) =>
    app.readArtifactJson(z.string().parse(req.params.digest)),
  );
  route("get", "/api/projects/:id/deliveries", (req) =>
    app.builds.deliveries(z.string().parse(req.params.id)),
  );
  route("post", "/api/projects/:id/export", async (req) => {
    const input = z
      .object({
        kind: z.enum(["file", "otio", "jianying", "bundle"]),
        destination: z.string().min(1),
        deliveryId: z.string().optional(),
        requestId: z.string(),
      })
      .parse(req.body);
    if (!path.isAbsolute(input.destination) || input.destination.includes("\0"))
      throw new Error("导出目标必须是绝对路径");
    const projectId = z.string().parse(req.params.id);
    return app.exports.run({
      projectId,
      format: input.kind === "file" ? "video" : input.kind,
      destination: input.destination,
      deliveryId: input.deliveryId,
      requestId: input.requestId,
    });
  });
  route("post", "/api/export/verify", (req) =>
    app.interchange.verify(z.object({ directory: z.string() }).parse(req.body).directory),
  );
  route("post", "/api/export/install", (req) =>
    app.interchange.installJianying(
      z.object({ directory: z.string() }).parse(req.body).directory,
    ),
  );
  route("get", "/api/runs", (req) =>
    app.jobs.list(z.string().optional().parse(req.query.project)),
  );
  route("get", "/api/runs/:id", (req) => ({
    run: app.jobs.read(z.string().parse(req.params.id)),
    nodes: app.jobs.nodes(z.string().parse(req.params.id)),
  }));
  route("post", "/api/runs/:id/cancel", (req) =>
    app.jobs.cancel(z.string().parse(req.params.id)),
  );
  route("post", "/api/runs/:id/resume", (req) =>
    app.jobs.resume(z.string().parse(req.params.id)),
  );
  server.get("/api/runs/:id/events", (req, res, next) => {
    try {
      const id = z.string().parse(req.params.id);
      app.jobs.read(id);
      let after = z.coerce
        .number()
        .int()
        .nonnegative()
        .parse(req.headers["last-event-id"] || req.query.after || 0);
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders();
      res.write("retry: 1000\n\n");
      const send = () => {
        for (const event of app.jobs.events(id, after)) {
          res.write(`id: ${event.seq}\nevent: weaver\ndata: ${JSON.stringify(event)}\n\n`);
          after = event.seq;
        }
      };
      send();
      const timer = setInterval(send, 500);
      const heartbeat = setInterval(() => res.write(": keepalive\n\n"), 15000);
      req.on("close", () => {
        clearInterval(timer);
        clearInterval(heartbeat);
      });
    } catch (error) {
      next(error);
    }
  });
  server.get("/api/media/:digest", (req, res, next) => {
    try {
      const media = app.mediaFile(z.string().parse(req.params.digest));
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
      res.type(media.mime);
      res.sendFile(media.file, { dotfiles: "allow", acceptRanges: true }, (error) => {
        if (error && !res.headersSent) next(error);
      });
    } catch (error) {
      next(error);
    }
  });
  if (options.staticDir) {
    const root = options.staticDir;
    server.use(express.static(root, { index: "index.html", fallthrough: true }));
    server.get(/^\/(?!api\/).*/, (_req, res, next) => {
      res.sendFile(path.join(root, "index.html"), (error) => {
        if (error) next(error);
      });
    });
  }
  server.use(
    (
      error: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      if (error instanceof Error && error.name === "CLIENT_STATE_CONFLICT") {
        res.status(409).json({
          ok: false,
          error: {
            code: "CONFIG_CONFLICT",
            message: error.message,
            retryable: true,
            hints: [],
          },
        });
        return;
      }
      const protocol = errorProtocol(error);
      res.status(httpStatus(protocol.code)).json({ ok: false, error: protocol });
    },
  );

  const controller = new AbortController();
  const worker = app.jobs.worker(controller.signal);
  const http = await new Promise<import("node:http").Server>((resolve, reject) => {
    const listening = server.listen(options.port ?? 0, "127.0.0.1");
    listening.once("error", reject);
    listening.once("listening", () => {
      const address = listening.address();
      if (!address || typeof address === "string") {
        reject(new Error("服务没有获得回环端口"));
        return;
      }
      port = address.port;
      origin = `http://127.0.0.1:${port}`;
      resolve(listening);
    });
  });

  let stopping = false;
  const close = async () => {
    if (stopping) return;
    stopping = true;
    controller.abort();
    http.closeAllConnections();
    await Promise.race([
      Promise.all([
        worker.catch(() => undefined),
        new Promise<void>((resolve) => http.close(() => resolve())),
      ]),
      new Promise<void>((resolve) => setTimeout(resolve, 8000)),
    ]);
    app.close();
    await fsp.rm(sessionDir, { recursive: true, force: true });
  };
  return { port, origin, token: options.token, close };
}
