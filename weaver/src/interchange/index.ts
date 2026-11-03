import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { resourcePath } from "../runtime.ts";
import {
  z,
  Digest,
  ProjectRevision,
  MediaAssetVersion,
  LibraryVersion,
  ArtifactManifest,
  TimelineManifest,
  AnalysisEntry,
  RunSnapshot,
  JIAN_YING_PROFILE,
  Id,
  speechOf,
  refKey,
  type Scene,
} from "../contracts/index.ts";
import { WeaverError } from "../contracts/errors.ts";
import {
  Store,
  digest,
  fileBytesDigest,
  newId,
  now,
  canonical,
} from "../store/index.ts";
import { Projects } from "../project/service.ts";
import { Builds } from "../app/build.ts";
import { processRun } from "../media/process.ts";
import { parseLastJson } from "../adapters/providers.ts";
import { toSrt, toAss } from "../timeline/captions.ts";

const Bundle = z.object({
  schemaVersion: z.literal(2),
  revision: ProjectRevision,
  assets: z.array(MediaAssetVersion),
  library: z.array(LibraryVersion),
  artifacts: z.array(ArtifactManifest),
  analysis: z.array(AnalysisEntry),
  blobs: z.array(
    z.object({ digest: Digest, bytes: z.number(), mime: z.string() }),
  ),
});
import { renderAudioSegment } from "../media/render.ts";
const FileEntry = z.object({
  path: z.string(),
  digest: Digest,
  bytes: z.number(),
});
const PackageReceipt = z.object({
  schemaVersion: z.literal(2),
  format: z.enum(["otio", "jianying"]),
  timelineDigest: Digest,
  createdAt: z.string(),
  files: z.array(FileEntry),
  adapter: z.unknown(),
  notes: z.array(z.string()),
});
function emptyDest(dest: string): string {
  const abs = path.resolve(dest);
  if (fs.existsSync(abs))
    throw new WeaverError("INVALID_INPUT", "导出目标已存在，选择新目录", {
      dest: abs,
    });
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  return abs;
}
function safeRelative(root: string, rel: string): string {
  if (path.isAbsolute(rel) || rel.split(/[\\/]/).includes(".."))
    throw new WeaverError("INVALID_INPUT", "包内引用越界");
  const file = fs.realpathSync(path.join(root, rel));
  if (!file.startsWith(`${fs.realpathSync(root)}${path.sep}`))
    throw new WeaverError("INVALID_INPUT", "包内软链越界");
  return file;
}

export class Interchange {
  constructor(
    private readonly store: Store,
    readonly projects: Projects,
    readonly builds: Builds,
  ) {}
  async bundle(projectId: string, destination: string, revisionId?: string) {
    const dest = emptyDest(destination),
      temp = `${dest}.${newId("partial")}`;
    fs.mkdirSync(temp);
    try {
      const revision = this.projects.read(projectId, revisionId),
        assets = this.projects.assetsFor(revision.document, "saved"),
        library = this.projects.libraryFor(revision.document, "saved"),
        refs = new Set<string>([
          ...assets.map((a) => a.digest),
          ...library.flatMap((v) =>
            v.payload.kind === "voice"
              ? [v.payload.reference]
              : v.payload.kind === "material"
                ? [v.payload.digest]
                : [],
          ),
        ]);
      const candidates = this.store.listJson(
        "SELECT json FROM artifacts WHERE verified=1",
        [],
        ArtifactManifest,
      );
      const artifacts: z.infer<typeof ArtifactManifest>[] = [];
      const speechScenes = [
        ...revision.document.scenes,
        ...(revision.document.creativePlan?.beats.map((beat) => beat.scene) ?? []),
      ];
      const relevantSpeech = (a: z.infer<typeof ArtifactManifest>) => {
        const inputs = z
          .object({
            text: z.string(),
            locale: z.string(),
            voiceVersion: z.string(),
            style: z.string().optional(),
          })
          .safeParse(a.provenance.inputs);
        return (
          inputs.success &&
          speechScenes.some((scene) => {
            const speech = speechOf(scene);
            const voice = speech?.kind === "authored" ? speech.voice[inputs.data.locale] : undefined;
            const version = library.find((v) => v.itemId === voice?.itemId && v.version === voice?.version);
            return (
              speech?.kind === "authored" &&
              speech.text[inputs.data.locale] === inputs.data.text &&
              speech.voice[inputs.data.locale]?.version ===
                inputs.data.voiceVersion &&
              (speech.style?.[inputs.data.locale] ?? (version?.payload.kind === "voice" ? version.payload.style : undefined) ?? "") === (inputs.data.style ?? "")
            );
          })
        );
      };
      let pending = candidates;
      while (pending.length) {
        const ready = pending.filter(
          (a) =>
            a.operation !== "render-v2" &&
            (!a.operation.startsWith("tts-") || relevantSpeech(a)) &&
            a.dependencies.length > 0 &&
            a.dependencies.every((d) => refs.has(d)) &&
            this.store.verifyBlob(a.digest),
        );
        if (!ready.length) break;
        for (const a of ready) {
          artifacts.push(a);
          refs.add(a.digest);
        }
        const selected = new Set(ready.map((a) => a.id));
        pending = pending.filter((a) => !selected.has(a.id));
      }
      const analysis = this.store
        .listJson(
          "SELECT json FROM analysis WHERE project_id=?",
          [projectId],
          AnalysisEntry,
        )
        .filter((e) => assets.some((a) => a.digest === e.sourceDigest));
      analysis.forEach((e) => refs.add(e.evidenceDigest));
      for (const d of (
        await this.builds.deliveries(projectId, revision.document)
      ).filter((d) => d.state === "current")) {
        Object.values(d.artifacts).forEach((x) => refs.add(x));
        refs.add(d.timelineDigest);
        refs.add(d.runSnapshotDigest);
        const m = this.store.jsonBlob(d.timelineDigest, TimelineManifest);
        m.audio.forEach((a) => refs.add(a.digest));
      }
      const blobs = [...refs].sort().map((d) => {
        const r = z
          .object({ bytes: z.number(), mime: z.string() })
          .parse(
            this.store.db
              .prepare("SELECT bytes,mime FROM blobs WHERE digest=?")
              .get(d),
          );
        return { digest: Digest.parse(d), ...r };
      });
      for (const b of blobs) {
        if (!this.store.verifyBlob(b.digest))
          throw new WeaverError("INTEGRITY_FAILED", "bundle 引用不完整", b);
        const target = path.join(
          temp,
          "blobs",
          b.digest.slice(0, 2),
          b.digest.slice(2),
        );
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.copyFileSync(this.store.blobPath(b.digest), target);
      }
      const manifest = Bundle.parse({
        schemaVersion: 2,
        revision,
        assets,
        library,
        artifacts,
        analysis,
        blobs,
      });
      fs.writeFileSync(path.join(temp, "bundle.json"), canonical(manifest));
      if (dest.endsWith(".zip")) {
        await processRun("python3", [
          "-c",
          "import pathlib,zipfile,sys; r=pathlib.Path(sys.argv[1]); z=zipfile.ZipFile(sys.argv[2],'w',zipfile.ZIP_DEFLATED); [z.write(p,p.relative_to(r)) for p in r.rglob('*') if p.is_file()];z.close()",
          temp,
          `${temp}.zip`,
        ]);
        fs.renameSync(`${temp}.zip`, dest);
      } else fs.renameSync(temp, dest);
      return {
        destination: dest,
        projectRevision: revision.id,
        semanticDigest: digest({
          document: revision.document,
          assets,
          library,
        }),
        blobs: blobs.length,
      };
    } finally {
      fs.rmSync(temp, { recursive: true, force: true });
      fs.rmSync(`${temp}.zip`, { force: true });
    }
  }
  async importBundle(source: string, requestId: string, projectId?: string) {
    try {
      return await this.store.owned("bundle-import", () =>
        this.importBundleInner(source, requestId, projectId),
      );
    } catch (error) {
      if (error && typeof error === "object" && "code" in error &&
          (error.code === "ENOENT" || error.code === "ENOTDIR")) {
        const missingSource = "path" in error && typeof error.path === "string" &&
          path.resolve(error.path) === path.resolve(source);
        throw new WeaverError(missingSource ? "NOT_FOUND" : "INVALID_INPUT",
          missingSource ? "项目包不存在或已被移动" : "项目包缺少必要文件",
          { source }, ["重新选择完整的 LightWeaver 项目包 ZIP 或含 bundle.json 的目录。"]);
      }
      throw error;
    }
  }
  private async importBundleInner(
    source: string,
    requestId: string,
    projectId?: string,
  ) {
    let root = fs.realpathSync(source),
      temp: string | undefined;
    if (fs.statSync(root).isFile()) {
      temp = fs.mkdtempSync(path.join(os.tmpdir(), "weaver-bundle-"));
      try {
        const result = await processRun("python3", [
          "-c",
          `import json, pathlib, sys, zipfile
try:
    with zipfile.ZipFile(sys.argv[1]) as archive:
        for name in archive.namelist():
            entry = pathlib.PurePosixPath(name)
            if entry.is_absolute() or ".." in entry.parts:
                raise ValueError("unsafe zip")
        archive.extractall(pathlib.Path(sys.argv[2]).resolve())
except (zipfile.BadZipFile, ValueError, FileNotFoundError, NotADirectoryError) as error:
    print(json.dumps({"error": str(error)}))
else:
    print(json.dumps({"error": None}))`,
          root,
          temp,
        ]);
        const extraction = z.object({ error: z.string().nullable() }).parse(JSON.parse(result.stdout));
        if (extraction.error !== null)
          throw new WeaverError("INVALID_INPUT", "无法读取项目包 ZIP", { source, reason: extraction.error }, ["重新选择完整的 LightWeaver 项目包，或重新导出后再导入。"]);
        root = temp;
      } catch (e) {
        fs.rmSync(temp, { recursive: true, force: true });
        throw e;
      }
    }
    try {
      const manifest = fs.readFileSync(safeRelative(root, "bundle.json"), "utf8");
      let raw: unknown;
      try { raw = JSON.parse(manifest); }
      catch {
        throw new WeaverError("INVALID_INPUT", "项目包的 bundle.json 不是有效 JSON", { source }, ["重新导出完整项目包后导入。"]);
      }
      const bundle = Bundle.parse(raw);
      const blobIds = new Set(bundle.blobs.map((b) => b.digest)),
        assetIds = new Set(bundle.assets.map(refKey)),
        libraryIds = new Set(
          bundle.library.map((v) => `${v.itemId}@${v.version}`),
        );
      const requireBlob = (value: string) => {
        if (!blobIds.has(Digest.parse(value)))
          throw new WeaverError("INTEGRITY_FAILED", "bundle 没有包含必要媒体", {
            digest: value,
          });
      };
      const requireMedia = (ref: Parameters<typeof refKey>[0]) => {
        if (!assetIds.has(refKey(ref)))
          throw new WeaverError(
            "INTEGRITY_FAILED",
            "bundle 没有包含精确素材版本",
            ref,
          );
      };
      const requireLibrary = (ref: { itemId: string; version: string }) => {
        if (!libraryIds.has(`${ref.itemId}@${ref.version}`))
          throw new WeaverError(
            "INTEGRITY_FAILED",
            "bundle 没有包含精确库版本",
            ref,
          );
      };
      const checkScene = (scene: Scene) => {
        if (scene.kind === "clip") requireMedia(scene.source);
        if (scene.kind === "still") requireMedia(scene.image);
        const speech = speechOf(scene);
        if (speech?.kind === "imported")
          Object.values(speech.audio).forEach(requireMedia);
        if (speech?.kind === "authored")
          Object.values(speech.voice).forEach(requireLibrary);
      };
      bundle.assets.forEach((a) => {
        requireBlob(a.digest);
        a.provenance?.inputs.forEach((input) => requireMedia(input.source));
      });
      bundle.library.forEach((v) => {
        if (v.payload.kind === "method")
          v.payload.sceneTemplate.forEach(checkScene);
        else
          requireBlob(
            v.payload.kind === "voice" ? v.payload.reference : v.payload.digest,
          );
      });
      const doc = bundle.revision.document;
      doc.assets.forEach(requireMedia);
      doc.bindings.forEach(requireLibrary);
      if (doc.method) requireLibrary(doc.method);
      doc.scenes.forEach(checkScene);
      doc.creativePlan?.beats.forEach((b) => checkScene(b.scene));
      if (doc.bgm) requireMedia(doc.bgm.source);
      doc.captions.forEach((t) =>
        t.cues.forEach((c) => {
          if (c.time.kind === "source") requireMedia(c.time.source);
        }),
      );
      bundle.artifacts.forEach((a) => {
        requireBlob(a.digest);
        a.dependencies.forEach(requireBlob);
      });
      bundle.analysis.forEach((a) => {
        requireMedia(a.source);
        requireBlob(a.evidenceDigest);
      });
      for (const b of bundle.blobs) {
        const file = safeRelative(
          root,
          `blobs/${b.digest.slice(0, 2)}/${b.digest.slice(2)}`,
        );
        if (
          fs.statSync(file).size !== b.bytes ||
          fileBytesDigest(file) !== b.digest
        )
          throw new WeaverError("INTEGRITY_FAILED", "bundle blob 摘要错误", b);
        await this.store.importFile(file, b.mime);
      }
      return this.store.mutate(
        "bundle-import",
        requestId,
        { bundleDigest: digest(bundle), projectId },
        ProjectRevision,
        () => {
          for (const a of bundle.assets) {
            const { version, ...base } = a;
            if (digest(base) !== version)
              throw new WeaverError("INTEGRITY_FAILED", "资产版本摘要错误");
            this.store.db
              .prepare("INSERT OR IGNORE INTO assets VALUES(?,?,?)")
              .run(a.assetId, a.version, canonical(a));
            this.store.pin(`asset:${a.assetId}@${a.version}`, a);
          }
          for (const v of bundle.library) {
            if (digest(v.payload) !== v.version)
              throw new WeaverError("INTEGRITY_FAILED", "库版本摘要错误");
            this.store.db
              .prepare("INSERT OR IGNORE INTO library_items VALUES(?,?,0)")
              .run(v.itemId, v.version);
            this.store.db
              .prepare("INSERT OR IGNORE INTO library_versions VALUES(?,?,?)")
              .run(v.itemId, v.version, canonical(v));
            this.store.pin(`library:${v.itemId}@${v.version}`, v);
          }
          for (const a of bundle.artifacts) {
            if (
              !this.store.verifyBlob(a.digest) ||
              a.dependencies.some((d) => !this.store.verifyBlob(d))
            )
              throw new WeaverError("INTEGRITY_FAILED", "物化依赖缺失");
            const id = newId("artifact");
            this.store.db
              .prepare("INSERT INTO artifacts VALUES(?,?,?,?,?,?,?)")
              .run(
                id,
                a.operation,
                a.cacheKey,
                a.generation,
                a.digest,
                a.verified ? 1 : 0,
                canonical({ ...a, id }),
              );
            this.store.pin(`artifact:${id}`, a);
          }
          const created = this.projects.create({
            id: projectId,
            title: bundle.revision.document.title,
            workflow: bundle.revision.document.workflow,
            origin: bundle.revision.document.origin,
            requestId: `bundle-create-${digest(requestId)}`,
          });
          for (const e of bundle.analysis) {
            const entry = AnalysisEntry.parse({
              ...e,
              id: `analysis-${digest({ projectId: created.projectId, id: e.id })}`,
              projectId: created.projectId,
            });
            this.store.db
              .prepare("INSERT INTO analysis VALUES(?,?,?,?,?,?,?,?)")
              .run(
                entry.id,
                entry.projectId,
                `${entry.source.assetId}@${entry.source.version}`,
                entry.kind,
                entry.range.startUs,
                entry.range.durationUs,
                entry.model,
                canonical(entry),
              );
            this.store.pin(`analysis:${entry.id}`, entry);
          }
          const plan = bundle.revision.document.creativePlan;
          const revision = this.projects.update({
            projectId: created.projectId,
            expectedRevision: created.id,
            requestId: `bundle-document-${digest(requestId)}`,
            document: { ...bundle.revision.document, id: created.projectId,
              creativePlan: plan ? {...plan, beats: plan.beats.map((beat) => ({...beat,
                evidence: beat.evidence.map((e) => ({...e,
                  analysisId: `analysis-${digest({projectId: created.projectId, id: e.analysisId})}`,
                })),
              }))} : undefined,
            },
          });
          this.store.pin(
            `bundle:${created.projectId}`,
            bundle.blobs.map((b) => b.digest),
          );
          return revision;
        },
      );
    } finally {
      if (temp) fs.rmSync(temp, { recursive: true, force: true });
    }
  }
  async export(input: {
    projectId: string;
    format: "otio" | "jianying";
    destination: string;
    deliveryId?: string;
  }) {
    const d = (await this.builds.deliveries(input.projectId)).find((d) =>
      input.deliveryId ? d.id === input.deliveryId : d.state === "current",
    );
    if (!d)
      throw new WeaverError(
        "BUILD_ISSUES",
        "先完成一份交付，或显式选择历史 deliveryId",
      );
    const m = this.store.jsonBlob(d.timelineDigest, TimelineManifest),
      snap = this.store.jsonBlob(d.runSnapshotDigest, RunSnapshot),
      dest = emptyDest(input.destination),
      temp = `${dest}.${newId("partial")}`;
    fs.mkdirSync(path.join(temp, "media"), { recursive: true });
    const files: z.infer<typeof FileEntry>[] = [];
    const copy = (d: string, relative: string) => {
      if (!this.store.verifyBlob(d))
        throw new WeaverError("INTEGRITY_FAILED", "交接媒体缺失", {
          digest: d,
        });
      const p = path.join(temp, relative);
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.copyFileSync(this.store.blobPath(d), p);
      return relative;
    };
    try {
      const originals = snap.assets.map((a) => ({
        ...a,
        file: copy(
          a.digest,
          `media/source-${a.assetId}-${a.version.slice(0, 8)}${path.extname(a.name)}`,
        ),
      }));
      const visuals = m.visuals.map((v, i) => {
        const baked = d.artifacts[`segment-${i}`];
        if (!baked)
          throw new WeaverError(
            "BUILD_ISSUES",
            "交付缺少烘焙片段，请使用新制作链重建",
          );
        return {
          sceneId: v.sceneId,
          startFrame: v.startFrame,
          durationFrames: v.durationFrames,
          file: copy(baked, `media/scene-${i}.mp4`),
          mapping: v,
        };
      });
      const audio = [];
      for (const [i, a] of m.audio.entries()) {
        const file = `media/edit-audio-${i}.wav`;
        await renderAudioSegment({
          store: this.store,
          segment: a,
          manifest: m,
          workDir: temp,
          stem: `export-audio-${i}`,
          dest: path.join(temp, file),
        });
        audio.push({
          file,
          mapping: a,
          playback: {
            startFrame: a.startFrame,
            durationFrames: a.durationFrames,
            trimUs: 0,
            sourceDurationUs: Math.round(
              ((a.durationFrames * m.output.fps.den) / m.output.fps.num) * 1e6,
            ),
            speed: 1,
            gainDb: 0,
          },
        });
      }
      const master = d.artifacts.audio
        ? copy(d.artifacts.audio, "media/master.wav")
        : null;
      const handoff = {
        title: snap.projectRevision.document.title,
        timelineDigest: d.timelineDigest,
        manifest: m,
        originals,
        visuals,
        audio,
        master,
        jianyingProfile: JIAN_YING_PROFILE,
      };
      fs.writeFileSync(path.join(temp, "handoff.json"), canonical(handoff));
      fs.writeFileSync(path.join(temp, "captions.srt"), toSrt(m));
      fs.writeFileSync(path.join(temp, "captions.ass"), toAss(m));
      const adapter = parseLastJson(
        (
          await processRun("python3", [
            resourcePath("weaver", "scripts", "interchange.py"),
            input.format,
            temp,
          ])
        ).stdout,
      );
      const notes = [
        "卡片、画面适配和速度/定格已按最终计划烘焙；源媒体和精确映射保存在 handoff.json",
        "主音轨保留最终混音/闪避/响度。独立音轨烘焙裁剪、循环、变速、增益与淡变，默认静音；原始映射保留供重剪。启用前关闭母带",
        "字幕采用相同 cue；编辑软件的字体与特效渲染可能不同，附带规范 SRT/ASS",
        ...(input.format === "otio"
          ? ["OTIO 字幕保存在 metadata 与 SRT/ASS；不宣称所有编辑器等价支持"]
          : [
              `目标剪映 macOS ${JIAN_YING_PROFILE.appVersion}，schema ${JIAN_YING_PROFILE.schemaVersion}，adapter v1；应用打开验收单独记录`,
            ]),
      ];
      fs.writeFileSync(
        path.join(temp, "handoff-report.json"),
        canonical({ adapter, notes, deliveryState: d.state }),
      );
      const walkFiles = (r: string): string[] =>
        fs
          .readdirSync(r, { withFileTypes: true })
          .flatMap((e) =>
            e.isDirectory()
              ? walkFiles(path.join(r, e.name))
              : [path.join(r, e.name)],
          );
      for (const file of walkFiles(temp))
        files.push({
          path: path.relative(temp, file),
          digest: fileBytesDigest(file),
          bytes: fs.statSync(file).size,
        });
      const receipt = PackageReceipt.parse({
        schemaVersion: 2,
        format: input.format,
        timelineDigest: d.timelineDigest,
        createdAt: now(),
        files,
        adapter,
        notes,
      });
      fs.writeFileSync(
        path.join(temp, "export-receipt.json"),
        canonical(receipt),
      );
      fs.renameSync(temp, dest);
      return { destination: dest, receipt };
    } finally {
      fs.rmSync(temp, { recursive: true, force: true });
    }
  }
  async verify(directory: string) {
    const root = fs.realpathSync(directory),
      receipt = PackageReceipt.parse(
        JSON.parse(
          fs.readFileSync(safeRelative(root, "export-receipt.json"), "utf8"),
        ),
      );
    for (const f of receipt.files) {
      const local = safeRelative(root, f.path);
      if (fileBytesDigest(local) !== f.digest)
        throw new WeaverError("INTEGRITY_FAILED", "交接包文件改变", f);
    }
    if (receipt.format === "otio")
      await processRun("python3", [
        "-c",
        "import opentimelineio as o,pathlib,sys; r=pathlib.Path(sys.argv[1]); t=o.adapters.read_from_file(str(r/'timeline.otio')); [(r/c.media_reference.target_url).resolve().is_file() or (_ for _ in ()).throw(ValueError(c.media_reference.target_url)) for c in t.find_clips()]; print(t.duration())",
        root,
      ]);
    if (receipt.format === "jianying") {
      const draft = z
        .object({
          materials: z.record(
            z.string(),
            z.array(z.object({ path: z.string().optional() }).passthrough()),
          ),
        })
        .parse(
          JSON.parse(
            fs.readFileSync(safeRelative(root, "draft_info.json"), "utf8"),
          ),
        );
      for (const material of Object.values(draft.materials).flat())
        if (material.path?.startsWith("##_draftpath_placeholder_"))
          safeRelative(
            root,
            material.path.replace(/^##_draftpath_placeholder_[^#]+_##\//, ""),
          );
    }
    return {
      integrity: true,
      relocatedMediaAvailable: true,
      format: receipt.format,
      files: receipt.files.length,
      applicationOpenVerified: false,
    };
  }
  async installJianying(
    directory: string,
    draftsRoot = path.join(
      os.homedir(),
      "Movies/JianyingPro/User Data/Projects/com.lveditor.draft",
    ),
  ) {
    await this.verify(directory);
    const info = parseLastJson(
      (
        await processRun("python3", [
          "-c",
          "import plistlib,json;d=plistlib.load(open('/Applications/VideoFusion-macOS.app/Contents/Info.plist','rb'));print(json.dumps({'id':d['CFBundleIdentifier'],'version':d['CFBundleShortVersionString']}))",
        ])
      ).stdout,
    );
    const app = z
      .object({
        id: z.literal(JIAN_YING_PROFILE.bundleId),
        version: z.literal(JIAN_YING_PROFILE.appVersion),
      })
      .safeParse(info);
    if (!app.success)
      throw new WeaverError(
        "CAPABILITY_UNAVAILABLE",
        `导出 profile 锁定剪映 macOS ${JIAN_YING_PROFILE.appVersion}，请为其他版本建立并验收 profile`,
        info,
      );
    const root = path.resolve(draftsRoot),
      source = fs.realpathSync(directory),
      meta = z
        .object({
          draft_id: Id,
          draft_name: z.string(),
          tm_duration: z.number(),
        })
        .passthrough()
        .parse(
          JSON.parse(
            fs.readFileSync(path.join(source, "draft_meta_info.json"), "utf8"),
          ),
        );
    const destination = path.join(root, `LightWeaver-${meta.draft_id}`);
    fs.mkdirSync(root, { recursive: true });
    const staging = `${destination}.${newId("partial")}`;
    const index = path.join(root, "root_meta_info.json"),
      temp = `${index}.${newId("partial")}`;
    let installed = false,
      published = false;
    try {
      if (fs.existsSync(destination))
        throw new WeaverError("INVALID_INPUT", "草稿已经安装");
      fs.cpSync(source, staging, {
        recursive: true,
        errorOnExist: true,
        force: false,
      });
      return this.store.transaction(() => {
        const previous = fs.existsSync(index) ? fs.readFileSync(index) : null;
        const existing = previous
          ? z
              .object({
                all_draft_store: z.array(z.record(z.string(), z.unknown())),
                draft_ids: z.number(),
                root_path: z.string(),
              })
              .passthrough()
              .parse(JSON.parse(previous.toString()))
          : { all_draft_store: [], draft_ids: 0, root_path: root };
        const backupPath = previous
          ? path.join(
              root,
              `root_meta_info.lightweaver-${newId("backup")}.json`,
            )
          : null;
        if (previous && backupPath)
          fs.writeFileSync(backupPath, previous, { flag: "wx" });
        const entry = {
          ...meta,
          draft_name: `LightWeaver · ${meta.draft_name}`,
          draft_fold_path: destination,
          draft_json_file: path.join(destination, "draft_info.json"),
          draft_root_path: root,
          draft_type: "",
          draft_is_cloud_temp_draft: false,
          cloud_draft_cover: false,
          cloud_draft_sync: false,
          streaming_edit_draft_ready: true,
          draft_new_version: "",
          tm_draft_create: Date.now() * 1000,
          tm_draft_modified: Date.now() * 1000,
          tm_draft_removed: 0,
        };
        fs.writeFileSync(
          path.join(staging, "draft_meta_info.json"),
          canonical(entry),
        );
        fs.writeFileSync(
          temp,
          canonical({
            ...existing,
            all_draft_store: [entry, ...existing.all_draft_store],
            draft_ids: existing.draft_ids + 1,
          }),
          { flag: "wx" },
        );
        const current = fs.existsSync(index) ? fs.readFileSync(index) : null;
        if (previous ? !current?.equals(previous) : current !== null)
          throw new WeaverError(
            "REVISION_CONFLICT",
            "剪映草稿索引已改变，请关闭剪映后重试",
          );
        fs.renameSync(staging, destination);
        installed = true;
        fs.renameSync(temp, index);
        published = true;
        return {
          destination,
          indexBackup: backupPath,
          application: app.data,
          next: "在剪映首页打开新建的 LightWeaver 草稿；原导出包保持不变",
        };
      });
    } finally {
      fs.rmSync(staging, { recursive: true, force: true });
      fs.rmSync(temp, { force: true });
      if (installed && !published)
        fs.rmSync(destination, { recursive: true, force: true });
    }
  }
}
