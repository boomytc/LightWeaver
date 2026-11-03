import fs from "node:fs";
import path from "node:path";
import {
  z,
  ProjectDocument,
  Scene,
  LibraryVersion,
  MediaAssetVersion,
  type Speech,
} from "../contracts/index.ts";
import { WeaverError } from "../contracts/errors.ts";
import { Store, digest, canonical, now } from "../store/index.ts";
import { backup } from "../store/maintenance.ts";
import { Projects } from "../project/service.ts";
import { Library } from "../library/service.ts";
import { Artifacts } from "../artifacts/index.ts";
import { probe } from "../media/probe.ts";
import { mimeFor, inferKind } from "../media/types.ts";

const LegacyAsset = z.object({
  id: z.string(),
  kind: z.string(),
  label: z.string().optional(),
  file: z.string().optional(),
  files: z.record(z.string(), z.string()).optional(),
  text: z.string().optional(),
  texts: z.record(z.string(), z.string()).optional(),
  style: z.string().optional(),
  task: z.string().optional(),
  expand: z.string().optional(),
  needs: z.array(z.string()).optional(),
  clipOst: z.string().optional(),
  clipAlign: z.string().optional(),
  scenes: z.array(z.unknown()).optional(),
});
const LegacyScene = z.object({
  id: z.string(),
  kind: z.string(),
  source: z.string().optional(),
  still: z.string().optional(),
  in: z.number().optional(),
  out: z.number().optional(),
  ost: z.string().optional(),
  fit: z.enum(["contain", "cover"]).optional(),
  voice: z.string().optional(),
  lines: z.record(z.string(), z.string()).default({}),
  headline: z.string().optional(),
  kicker: z.string().optional(),
  lede: z.string().optional(),
  tags: z.array(z.string()).optional(),
});
const LegacyFilm = z.object({
  id: z.string(),
  task: z.string().optional(),
  recipe: z.string().optional(),
  brand: z.string().default("LightWeaver"),
  voices: z.record(z.string(), z.string()).default({}),
  langs: z.array(z.string()).optional(),
  locales: z.record(
    z.string(),
    z.object({
      title: z.string(),
      titleCard: z
        .object({
          headline: z.string().optional(),
          kicker: z.string().optional(),
          lede: z.string().optional(),
          points: z.array(z.string()).optional(),
          tags: z.array(z.string()).optional(),
        })
        .optional(),
      closeCard: z
        .object({
          headline: z.string().optional(),
          lede: z.string().optional(),
          points: z.array(z.string()).optional(),
        })
        .optional(),
    }),
  ),
  scenes: z.array(LegacyScene),
});
const Journal = z.object({
  id: z.string(),
  state: z.enum(["running", "completed", "rolled-back"]),
  createdAt: z.string(),
  backup: z.string(),
  legacyRoot: z.string(),
  packageVersion: z.string().optional(),
  library: z.array(
    z.object({
      itemId: z.string(),
      before: z.string().nullable(),
      beforeDeleted: z.boolean().optional(),
      after: z.string(),
    }),
  ),
  projects: z.array(
    z.object({
      path: z.string(),
      projectId: z.string(),
      head: z.string(),
      report: z.array(z.unknown()),
    }),
  ),
  errors: z.array(z.object({ path: z.string(), message: z.string() })),
});
function walk(root: string): string[] {
  if (!fs.existsSync(root)) return [];
  const files: string[] = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const file = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...walk(file));
    else if (entry.isFile() && entry.name === "film.json") files.push(file);
  }
  return files.sort();
}
function safeFile(root: string, rel: string): string {
  const base = fs.realpathSync(root),
    real = fs.realpathSync(path.resolve(root, rel));
  if (!real.startsWith(`${base}${path.sep}`))
    throw new WeaverError("INVALID_INPUT", "旧数据引用越界", { rel });
  return real;
}

export class Migration {
  constructor(
    private readonly store: Store,
    readonly projects: Projects,
    readonly library: Library,
  ) {}
  inventory(root: string) {
    const legacyRoot = fs.realpathSync(root),
      projects = walk(path.join(legacyRoot, "data")).map((file) => {
        try {
          const film = LegacyFilm.parse(
              JSON.parse(fs.readFileSync(file, "utf8")),
            ),
            assets = z
              .object({ assets: z.array(LegacyAsset) })
              .parse(
                JSON.parse(
                  fs.readFileSync(
                    path.join(path.dirname(file), "assets.json"),
                    "utf8",
                  ),
                ),
              ).assets;
          return {
            path: path.relative(legacyRoot, file),
            id: film.id,
            scenes: film.scenes.length,
            assets: assets.length,
            derived: assets.filter((a) =>
              ["line", "output", "transcript", "description"].includes(a.kind),
            ).length,
            narrationRangeReview: film.scenes
              .filter((s) => s.source && s.ost !== "original")
              .map((s) => ({
                scene: s.id,
                in: s.in,
                out: s.out,
                action:
                  "根据旧 wav 和真实视频推导旧实际取材范围；无法确定则 needs-review",
              })),
          };
        } catch (e) {
          return {
            path: path.relative(legacyRoot, file),
            error: e instanceof Error ? e.message : String(e),
          };
        }
      });
    const catalog = path.join(legacyRoot, "library/assets.json");
    return {
      dryRun: true,
      projects,
      library: fs.existsSync(catalog)
        ? z
            .object({ assets: z.array(LegacyAsset) })
            .parse(JSON.parse(fs.readFileSync(catalog, "utf8")))
            .assets.map((a) => ({
              id: a.id,
              kind: a.kind,
              binding: "migration-time-snapshot",
            }))
        : [],
      originalDataPolicy: "保留原位，不修改旧 JSON 或媒体",
      command:
        "weaver migrate --root /absolute/workspace --execute --request-id migration-id",
    };
  }
  private save(journal: z.infer<typeof Journal>): void {
    this.store.db
      .prepare(
        "INSERT INTO migration_journals VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET state=excluded.state,json=excluded.json",
      )
      .run(journal.id, journal.state, canonical(journal));
  }
  async execute(
    root: string,
    requestId: string,
    options: { libraryOnly?: boolean; packageVersion?: string } = {},
  ) {
    return this.store.owned("migration", () =>
      this.executeInner(root, requestId, options),
    );
  }
  private async executeInner(
    root: string,
    requestId: string,
    options: { libraryOnly?: boolean; packageVersion?: string },
  ) {
    const legacyRoot = fs.realpathSync(root),
      id = `migration-${digest({ legacyRoot, requestId, options }).slice(0, 32)}`,
      existing = this.store.db
        .prepare("SELECT json FROM migration_journals WHERE id=?")
        .get(id);
    let journal: z.infer<typeof Journal>;
    if (existing) {
      journal = Journal.parse(
        JSON.parse(z.object({ json: z.string() }).parse(existing).json),
      );
      if (journal.state !== "running") return journal;
    } else {
      const backupRel = `backups/${id}`,
        result = await backup(
          this.store,
          path.join(this.store.root, backupRel),
        );
      journal = Journal.parse({
        id,
        state: "running",
        createdAt: now(),
        backup: backupRel,
        legacyRoot: path.basename(legacyRoot),
        packageVersion: options.packageVersion,
        library: [],
        projects: [],
        errors: [],
      });
      // 原始根绝对路径只用于本次调用，不进入运行数据库。
      for (const file of [
        ...walk(path.join(legacyRoot, "data")),
        path.join(legacyRoot, "library/assets.json"),
      ])
        if (fs.existsSync(file)) {
          const dest = path.join(
            result.directory,
            "legacy",
            path.relative(legacyRoot, file),
          );
          fs.mkdirSync(path.dirname(dest), { recursive: true });
          fs.copyFileSync(file, dest);
          if (path.basename(file) === "film.json") {
            const a = path.join(path.dirname(file), "assets.json");
            if (fs.existsSync(a))
              fs.copyFileSync(a, path.join(path.dirname(dest), "assets.json"));
          }
        }
      this.save(journal);
    }
    const libMap = new Map<string, z.infer<typeof LibraryVersion>>(),
      catalog = path.join(legacyRoot, "library/assets.json");
    if (fs.existsSync(catalog))
      for (const a of z
        .object({ assets: z.array(LegacyAsset) })
        .parse(JSON.parse(fs.readFileSync(catalog, "utf8"))).assets) {
        if (!["voice", "method", "element", "reference"].includes(a.kind))
          continue;
        const itemId = `legacy-${a.id}`,
          previous = journal.library.find((v) => v.itemId === itemId);
        if (previous) {
          libMap.set(a.id, this.library.read(itemId, previous.after));
          continue;
        }
        try {
          let payload: unknown;
          if (a.kind === "method")
            payload = {
              kind: "method",
              name: a.label || a.id,
              description: a.text || "",
              workflow:
                a.task === "study-explainer"
                  ? "study-explainer"
                  : "footage-narration",
              needs: a.needs || [],
              clipAudio: a.clipOst,
              clipAlignment:
                a.clipAlign === "sequences" ? "observed-sequences" : undefined,
              sceneTemplate: [],
              outline: a.expand
                ? { expand: a.expand, beats: a.scenes || [] }
                : undefined,
            };
          else {
            const rel = a.file || a.files?.zh;
            if (!rel) throw new WeaverError("INVALID_INPUT", "库项没有源文件");
            const d = await this.store.importFile(
              safeFile(path.join(legacyRoot, "library"), rel),
              mimeFor(rel),
            );
            payload =
              a.kind === "voice"
                ? {
                    kind: "voice",
                    name: a.label || a.id,
                    provider: "modelbest-voxcpm2",
                    reference: d,
                    referenceText: a.text || a.texts?.zh || "",
                    style: a.style || "",
                  }
                : {
                    kind: "material",
                    name: a.label || a.id,
                    digest: d,
                    mime: mimeFor(rel),
                  };
          }
          const previousHead = z
            .object({ head: z.string(), deleted: z.number() })
            .optional()
            .parse(
              this.store.db
                .prepare("SELECT head,deleted FROM library_items WHERE id=?")
                .get(itemId),
            );
          const before = previousHead?.head ?? null;
          this.store.transaction(() => {
            const version = this.library.publish({
              itemId,
              expectedVersion: before,
              requestId: `${id}-${digest(a).slice(0, 12)}`,
              payload,
            });
            journal.library.push({
              itemId,
              before,
              beforeDeleted: !!previousHead?.deleted,
              after: version.version,
            });
            journal.errors = journal.errors.filter(
              (e) => e.path !== `library:${a.id}`,
            );
            libMap.set(a.id, version);
            this.save(journal);
          });
        } catch (e) {
          journal.errors = journal.errors.filter(
            (e) => e.path !== `library:${a.id}`,
          );
          journal.errors.push({
            path: `library:${a.id}`,
            message: e instanceof Error ? e.message : String(e),
          });
          this.save(journal);
        }
      }
    if (options.libraryOnly) {
      journal.state = journal.errors.length ? "running" : "completed";
      this.save(journal);
      return journal;
    }
    for (const file of walk(path.join(legacyRoot, "data"))) {
      const rel = path.relative(legacyRoot, file);
      if (journal.projects.some((p) => p.path === rel)) continue;
      const report: unknown[] = [],
        dir = path.dirname(file),
        projectId = `legacy-${digest(rel).slice(0, 24)}`;
      try {
        const film = LegacyFilm.parse(
            JSON.parse(fs.readFileSync(file, "utf8")),
          ),
          assets = z
            .object({ assets: z.array(LegacyAsset) })
            .parse(
              JSON.parse(
                fs.readFileSync(path.join(dir, "assets.json"), "utf8"),
              ),
            ).assets,
          media = new Map<string, z.infer<typeof MediaAssetVersion>>();
        for (const a of assets)
          for (const [locale, source] of Object.entries(
            a.files || (a.file ? { default: a.file } : {}),
          )) {
            try {
              const local = safeFile(dir, source),
                content = await this.store.importFile(local, mimeFor(source));
              if (
                ["line", "output", "transcript", "description"].includes(a.kind)
              ) {
                new Artifacts(this.store).record({
                  operation: "legacy-import",
                  cacheKey: digest({
                    journal: id,
                    path: rel,
                    asset: a.id,
                    locale,
                    content,
                  }),
                  generation: id,
                  digest: content,
                  mime: mimeFor(source),
                  dependencies: [],
                  provenance: {
                    legacyProject: film.id,
                    legacyRef: a.id,
                    locale,
                    state: "historical/unverified",
                    migration: id,
                  },
                  verified: false,
                });
                report.push({
                  asset: a.id,
                  locale,
                  state: "historical/unverified",
                });
                continue;
              }
              const base = {
                assetId: `legacy-${digest({ projectId, asset: a.id, locale }).slice(0, 24)}`,
                digest: content,
                kind: inferKind(source),
                name: path.basename(source),
                mime: mimeFor(source),
                bytes: fs.statSync(local).size,
              };
              const v = MediaAssetVersion.parse({
                ...base,
                version: digest(base),
              });
              this.store.db
                .prepare("INSERT OR IGNORE INTO assets VALUES(?,?,?)")
                .run(v.assetId, v.version, canonical(v));
              this.store.pin(`asset:${v.assetId}@${v.version}`, v);
              media.set(`${a.id}:${locale}`, v);
            } catch (e) {
              report.push({
                asset: a.id,
                locale,
                state: "needs-review",
                error: e instanceof Error ? e.message : String(e),
              });
            }
          }
        const locales = film.langs?.length
            ? film.langs
            : Object.keys(film.locales),
          scenes: z.infer<typeof Scene>[] = [];
        for (const s of film.scenes) {
          try {
            const text = Object.fromEntries(
                locales
                  .filter((l) => s.lines[l]?.trim())
                  .map((l) => [l, s.lines[l]]),
              ),
              voice = Object.fromEntries(
                locales.flatMap((l) => {
                  const ref = s.voice || film.voices[l];
                  const v = ref
                    ? libMap.get(ref.replace(/^library:/, ""))
                    : undefined;
                  return v?.payload.kind === "voice"
                    ? [[l, { itemId: v.itemId, version: v.version }]]
                    : [];
                }),
              );
            const speech: Speech | undefined =
              s.ost !== "original" && Object.keys(text).length
                ? { kind: "authored", text, voice }
                : undefined;
            const findMedia = (ref: string | undefined) =>
              ref
                ? media.get(`${ref.replace(/^asset:/, "")}:default`) ||
                  media.get(`${ref.replace(/^asset:/, "")}:${locales[0]}`)
                : undefined;
            const source = findMedia(s.source),
              image = findMedia(s.still);
            if ((s.source && !source) || (s.still && !image))
              throw new WeaverError(
                "INVALID_INPUT",
                "旧场景引用的素材缺失，需要人工修复",
              );
            let raw: unknown;
            if (source) {
              const startUs = Math.round((s.in || 0) * 1e6),
                selectedOutUs = Math.round((s.out || (s.in || 0) + 1) * 1e6);
              let durationUs = selectedOutUs - startUs;
              if (speech) {
                const line = assets.find(
                    (a) =>
                      a.kind === "line" &&
                      (a.id === `line.${s.id}.${locales[0]}` ||
                        a.id === `line.${s.id}` ||
                        path.basename(
                          a.files?.[locales[0]] || a.file || "",
                          ".wav",
                        ) === `${s.id}.${locales[0]}`),
                  ),
                  wav = line?.files?.[locales[0]] || line?.file;
                if (wav) {
                  const audio = await probe(safeFile(dir, wav)),
                    video = await probe(this.store.blobPath(source.digest)),
                    actualEndUs = startUs + audio.durationUs;
                  if (actualEndUs <= video.durationUs && audio.durationUs > 0) {
                    durationUs = audio.durationUs;
                    report.push({
                      scene: s.id,
                      legacySelectedOutUs: selectedOutUs,
                      legacyActualEndUs: actualEndUs,
                      convertedRange: { startUs, durationUs },
                      evidence: "旧旁白 wav 时长与真实视频",
                      state: "migration-time-reconstruction",
                    });
                  } else
                    report.push({
                      scene: s.id,
                      state: "needs-review",
                      reason: "旧实际范围超出源媒体",
                    });
                } else
                  report.push({
                    scene: s.id,
                    state: "needs-review",
                    reason: "没有可证明旧实际取材范围的 wav",
                  });
              }
              raw = {
                id: s.id,
                label: s.headline || "",
                kind: "clip",
                source: { assetId: source.assetId, version: source.version },
                sourceRange: { startUs, durationUs },
                framing: { fit: s.fit || "contain" },
                playback: speech
                  ? {
                      kind: "speech",
                      audio:
                        s.ost === "mix"
                          ? { kind: "mix", speech }
                          : { kind: "narration", speech },
                      tailFrames: 0,
                      overflow: { kind: "reject" },
                    }
                  : { kind: "source", audio: { kind: "original" } },
              };
            } else if (image)
              raw = {
                id: s.id,
                kind: "still",
                image: { assetId: image.assetId, version: image.version },
                framing: { fit: s.fit || "contain" },
                timing: speech
                  ? { kind: "speech", speech, tailFrames: 8 }
                  : { kind: "fixed", frames: 90 },
              };
            else
              raw = {
                id: s.id,
                kind: "card",
                cardSpec: {
                  template: s.kind === "close" ? "close" : "title",
                  version: "2",
                  brand: film.brand,
                  copy: Object.fromEntries(
                    locales.map((l) => {
                      const c =
                        s.kind === "close"
                          ? film.locales[l]?.closeCard
                          : film.locales[l]?.titleCard;
                      return [
                        l,
                        {
                          ...c,
                          headline:
                            s.headline ||
                            c?.headline ||
                            film.locales[l]?.title ||
                            "",
                          lede: s.lede || c?.lede || "",
                        },
                      ];
                    }),
                  ),
                },
                timing: speech
                  ? { kind: "speech", speech, tailFrames: 8 }
                  : { kind: "fixed", frames: 90 },
              };
            scenes.push(Scene.parse(raw));
          } catch (e) {
            report.push({
              scene: s.id,
              state: "needs-review",
              error: e instanceof Error ? e.message : String(e),
            });
          }
        }
        const method = libMap.get(`method.${film.recipe}`),
          refs = [...media.values()].map((a) => ({
            assetId: a.assetId,
            version: a.version,
          }));
        const created = this.projects.create({
          id: projectId,
          title: film.locales[locales[0]]?.title || film.id,
          workflow:
            film.task === "study-explainer"
              ? "study-explainer"
              : "footage-narration",
          origin: rel.startsWith("data/first-party/") ? "first-party" : "user",
          requestId: `${id}-create-${digest(rel).slice(0, 10)}`,
        });
        const document = ProjectDocument.parse({
          ...created.document,
          locales,
          assets: refs,
          scenes,
          bindings: [...libMap.values()]
            .filter((v) => v.payload.kind === "voice")
            .map((v) => ({ itemId: v.itemId, version: v.version })),
          method: method
            ? { itemId: method.itemId, version: method.version }
            : undefined,
        });
        const revision = this.projects.update({
          projectId,
          expectedRevision: created.id,
          requestId: `${id}-update-${digest(rel).slice(0, 10)}`,
          document,
        });
        report.push({
          binding: "migration-time-snapshot",
          note: "旧库没有历史版本证明；派生结果未被新 build 当作缓存",
        });
        journal.projects.push({
          path: rel,
          projectId,
          head: revision.id,
          report,
        });
        journal.errors = journal.errors.filter((e) => e.path !== rel);
        this.save(journal);
      } catch (e) {
        journal.errors.push({
          path: rel,
          message: e instanceof Error ? e.message : String(e),
        });
        this.save(journal);
      }
    }
    journal.state = journal.errors.length ? "running" : "completed";
    this.save(journal);
    return journal;
  }
  rollback(id: string) {
    return this.store.transaction(() => {
      const j = this.store.readJson(
        "SELECT json FROM migration_journals WHERE id=?",
        [id],
        Journal,
      );
      if (j.state === "rolled-back") return j;
      for (const p of j.projects) {
        const current = this.projects.read(p.projectId);
        if (current.id !== p.head)
          throw new WeaverError(
            "REVISION_CONFLICT",
            "迁移后的项目已编辑，不能自动回滚",
            { projectId: p.projectId, currentRevision: current.id },
          );
      }
      for (const p of j.library) {
        const row = z
          .object({ head: z.string(), deleted: z.number() })
          .parse(
            this.store.db
              .prepare("SELECT head,deleted FROM library_items WHERE id=?")
              .get(p.itemId),
          );
        if (row.head !== p.after || row.deleted)
          throw new WeaverError(
            "REVISION_CONFLICT",
            "迁移后的库项已更新，不能自动回滚",
            p,
          );
      }
      for (const p of j.projects)
        this.store.db
          .prepare("UPDATE projects SET deleted=1 WHERE id=? AND head=?")
          .run(p.projectId, p.head);
      for (const p of j.library)
        this.store.db
          .prepare(
            "UPDATE library_items SET head=?,deleted=? WHERE id=? AND head=?",
          )
          .run(
            p.before || p.after,
            p.before ? Number(p.beforeDeleted ?? false) : 1,
            p.itemId,
            p.after,
          );
      j.state = "rolled-back";
      this.save(j);
      return j;
    });
  }
}
