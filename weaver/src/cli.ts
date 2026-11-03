import path from "node:path";
import { Application } from "./app/index.ts";
import {
  cliInvocation,
  currentRuntime,
  type RuntimeContext,
} from "./runtime.ts";
import {
  z,
  CaptionTrack,
  CreativePlan,
  EditOperation,
  ErrorProtocol,
  LibraryPayload,
  MediaAssetVersion,
  MediaProvenance,
  MediaRef,
  ModelSettingsPatch,
  ModelInstallInput,
  ModelInstallPlan,
  OutputProfile,
  ProjectDocument,
  ProjectRevision,
  Proposal,
  RunRecord,
  Scene,
  SourceRange,
  Speech,
  TimelineManifest,
} from "./contracts/index.ts";
import {
  WeaverError,
  errorProtocol,
  exitCode,
} from "./contracts/errors.ts";
import { newId } from "./store/index.ts";
import { importCaptions } from "./timeline/captions.ts";
import {
  booleanOption,
  parseArgs,
  resolveInvocation,
  textOption,
  validateCommandInvocation,
  type ParsedArgs,
} from "./cli/args.ts";
import {
  commandKey,
  rootHelp,
  scopeHelp,
} from "./cli/commands.ts";
import {
  nextActions,
  renderHelpHuman,
  renderHumanError,
  renderHumanSuccess,
  shellArg,
  terminalHint,
} from "./cli/human.ts";
import { readJsonFile, readTextFile } from "./cli/io.ts";
import { waitForRun } from "./cli/progress.ts";

function option(parsed: ParsedArgs, name: string): string | undefined {
  return textOption(parsed, name);
}

function required(parsed: ParsedArgs, name: string): string {
  const value = option(parsed, name);
  if (!value)
    throw new WeaverError(
      "INVALID_INPUT",
      `缺少必填参数: --${name}`,
      { flag: name },
      [`运行 weaver ${parsed.words[0] || ""} --help 查看用法`],
    );
  return value;
}

function csv(parsed: ParsedArgs, name: string): string[] | undefined {
  const value = option(parsed, name);
  return value?.split(",").filter(Boolean);
}

function numberOption(
  parsed: ParsedArgs,
  name: string,
): number | undefined {
  const value = option(parsed, name);
  if (value === undefined) return undefined;
  const number = Number(value);
  if (!Number.isFinite(number))
    throw new WeaverError(
      "INVALID_INPUT",
      `--${name} 必须是有限数字`,
      { flag: name, value },
    );
  return number;
}

function jsonFile(parsed: ParsedArgs, name: string): unknown {
  return readJsonFile(required(parsed, name), `--${name}`);
}

function cliRuntime(parsed: ParsedArgs): RuntimeContext {
  const runtime = currentRuntime(),
    configFile = option(parsed, "config-file"),
    configBase = option(parsed, "config-base");
  if (!configFile && !configBase) return runtime;
  const file = configFile ? path.resolve(configFile) : runtime.configFile;
  return {
    ...runtime,
    configFile: file,
    configBase: configBase ? path.resolve(configBase) : path.dirname(file),
  };
}

function progressEnabled(parsed: ParsedArgs): boolean {
  const explicit = parsed.options.progress;
  if (explicit === false) return false;
  if (explicit === true) return true;
  return !!process.stderr.isTTY;
}

function writeJsonSuccess(result: unknown, requestId: string, compact: boolean): void {
  process.stdout.write(JSON.stringify({ ok: true, result, requestId }, null, compact ? 0 : 2) + "\n");
}

function publishedProjectId(details: unknown): string | undefined {
  if (!details || typeof details !== "object" || Array.isArray(details))
    return undefined;
  if ("projectId" in details && typeof details.projectId === "string")
    return details.projectId;
  if ("current" in details) {
    const revision = ProjectRevision.safeParse(details.current);
    if (revision.success) return revision.data.projectId;
  }
  return undefined;
}

function currentRevision(details: unknown): z.infer<typeof ProjectRevision> | undefined {
  if (!details || typeof details !== "object" || Array.isArray(details))
    return undefined;
  const direct = ProjectRevision.safeParse(details);
  if (direct.success) return direct.data;
  if ("current" in details) {
    const nested = ProjectRevision.safeParse(details.current);
    if (nested.success) return nested.data;
  }
  return undefined;
}

function missingExpectedRevision(details: unknown): boolean {
  const parsed = z
    .object({ missing: z.array(z.string()) })
    .safeParse(details);
  return (
    parsed.success &&
    parsed.data.missing.includes("--expected-revision")
  );
}

function enrichRevisionError(
  error: unknown,
  app: Application | undefined,
  parsed: ParsedArgs,
  runtime: RuntimeContext | undefined,
): z.infer<typeof ErrorProtocol> {
  const protocol = errorProtocol(error);
  if (
    !app ||
    !runtime ||
    !["REVISION_CONFLICT", "INVALID_INPUT"].includes(protocol.code)
  )
    return protocol;
  const projectId =
    option(parsed, "project") ||
    publishedProjectId(protocol.details);
  if (!projectId) return protocol;
  let revision = currentRevision(protocol.details);
  if (!revision && missingExpectedRevision(protocol.details)) {
    try {
      revision = app.projects.read(projectId);
    } catch {
      return protocol;
    }
  }
  if (!revision) return protocol;
  const base = cliInvocation(runtime).command,
    additions = [
      `当前 head: ${revision.id}`,
      `查看: ${base} project show ${shellArg(revision.projectId)} --revision ${shellArg(revision.id)} --json`,
      `核对后显式传入 --expected-revision ${revision.id}；CLI 不会自动采用最新版本，也不会自动重试 CAS 写入`,
    ];
  return ErrorProtocol.parse({
    ...protocol,
    hints: [...new Set([...protocol.hints, ...additions])],
  });
}

async function main(): Promise<void> {
  let application: Application | undefined,
    runtime: RuntimeContext | undefined,
    parsed = parseArgs([]),
    requestId = newId("request"),
    humanRequested = false,
    compact = false;
  try {
    parsed = parseArgs(process.argv.slice(2));
    requestId = option(parsed, "request-id") || newId("request");
    humanRequested = booleanOption(parsed, "human");
    compact = booleanOption(parsed, "json");
    const invocation = resolveInvocation(parsed);
    if (invocation.kind === "help") {
      const help = invocation.scope.length
        ? scopeHelp(invocation.scope)
        : rootHelp();
      if (!help)
        throw new WeaverError(
          "INVALID_INPUT",
          `未知帮助作用域 ${invocation.scope.join(" ")}`,
          null,
          ["运行 weaver --help 查看命令分组"],
        );
      if (humanRequested) process.stdout.write(renderHelpHuman(help));
      else writeJsonSuccess(help, requestId, compact);
      if (process.stderr.isTTY && !humanRequested)
        process.stderr.write(`${terminalHint([])}\n`);
      return;
    }

    runtime = cliRuntime(parsed);
    const app = new Application({
      runtime,
      dataDir: option(parsed, "data-dir") || undefined,
    });
    application = app;
    runtime = app.runtime;
    validateCommandInvocation(invocation);

    const wait = (runId: string) =>
      waitForRun({
        app,
        runId,
        progress: progressEnabled(parsed),
      });
    let result: unknown;
    let jsonlOutput = false;
    const [command, action, arg] = parsed.words;
    if (command === "capabilities") result = app.capabilities();
    else if (command === "events") {
      const events = app.jobs.events(
        action || "",
        numberOption(parsed, "after") || 0,
      );
      if (humanRequested) result = events;
      else {
        jsonlOutput = true;
        result = events;
        for (const event of events)
          process.stdout.write(JSON.stringify(event) + "\n");
      }
    } else if (command === "doctor")
      result = {
        ...(await app.providers.doctor()),
        engines: app.engines.summary(),
      };
    else if (command === "models") {
      if (action === "settings") {
        if (arg === "get") result = app.models.settings();
        else if (arg === "set")
          result = app.models.save({ payload: jsonFile(parsed, "file"), requestId });
        else
          throw new WeaverError(
            "INVALID_INPUT",
            "未知 models settings 操作",
          );
      } else if (action === "list") result = app.models.view();
      else if (action === "download" || action === "install") {
        const modelId = parsed.words[2];
        if (!modelId)
          throw new WeaverError("INVALID_INPUT", "缺少 model-id");
        const download = {
          id: modelId,
          root:
            option(parsed, "root") ||
            app.models.settings().downloadRoot.value,
          requestId,
        };
        const run = action === "install"
          ? app.engines.installModel({ ...download, expectedRevision: required(parsed, "expected-revision") })
          : app.models.download(download);
        result = booleanOption(parsed, "wait")
          ? { run: await wait(run.id), nodes: app.jobs.nodes(run.id) }
          : run;
      } else if (action === "verify") {
        const modelId = parsed.words[2];
        if (!modelId)
          throw new WeaverError("INVALID_INPUT", "缺少 model-id");
        result = await app.models.verify(
          modelId,
          option(parsed, "root") ||
            app.models.settings().downloadRoot.value,
        );
      } else if (action === "use") {
        const modelId = parsed.words[2];
        if (!modelId)
          throw new WeaverError("INVALID_INPUT", "缺少 model-id");
        result = app.models.adopt({
          id: modelId,
          directory: required(parsed, "path"),
          expectedRevision: required(parsed, "expected-revision"),
          requestId,
        });
      } else if (action === "use-provider") {
        const providerId = parsed.words[2];
        if (!providerId)
          throw new WeaverError("INVALID_INPUT", "缺少 provider-id");
        result = app.models.adoptProvider({
          id: providerId,
          expectedRevision: required(parsed, "expected-revision"),
          requestId,
        });
      } else
        throw new WeaverError("INVALID_INPUT", "未知 models 操作");
    } else if (command === "engines") {
      const engineId = parsed.words[2];
      const engineRoot = () =>
        option(parsed, "root") || app.engines.installRoot().value;
      if (action === "setup") {
        const run = app.engines.setup({
          root: option(parsed, "root"),
          expectedRevision: required(parsed, "expected-revision"),
          requestId,
          includeSpeech: booleanOption(parsed, "with-speech"),
          includeModels: booleanOption(parsed, "with-models"),
        });
        result = booleanOption(parsed, "wait")
          ? { run: await wait(run.id), nodes: app.jobs.nodes(run.id) }
          : run;
      } else if (action === "list") result = app.engines.view(option(parsed, "root"));
      else if (action === "install") {
        if (!engineId)
          throw new WeaverError("INVALID_INPUT", "缺少 engine-id");
        const run = app.engines.install({
          id: engineId,
          root: engineRoot(),
          requestId,
        });
        result = booleanOption(parsed, "wait")
          ? { run: await wait(run.id), nodes: app.jobs.nodes(run.id) }
          : run;
      } else if (action === "verify") {
        if (!engineId)
          throw new WeaverError("INVALID_INPUT", "缺少 engine-id");
        result = await app.engines.verify(engineId, engineRoot());
      } else
        throw new WeaverError("INVALID_INPUT", "未知 engines 操作");
    } else if (command === "schema") {
      const schemas = {
        project: ProjectDocument,
        revision: ProjectRevision,
        scene: Scene,
        speech: Speech,
        profile: OutputProfile,
        captions: CaptionTrack,
        "creative-plan": CreativePlan,
        library: LibraryPayload,
        "media-provenance": MediaProvenance,
        "media-asset": MediaAssetVersion,
        ops: z.array(EditOperation),
        proposal: Proposal,
        timeline: TimelineManifest,
        "model-settings": ModelSettingsPatch,
        "model-install": ModelInstallInput,
        "model-install-plan": ModelInstallPlan,
        error: ErrorProtocol,
      };
      const schema = Object.entries(schemas).find(
        ([key]) => key === (action || "project"),
      )?.[1];
      if (!schema) throw new WeaverError("INVALID_INPUT", "未知 schema");
      result = z.toJSONSchema(schema, { io: "input" });
    } else if (command === "project") {
      const projectId = option(parsed, "project") || arg;
      if (action === "create")
        result = app.projects.create({
          id: arg,
          title: option(parsed, "title") || arg || "未命名项目",
          workflow: option(parsed, "workflow") || "study-explainer",
          template: booleanOption(parsed, "sample")
            ? "starter"
            : undefined,
          requestId,
        });
      else if (action === "list") result = app.projects.list();
      else if (action === "show")
        result = app.projects.read(
          projectId || "",
          option(parsed, "revision"),
        );
      else if (action === "apply")
        result = app.projects.apply({
          projectId: required(parsed, "project"),
          expectedRevision: required(parsed, "expected-revision"),
          requestId,
          ops: jsonFile(parsed, "ops"),
        });
      else if (action === "import")
        result = app.projects.update({
          projectId: required(parsed, "project"),
          expectedRevision: required(parsed, "expected-revision"),
          requestId,
          document: jsonFile(parsed, "file"),
        });
      else if (action === "brief")
        result = app.agentBrief(projectId || "");
      else if (action === "context")
        result = await app.projectContext(projectId || "");
      else throw new WeaverError("INVALID_INPUT", "未知 project 操作");
    } else if (command === "scene" && action === "add")
      result = app.projects.addScene({
        projectId: required(parsed, "project"),
        expectedRevision: required(parsed, "expected-revision"),
        requestId,
        kind: required(parsed, "kind"),
        duration: required(parsed, "duration"),
        locale: option(parsed, "locale"),
        label: option(parsed, "label"),
        headline: option(parsed, "headline"),
        body: option(parsed, "body"),
        source: option(parsed, "source"),
        start: option(parsed, "start"),
        sceneId: option(parsed, "scene-id"),
      });
    else if (command === "asset" && action === "add")
      result = await app.addAsset({
        projectId: required(parsed, "project"),
        expectedRevision: required(parsed, "expected-revision"),
        requestId,
        file: required(parsed, "file"),
        assetId: option(parsed, "asset-id"),
        name: option(parsed, "name"),
        provenance: option(parsed, "provenance")
          ? MediaProvenance.parse(jsonFile(parsed, "provenance"))
          : undefined,
      });
    else if (command === "asset" && action === "adopt")
      result = await app.adoptMaterial({
        projectId: required(parsed, "project"),
        expectedRevision: required(parsed, "expected-revision"),
        requestId,
        itemId: required(parsed, "item"),
        version: required(parsed, "version"),
      });
    else if (command === "library") {
      const id = option(parsed, "id") || arg;
      if (action === "import-builtin")
        result = await app.importBuiltins({
          expectedPackageVersion: required(parsed, "package-version"),
          requestId,
        });
      else if (action === "list") result = app.library.list();
      else if (action === "show")
        result = app.library.read(
          id || "",
          option(parsed, "version"),
        );
      else if (action === "set")
        result = await app.importLibrary({
          itemId: id,
          expectedVersion: option(parsed, "expected-version") || null,
          requestId,
          payload: jsonFile(parsed, "file"),
          file: option(parsed, "media"),
        });
      else if (action === "delete")
        result = app.library.remove({
          itemId: required(parsed, "id"),
          expectedVersion: required(parsed, "expected-version"),
          requestId,
        });
      else throw new WeaverError("INVALID_INPUT", "未知 library 操作");
    } else if (command === "captions" && action === "import") {
      const projectId = required(parsed, "project"),
        project = app.projects.read(projectId),
        track = importCaptions(
          readTextFile(required(parsed, "file"), "--file"),
          required(parsed, "locale"),
          project.document.profiles[0]?.fps || { num: 30, den: 1 },
          option(parsed, "source-id")
            ? MediaRef.parse({
                assetId: required(parsed, "source-id"),
                version: required(parsed, "source-version"),
              })
            : undefined,
        );
      result = app.projects.apply({
        projectId,
        expectedRevision: required(parsed, "expected-revision"),
        requestId,
        ops: [
          {
            op: "captions",
            value: [
              ...project.document.captions.filter(
                (caption) => caption.locale !== track.locale,
              ),
              track,
            ],
          },
        ],
      });
    } else if (command === "captions" && action === "from-analysis") {
      result = app.analysis.adoptCaptions({
        projectId: required(parsed, "project"),
        locale: required(parsed, "locale"),
        sourceId: option(parsed, "source-id"),
        runId: option(parsed, "run"),
        expectedRevision: required(parsed, "expected-revision"),
        requestId,
      });
    } else if (command === "captions" && action === "translate") {
      const run = await app.captions.submit({
        projectId: required(parsed, "project"),
        locale: required(parsed, "locale"),
        targetLocale: required(parsed, "target-locale"),
        expectedRevision: required(parsed, "expected-revision"),
        requestId,
      });
      result = booleanOption(parsed, "wait")
        ? { run: await wait(run.id), nodes: app.jobs.nodes(run.id) }
        : run;
    } else if (command === "captions" && action === "apply-translation")
      result = app.captions.apply({
        projectId: required(parsed, "project"),
        runId: required(parsed, "run"),
        expectedRevision: required(parsed, "expected-revision"),
        requestId,
      });
    else if (command === "creative-plan") {
      if (action === "import")
        result = app.authoring.save({
          projectId: required(parsed, "project"),
          expectedRevision: required(parsed, "expected-revision"),
          requestId,
          plan: jsonFile(parsed, "file"),
        });
      else if (action === "apply")
        result = app.authoring.apply({
          projectId: required(parsed, "project"),
          expectedRevision: required(parsed, "expected-revision"),
          requestId,
          append: booleanOption(parsed, "append"),
        });
      else if (action === "show")
        result =
          app.projects.read(required(parsed, "project")).document
            .creativePlan ?? null;
      else
        throw new WeaverError("INVALID_INPUT", "未知 creative-plan 操作");
    } else if (command === "speakers") {
      if (action === "analyze") {
        const run = await app.speakers.submit({
          projectId: required(parsed, "project"),
          sourceId: required(parsed, "source-id"),
          locale: required(parsed, "locale"),
          requestId,
          fromUs: numberOption(parsed, "from-us"),
          durationUs: numberOption(parsed, "duration-us"),
        });
        result = booleanOption(parsed, "wait")
          ? { run: await wait(run.id), nodes: app.jobs.nodes(run.id) }
          : run;
      } else if (action === "apply")
        result = app.speakers.apply({
          projectId: required(parsed, "project"),
          runId: required(parsed, "run"),
          expectedRevision: required(parsed, "expected-revision"),
          requestId,
        });
      else throw new WeaverError("INVALID_INPUT", "未知 speakers 操作");
    } else if (command === "build") {
      const input = {
        projectId: required(parsed, "project"),
        expectedRevision: option(parsed, "expected-revision"),
        locales: csv(parsed, "locales"),
        profiles: csv(parsed, "profiles"),
        regenerate: booleanOption(parsed, "regenerate"),
        requestId,
      };
      if (booleanOption(parsed, "plan")) {
        const { nodes, snapshot, ...plan } =
          await app.builds.plan(input);
        result = {
          ...plan,
          revision: snapshot.projectRevision.id,
        };
      } else {
        const run = await app.builds.submit({
          ...input,
          expectedRevision: required(parsed, "expected-revision"),
        });
        result = booleanOption(parsed, "wait")
          ? {
              run: await wait(run.id),
              nodes: app.jobs.nodes(run.id),
              deliveries: await app.builds.deliveries(input.projectId),
            }
          : run;
      }
    } else if (command === "run") {
      if (action === "list")
        result = app.jobs.list(option(parsed, "project"));
      else if (action === "status")
        result = {
          run: app.jobs.read(arg || ""),
          nodes: app.jobs.nodes(arg || ""),
        };
      else if (action === "cancel")
        result = app.jobs.cancel(arg || "");
      else if (action === "resume") {
        const run = app.jobs.resume(arg || "");
        result = booleanOption(parsed, "wait")
          ? { run: await wait(run.id), nodes: app.jobs.nodes(run.id) }
          : run;
      } else if (action === "events")
        result = app.jobs.events(
          arg || "",
          numberOption(parsed, "after") || 0,
        );
      else throw new WeaverError("INVALID_INPUT", "未知 run 操作");
    } else if (
      command === "analyze" ||
      command === "describe" ||
      command === "transcribe"
    ) {
      const run = option(parsed, "import")
        ? app.analysis.importEvidence({
            projectId: required(parsed, "project"),
            expectedRevision: required(parsed, "expected-revision"),
            requestId,
            entries: jsonFile(parsed, "import"),
          })
        : await app.analysis.submit({
            projectId: required(parsed, "project"),
            kinds:
              command === "describe"
                ? ["describe"]
                : command === "transcribe"
                  ? ["asr"]
                  : csv(parsed, "with") || ["asr"],
            requestId,
            sourceId: option(parsed, "source-id"),
            vlmProvider: option(parsed, "provider"),
            locale: option(parsed, "locale"),
            fromUs: numberOption(parsed, "from-us"),
            durationUs: numberOption(parsed, "duration-us"),
            regenerate: booleanOption(parsed, "regenerate"),
            align: booleanOption(parsed, "align"),
          });
      result = booleanOption(parsed, "wait")
        ? { run: await wait(run.id), nodes: app.jobs.nodes(run.id) }
        : run;
    } else if (command === "capture") {
      const run = app.analysis.capture({
        projectId: option(parsed, "project"),
        url: required(parsed, "url"),
        width: numberOption(parsed, "width") ?? 1440,
        height: numberOption(parsed, "height") ?? 1100,
        selector: option(parsed, "selector"),
        requestId,
      });
      result = booleanOption(parsed, "wait")
        ? { run: await wait(run.id), nodes: app.jobs.nodes(run.id) }
        : run;
      if (booleanOption(parsed, "wait") && option(parsed, "dest"))
        await app.saveRunOutput(run.id, required(parsed, "dest"));
    } else if (command === "search") {
      if (
        booleanOption(parsed, "rerank") &&
        option(parsed, "mode") !== "semantic"
      )
        throw new WeaverError(
          "INVALID_INPUT",
          "候选重排只适用于语义检索",
        );
      if (option(parsed, "mode") === "visual") {
        const run = await app.visual.submit({
          projectId: required(parsed, "project"),
          query: required(parsed, "query"),
          requestId,
          sourceIds: csv(parsed, "sources"),
          fromUs: numberOption(parsed, "from-us"),
          toUs: numberOption(parsed, "to-us"),
        });
        result = booleanOption(parsed, "wait")
          ? { run: await wait(run.id), nodes: app.jobs.nodes(run.id) }
          : run;
      } else if (option(parsed, "mode") === "semantic") {
        const run = await app.analysis.submitSemantic({
          projectId: required(parsed, "project"),
          query: required(parsed, "query"),
          requestId,
          rerank: booleanOption(parsed, "rerank"),
          sourceIds: csv(parsed, "sources"),
          fromUs: numberOption(parsed, "from-us"),
          toUs: numberOption(parsed, "to-us"),
        });
        result = booleanOption(parsed, "wait")
          ? { run: await wait(run.id), nodes: app.jobs.nodes(run.id) }
          : run;
      } else
        result = app.analysis.search({
          projectId: required(parsed, "project"),
          query: required(parsed, "query"),
          requestId,
          sourceIds: csv(parsed, "sources"),
          fromUs: numberOption(parsed, "from-us"),
          toUs: numberOption(parsed, "to-us"),
        });
    } else if (command === "match") {
      const run = app.analysis.submitMatch({
        projectId: required(parsed, "project"),
        editedId: required(parsed, "edited"),
        sourceIds: csv(parsed, "sources"),
        requestId,
      });
      result = booleanOption(parsed, "wait")
        ? { run: await wait(run.id), nodes: app.jobs.nodes(run.id) }
        : run;
    } else if (command === "proposal" && action === "import") {
      const run = app.analysis.importProposal({
        projectId: required(parsed, "project"),
        expectedRevision: required(parsed, "expected-revision"),
        proposal: jsonFile(parsed, "file"),
        requestId,
      });
      result = booleanOption(parsed, "wait")
        ? { run: await wait(run.id), nodes: app.jobs.nodes(run.id) }
        : run;
    } else if (command === "proposal" && action === "apply")
      result = app.analysis.apply({
        projectId: required(parsed, "project"),
        proposalId: required(parsed, "proposal"),
        selection: csv(parsed, "select") || [],
        expectedRevision: required(parsed, "expected-revision"),
        requestId,
        allowReuse: booleanOption(parsed, "allow-reuse"),
        ranges: option(parsed, "ranges")
          ? z.record(z.string(), SourceRange).parse(jsonFile(parsed, "ranges"))
          : undefined,
      });
    else if (
      command === "asr" ||
      command === "tts" ||
      command === "voice-design"
    ) {
      const run = await app.analysis.standalone({
        kind: command,
        provider: option(parsed, "provider"),
        file: option(parsed, "file"),
        text: option(parsed, "text"),
        style: option(parsed, "style"),
        voiceId: option(parsed, "voice"),
        voiceVersion: option(parsed, "voice-version"),
        locale: option(parsed, "locale"),
        requestId,
      });
      result = booleanOption(parsed, "wait")
        ? { run: await wait(run.id), nodes: app.jobs.nodes(run.id) }
        : run;
      if (booleanOption(parsed, "wait") && option(parsed, "dest"))
        result = {
          result,
          output: await app.saveRunOutput(
            run.id,
            required(parsed, "dest"),
          ),
        };
    } else if (command === "export") {
      if (action === "verify")
        result = await app.interchange.verify(required(parsed, "dir"));
      else if (action === "install")
        result = await app.interchange.installJianying(
          required(parsed, "dir"),
          option(parsed, "drafts-root"),
        );
      else {
        const format = z
          .enum(["video", "bundle", "otio", "jianying"])
          .parse(required(parsed, "format"));
        result = await app.exports.run({
          projectId: required(parsed, "project"),
          format,
          destination: required(parsed, "dest"),
          deliveryId: option(parsed, "delivery"),
          requestId,
        });
      }
    } else if (command === "import")
      result = await app.interchange.importBundle(
        required(parsed, "file"),
        requestId,
        option(parsed, "id"),
      );
    else if (command === "backup")
      result = await app.backup(option(parsed, "dest"));
    else if (command === "restore")
      result = app.restore(
        required(parsed, "source"),
        required(parsed, "dest"),
      );
    else if (command === "gc") result = app.gc(booleanOption(parsed, "apply"));
    else if (command === "migrate")
      result =
        action === "rollback"
          ? app.migration.rollback(arg || "")
          : booleanOption(parsed, "execute")
            ? await app.migration.execute(
                required(parsed, "root"),
                requestId,
              )
            : app.migration.inventory(required(parsed, "root"));
    else if (command === "artifact" && action === "show")
      result = app.readArtifactJson(arg || "");
    else if (command === "artifacts")
      result = await app.builds.deliveries(required(parsed, "project"));
    else if (command === "worker") {
      const controller = new AbortController();
      process.on("SIGTERM", () => controller.abort());
      process.on("SIGINT", () => controller.abort());
      await app.jobs.worker(controller.signal);
      result = { stopped: true };
    } else
      throw new WeaverError(
        "INVALID_INPUT",
        `未知命令 ${command || ""}`,
        null,
        ["运行 weaver --help"],
      );

    const waited = z
      .object({ run: RunRecord })
      .safeParse(result);
    if (
      booleanOption(parsed, "wait") &&
      waited.success &&
      ["failed", "partial", "cancelled", "interrupted"].includes(
        waited.data.run.state,
      )
    )
      process.exitCode = 1;

    const commandName = commandKey(invocation.spec),
      actions = nextActions(
        commandName,
        result,
        cliInvocation(runtime).command,
        option(parsed, "project"),
      );
    if (!jsonlOutput) {
      if (humanRequested)
        process.stdout.write(
          renderHumanSuccess({
            command: commandName,
            result,
            requestId,
            nextActions: actions,
          }),
        );
      else writeJsonSuccess(result, requestId, compact);
      if (process.stderr.isTTY && !humanRequested) {
        const hint = terminalHint(actions);
        if (hint) process.stderr.write(`${hint}\n`);
      }
    }
  } catch (error) {
    const protocol = enrichRevisionError(
      error,
      application,
      parsed,
      runtime,
    );
    if (humanRequested)
      process.stdout.write(renderHumanError(protocol));
    else
      process.stdout.write(
        JSON.stringify({ ok: false, error: protocol }) + "\n",
      );
    process.exitCode = exitCode(protocol.code);
  } finally {
    application?.close();
  }
}

await main();
