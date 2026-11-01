import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import {
  z,
  MediaAssetVersion,
  Digest,
  MediaProvenance,
  MediaRef,
  AssetId,
  ProjectRevision,
  LibraryPayload,
  ProjectDocument,
  WORKFLOWS,
  PROFILES,
  refKey,
} from "../contracts/index.ts";
import { Store, digest, newId, canonical } from "../store/index.ts";
import { Projects } from "../project/service.ts";
import { Library } from "../library/service.ts";
import { WeaverError } from "../contracts/errors.ts";
import { Jobs } from "../jobs/index.ts";
import { Providers, AsrResult, workspaceRoot } from "../adapters/providers.ts";
import {
  currentRuntime,
  cliInvocation,
  installRuntime,
  resourcePath,
  type RuntimeContext,
} from "../runtime.ts";
import { Builds, targetFingerprint } from "./build.ts";
import { Analysis } from "../search/index.ts";
import { Interchange } from "../interchange/index.ts";
import { Migration } from "../migration/index.ts";
import { backup, restore, gc } from "../store/maintenance.ts";
import { inferKind, mimeFor } from "../media/types.ts";
import { importCaptions } from "../timeline/captions.ts";
import { Authoring } from "../authoring/service.ts";
import { CaptionAssistance } from "../captions/assistance.ts";
import { VisualSearch } from "../search/visual.ts";
import { SpeakerAssistance } from "../captions/speakers.ts";
import { Models } from "../models/service.ts";
import { probe } from "../media/probe.ts";
import { exportVideo, type ExportVideoInput } from "./export-video.ts";
export { WeaverError, errorProtocol, httpStatus } from "../contracts/errors.ts";
export {
  RuntimeContext,
  currentRuntime,
  cliInvocation,
  developmentRuntime,
  installRuntime,
  resourcePath,
  resolveConfiguredPath,
} from "../runtime.ts";

export class Application {
  private readonly store: Store;
  readonly projects: Projects;
  readonly library: Library;
  readonly jobs: Jobs;
  readonly models: Models;
  readonly providers: Providers;
  readonly builds: Builds;
  readonly analysis: Analysis;
  readonly interchange: Interchange;
  readonly migration: Migration;
  readonly authoring: Authoring;
  readonly captions: CaptionAssistance;
  readonly visual: VisualSearch;
  readonly speakers: SpeakerAssistance;
  readonly runtime: RuntimeContext;
  constructor(options: { dataDir?: string; runtime?: RuntimeContext } = {}) {
    const base = options.runtime ?? currentRuntime();
    const dataDir = options.dataDir ? path.resolve(options.dataDir) : "";
    this.runtime = installRuntime(
      dataDir && dataDir !== base.dataDir
        ? {
            ...base,
            dataDir,
            modelDir: path.relative(base.dataDir, base.modelDir).startsWith("..") ||
              path.isAbsolute(path.relative(base.dataDir, base.modelDir))
              ? base.modelDir
              : path.join(dataDir, path.relative(base.dataDir, base.modelDir)),
            tempDir: path.join(dataDir, "tmp"),
            logDir: path.join(dataDir, "logs"),
          }
        : base,
    );
    this.store = new Store(this.runtime.dataDir);
    this.projects = new Projects(this.store);
    this.library = new Library(this.store);
    this.jobs = new Jobs(this.store);
    this.models = new Models(this.runtime.configBase, this.jobs);
    this.providers = new Providers(this.store);
    this.builds = new Builds(
      this.store,
      this.projects,
      this.jobs,
      this.providers,
    );
    this.analysis = new Analysis(
      this.store,
      this.projects,
      this.jobs,
      this.providers,
    );
    this.interchange = new Interchange(this.store, this.projects, this.builds);
    this.migration = new Migration(this.store, this.projects, this.library);
    this.authoring = new Authoring(this.store, this.projects);
    this.captions = new CaptionAssistance(this.store, this.projects, this.jobs, this.providers);
    this.visual = new VisualSearch(this.store, this.projects, this.jobs, this.providers.visual);
    this.speakers = new SpeakerAssistance(this.store, this.projects, this.jobs, this.providers.speakers);
  }
  close(): void {
    this.store.close();
  }
  exportVideo(input: Omit<ExportVideoInput, "store" | "builds">) {
    return exportVideo({ ...input, store: this.store, builds: this.builds });
  }
  capabilities() {
    return {
      schemaVersion: 2,
      runtime: {
        mode: this.runtime.mode,
        dataDir: this.runtime.dataDir,
        configFile: this.runtime.configFile,
        configBase: this.runtime.configBase,
        resourcesDir: this.runtime.resourcesDir,
        cli: cliInvocation(this.runtime),
      },
      agentSkills: fs.readdirSync(resourcePath(".agents", "skills"), { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && fs.existsSync(resourcePath(".agents", "skills", entry.name, "SKILL.md")))
        .map((entry) => ({ name: entry.name, file: resourcePath(".agents", "skills", entry.name, "SKILL.md") })),
      workflows: WORKFLOWS,
      profiles: Object.values(PROFILES),
      defaultVlm: this.providers.selectedVlm(),
      builtinPackageVersion: digest(
        JSON.parse(
          fs.readFileSync(
            resourcePath("library", "assets.json"),
            "utf8",
          ),
        ),
      ),
      providers: this.providers.descriptors(),
    };
  }
  async addAsset(input: {
    projectId: string;
    expectedRevision: string;
    requestId: string;
    file: string;
    assetId?: string;
    kind?: z.infer<typeof MediaAssetVersion>["kind"];
    mime?: string;
    name?: string;
    provenance?: z.infer<typeof MediaProvenance>;
  }): Promise<{
    asset: z.infer<typeof MediaAssetVersion>;
    revision: z.infer<typeof ProjectRevision>;
  }> {
    const name = input.name || path.basename(input.file),
      kind = input.kind || inferKind(name),
      mime = input.mime || mimeFor(name);
    const result = await this.store.owned("asset-import", async () => {
      const content = await this.store.importFile(input.file, mime);
      const requestInput = { ...input, file: undefined, content };
      const resultSchema = z.object({
        asset: MediaAssetVersion,
        revision: ProjectRevision,
      });
      const preflight = this.store.transaction(():
        | { kind: "replay"; result: z.infer<typeof resultSchema> }
        | { kind: "import"; current: z.infer<typeof ProjectRevision> } => {
        const prior = this.store.request(
          "asset-add",
          input.requestId,
          requestInput,
          resultSchema,
        );
        if (prior) return { kind: "replay", result: prior };
        const current = this.projects.read(input.projectId);
        if (current.id !== input.expectedRevision)
          throw new WeaverError("REVISION_CONFLICT", "项目已修改", { current });
        return { kind: "import", current };
      });
      if (preflight.kind === "replay") return preflight.result;
      const provenance = MediaProvenance.optional().parse(input.provenance);
      if (provenance) {
        const assets = new Map(this.projects.assetsFor(preflight.current.document, "saved").map((asset) => [refKey(asset), asset]));
        for (const origin of provenance.inputs) {
          const source = assets.get(refKey(origin.source));
          if (!source) throw new WeaverError("INVALID_INPUT", "来源必须是当前项目中的精确素材版本", origin.source);
          if (origin.range) {
            if (source.kind !== "audio" && source.kind !== "video")
              throw new WeaverError("INVALID_INPUT", "只有音视频来源可指定时间窗", origin.source);
            const fact = await probe(this.store.blobPath(source.digest));
            if (origin.range.startUs + origin.range.durationUs > fact.durationUs)
              throw new WeaverError("INVALID_INPUT", "来源时间窗超出素材范围", origin);
          }
        }
      }
      return this.store.mutate(
        "asset-add",
        input.requestId,
        requestInput,
        resultSchema,
        () => {
          const current = this.projects.read(input.projectId);
          if (current.id !== input.expectedRevision)
            throw new WeaverError("REVISION_CONFLICT", "项目已修改", {
              current,
            });
          const assetId = AssetId.parse(input.assetId || newId("asset"));
          const base = {
            assetId,
            digest: content,
            kind,
            name,
            mime,
            bytes: fs.statSync(this.store.blobPath(content)).size,
            ...(provenance ? { provenance } : {}),
          };
          const asset = MediaAssetVersion.parse({
            ...base,
            version: digest(base),
          });
          this.store.db
            .prepare("INSERT OR IGNORE INTO assets VALUES(?,?,?)")
            .run(assetId, asset.version, canonical(asset));
          this.store.pin(`asset:${assetId}@${asset.version}`, asset);
          const document = ProjectDocument.parse({
            ...current.document,
            assets: [
              ...current.document.assets.filter((a) => a.assetId !== assetId),
              { assetId, version: asset.version },
            ],
          });
          const revision = this.projects.update({
            projectId: input.projectId,
            expectedRevision: input.expectedRevision,
            requestId: input.requestId,
            document,
          });
          return { asset, revision };
        },
      );
    });
    if (
      result.asset.name !== name ||
      result.asset.kind !== kind ||
      result.asset.mime !== mime
    )
      throw new WeaverError(
        "REQUEST_ID_REUSED",
        "同一 requestId 对应不同素材元数据",
        { requestId: input.requestId },
      );
    return result;
  }
  async adoptMaterial(input: {
    projectId: string;
    expectedRevision: string;
    requestId: string;
    itemId: string;
    version: string;
  }) {
    const v = this.library.read(input.itemId, input.version);
    if (v.payload.kind !== "material")
      throw new WeaverError("INVALID_INPUT", "只能采用素材库条目");
    const mime = v.payload.mime,
      kind = mime.startsWith("image/")
        ? "image"
        : mime.startsWith("video/")
          ? "video"
          : mime.startsWith("audio/")
            ? "audio"
            : "document";
    return this.addAsset({
      ...input,
      file: this.store.blobPath(v.payload.digest),
      name: v.payload.name,
      kind,
      mime,
    });
  }
  async transcribeVoice(input: {
    voiceId: string;
    voiceVersion: string;
    requestId: string;
  }) {
    const v = this.library.read(input.voiceId, input.voiceVersion);
    if (v.payload.kind !== "voice")
      throw new WeaverError("INVALID_INPUT", "需要音色版本");
    return this.analysis.standalone({
      kind: "asr",
      file: this.store.blobPath(v.payload.reference),
      requestId: input.requestId,
    });
  }
  async importLibrary(input: {
    itemId?: string;
    expectedVersion: string | null;
    requestId: string;
    payload: unknown;
    file?: string;
    fileName?: string;
  }) {
    return this.store.owned("library-import", async () => {
      let payload = input.payload;
      if (input.file) {
        const d = await this.store.importFile(
          input.file,
          mimeFor(input.fileName || input.file),
        );
        const base = z
          .object({
            kind: z.enum(["voice", "material"]),
            name: z.string(),
            referenceText: z.string().optional(),
            style: z.string().optional(),
            provider: z.string().optional(),
          })
          .parse(payload);
        payload =
          base.kind === "voice"
            ? { ...base, provider: base.provider || "modelbest-voxcpm2", reference: d }
            : {
                kind: "material",
                name: base.name,
                digest: d,
                mime: mimeFor(input.fileName || input.file),
              };
      }
      return this.library.publish({
        itemId: input.itemId,
        expectedVersion: input.expectedVersion,
        requestId: input.requestId,
        payload: LibraryPayload.parse(payload),
      });
    });
  }
  agentBrief(projectId: string): string {
    const p = this.projects.read(projectId);
    const cli = cliInvocation(this.runtime);
    return [
      `LightWeaver 项目 ${p.projectId}`,
      `当前已保存版本 ${p.id}；工作流 ${p.document.workflow}`,
      `目标 ${p.document.locales.join(",")} / ${p.document.profiles.map((profile) => profile.id).join(",")}`,
      `绑定版本 ${JSON.stringify(this.projects.libraryFor(p.document, "saved").map((version) => ({ itemId: version.itemId, version: version.version, name: version.payload.name })))}`,
      `以下命令用于 ${cli.shell}，已绑定当前数据目录和配置。请从已保存项目开始；Studio 中未保存的修改不包含在此交接中。`,
      `${cli.command} capabilities --json`,
      `${cli.command} project context ${p.projectId} --json`,
      `${cli.command} schema creative-plan --json`,
      `${cli.command} doctor --json`,
      `修改前重新读取当前版本，使用 --expected-revision 和独立 --request-id。发生冲突先核对内容，不自动替换版本重试。`,
      `方案先用 creative-plan import 保存供审核，再由 creative-plan apply 显式采用；也可用 project apply 提交已确认的场景编辑。`,
      `检查制作计划：${cli.command} build --project ${p.projectId} --plan --json`,
      `制作：${cli.command} build --project ${p.projectId} --wait --json`,
      `源片字幕可 analyze --align 后 captions from-analysis。外部作者负责剧情、选段和旁白。`,
      `技能入口：${resourcePath(".agents", "skills", "lightweaver-film", "SKILL.md")}`,
    ].join("\n");
  }
  mediaFile(value: string): { file: string; mime: string; bytes: number } {
    const row = z
      .object({ mime: z.string(), bytes: z.number() })
      .parse(
        this.store.db
          .prepare(
            "SELECT mime,bytes FROM blobs WHERE digest=? AND EXISTS(SELECT 1 FROM blob_refs r WHERE r.digest=blobs.digest)",
          )
          .get(value),
      );
    return { file: this.store.blobPath(value), ...row };
  }
  async projectContext(id: string) {
    const revision = this.projects.read(id);
    return {
      revision,
      assets: this.projects.assetsFor(revision.document, "saved"),
      library: this.projects.libraryFor(revision.document, "saved"),
      analysis: this.analysis.list(id),
      proposals: this.analysis.proposals(id),
      runs: this.jobs.list(id),
      deliveries: await this.builds.deliveries(id, revision.document),
    };
  }
  parseCaptions(
    body: string,
    locale: string,
    fps: { num: number; den: number },
    source?: z.infer<typeof MediaRef>,
  ) {
    return importCaptions(body, locale, fps, source);
  }
  readArtifactJson(value: string) {
    const key = Digest.parse(value);
    const media = this.mediaFile(key);
    if (media.mime !== "application/json")
      throw new WeaverError("INVALID_INPUT", "此文件不是 JSON 产物", { digest: key });
    if (!this.store.verifyBlob(key))
      throw new WeaverError("INTEGRITY_FAILED", "JSON 产物摘要校验失败", { digest: key });
    return this.store.jsonBlob(key, z.unknown());
  }
  previewEdit(id: string, raw: unknown) {
    const before = this.projects.read(id).document,
      after = ProjectDocument.parse(raw);
    return {
      affectedTargets: [
        ...new Set([...before.locales, ...after.locales]),
      ].flatMap((locale) =>
        [...new Set([...before.profiles, ...after.profiles].map((p) => p.id))]
          .filter((id) => {
            const from = before.profiles.find((p) => p.id === id),
              to = after.profiles.find((p) => p.id === id);
            return (
              !from ||
              !to ||
              before.locales.includes(locale) !==
                after.locales.includes(locale) ||
              targetFingerprint(before, locale, from) !==
                targetFingerprint(after, locale, to)
            );
          })
          .map((id) => `${locale}/${id}`),
      ),
      note: "语音和分析按各自实际依赖复用；交付集合按最终计划更新",
    };
  }
  async saveRunOutput(runId: string, destination: string) {
    const run = this.jobs.read(runId);
    if (run.state !== "succeeded")
      throw new WeaverError("INVALID_INPUT", "作业尚未成功");
    if (run.kind === "asr") {
      const result = AsrResult.parse(this.jobs.nodes(runId)[0]?.result),
        body = canonical(result),
        dest = path.resolve(destination);
      await fsp.mkdir(path.dirname(dest), { recursive: true });
      await fsp.writeFile(dest, body, { flag: "wx" });
      return { file: dest, digest: digest(result) };
    }
    const result = z
      .object({ digest: z.string() })
      .parse(this.jobs.nodes(runId)[0]?.result);
    const media = this.mediaFile(result.digest),
      dest = path.resolve(destination);
    await fsp.mkdir(path.dirname(dest), { recursive: true });
    await fsp.copyFile(media.file, dest, fs.constants.COPYFILE_EXCL);
    return { file: dest, digest: result.digest };
  }
  importBuiltins(input: { expectedPackageVersion: string; requestId: string }) {
    const root = workspaceRoot(),
      catalog = JSON.parse(
        fs.readFileSync(path.join(root, "library/assets.json"), "utf8"),
      ),
      version = digest(catalog);
    if (version !== input.expectedPackageVersion)
      throw new WeaverError("REVISION_CONFLICT", "内置包版本已改变", {
        currentVersion: version,
      });
    return this.migration.execute(root, input.requestId, {
      libraryOnly: true,
      packageVersion: version,
    });
  }
  backup(destination?: string) {
    return backup(this.store, destination);
  }
  restore(source: string, destination: string) {
    return restore(source, destination);
  }
  gc(apply = false) {
    return gc(this.store, apply);
  }
  acceptVoice(input: {
    runId: string;
    name: string;
    requestId: string;
    itemId?: string;
    expectedVersion: string | null;
  }) {
    const run = this.jobs.read(input.runId);
    if (run.state !== "succeeded")
      throw new WeaverError("INVALID_INPUT", "试听作业尚未成功");
    const result = z
      .object({
        digest: z.string(),
        text: z.string(),
        style: z.string(),
        provider: z.string(),
      })
      .parse(this.jobs.nodes(input.runId)[0]?.result);
    return this.library.publish({
      itemId: input.itemId,
      expectedVersion: input.expectedVersion,
      requestId: input.requestId,
      payload: {
        kind: "voice",
        name: input.name,
        provider: result.provider,
        reference: result.digest,
        referenceText: result.text,
        style: result.style,
      },
    });
  }
}
