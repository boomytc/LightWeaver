import express from "express";
import multer from "multer";
import fs from "node:fs/promises";
import os from "node:os";
import {
  Application,
  errorProtocol,
  httpStatus,
} from "@lightweaver/weaver/app";
import { z, MediaRef } from "@lightweaver/weaver/contracts";

const app = new Application(),
  server = express();
const upload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: 10 * 1024 ** 3, files: 1 },
});
server.use((req, res, next) => {
  const origin = req.headers.origin,
    host = req.hostname;
  if (
    !["127.0.0.1", "localhost", "::1"].includes(host) ||
    (origin &&
      !/^http:\/\/(127\.0\.0\.1|localhost):(5175|4175|5176)$/.test(origin))
  ) {
    res.status(403).json({
      ok: false,
      error: {
        code: "LOCAL_ONLY",
        message: "仅允许本地 Studio",
        retryable: false,
        hints: [],
      },
    });
    return;
  }
  next();
});
server.use(express.json({ limit: "16mb" }));
const route = (
  method: "get" | "post" | "put" | "delete",
  path: string,
  handler: (req: express.Request) => unknown | Promise<unknown>,
) =>
  server[method](path, async (req, res, next) => {
    try {
      res.json({ ok: true, result: await handler(req) });
    } catch (e) {
      next(e);
    }
  });
const Write = z.object({ expectedRevision: z.string(), requestId: z.string() });
route("get", "/api/capabilities", () => app.capabilities());
route("get", "/api/doctor", () => app.providers.doctor());
route("get", "/api/projects", () => app.projects.list());
route("post", "/api/projects", (req) =>
  app.projects.create(
    z
      .object({
        id: z.string().optional(),
        title: z.string(),
        workflow: z.string(),
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
server.post(
  "/api/projects/:id/assets",
  upload.single("file"),
  async (req, res, next) => {
    try {
      if (!req.file) throw Error("先选择素材");
      const body = Write.parse(req.body);
      const result = await app.addAsset({
        projectId: z.string().parse(req.params.id),
        ...body,
        file: req.file.path,
        name: req.file.originalname,
      });
      res.json({ ok: true, result });
    } catch (e) {
      next(e);
    } finally {
      if (req.file) await fs.rm(req.file.path, { force: true });
    }
  },
);
route("post", "/api/projects/:id/adopt", (req) =>
  app.adoptMaterial({
    projectId: z.string().parse(req.params.id),
    ...Write.extend({ itemId: z.string(), version: z.string() }).parse(
      req.body,
    ),
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
    } catch (e) {
      next(e);
    } finally {
      if (req.file) await fs.rm(req.file.path, { force: true });
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
        })
        .parse(req.body);
      const result = await app.importLibrary({
        itemId: body.itemId,
        expectedVersion: body.expectedVersion || null,
        requestId: body.requestId,
        file: req.file.path,
        fileName: req.file.originalname,
        payload: {
          kind: body.kind,
          name: body.name,
          referenceText: body.referenceText,
        },
      });
      res.json({ ok: true, result });
    } catch (e) {
      next(e);
    } finally {
      if (req.file) await fs.rm(req.file.path, { force: true });
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
      })
      .parse(req.body),
  }),
);
route("post", "/api/projects/:id/search", (req) => {
  const i = z
    .object({
      query: z.string(),
      requestId: z.string(),
      mode: z.enum(["text", "semantic"]),
    })
    .parse(req.body);
  return i.mode === "semantic"
    ? app.analysis.submitSemantic({
        projectId: z.string().parse(req.params.id),
        ...i,
      })
    : app.analysis.search({ projectId: z.string().parse(req.params.id), ...i });
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
      })
      .parse(req.body),
  }),
);
route("post", "/api/voice/design", (req) =>
  app.analysis.standalone({
    kind: "voice-design",
    ...z
      .object({ text: z.string(), style: z.string(), requestId: z.string() })
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
  const i = z
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
  return app.parseCaptions(i.body, i.locale, i.fps, i.source);
});
route("get", "/api/artifacts/:digest", (req) =>
  app.readArtifactJson(z.string().parse(req.params.digest)),
);
route("get", "/api/projects/:id/deliveries", (req) =>
  app.builds.deliveries(z.string().parse(req.params.id)),
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
        res.write(
          `id: ${event.seq}\nevent: weaver\ndata: ${JSON.stringify(event)}\n\n`,
        );
        after = event.seq;
      }
    };
    send();
    const timer = setInterval(send, 500),
      heartbeat = setInterval(() => res.write(": keepalive\n\n"), 15000);
    req.on("close", () => {
      clearInterval(timer);
      clearInterval(heartbeat);
    });
  } catch (e) {
    next(e);
  }
});
server.get("/api/media/:digest", (req, res, next) => {
  try {
    const media = app.mediaFile(z.string().parse(req.params.digest));
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
    res.type(media.mime);
    res.sendFile(
      media.file,
      { dotfiles: "allow", acceptRanges: true },
      (error) => {
        if (error && !res.headersSent) next(error);
      },
    );
  } catch (e) {
    next(e);
  }
});
server.use(
  (
    error: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    const protocol = errorProtocol(error);
    res.status(httpStatus(protocol.code)).json({ ok: false, error: protocol });
  },
);
const controller = new AbortController(),
  worker = app.jobs.worker(controller.signal);
const http = server.listen(
  Number(process.env.LIGHTWEAVER_API_PORT || 5176),
  "127.0.0.1",
  () => process.stderr.write("LightWeaver API http://127.0.0.1:5176\n"),
);
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  controller.abort();
  http.closeAllConnections();
  await Promise.all([
    worker,
    new Promise<void>((resolve) => http.close(() => resolve())),
  ]);
  app.close();
}
process.once("SIGTERM", stop);
process.once("SIGINT", stop);
