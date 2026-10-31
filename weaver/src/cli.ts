import fs from "node:fs";
import { Application } from "./app/index.ts";
import { currentRuntime, type RuntimeContext } from "./runtime.ts";
import path from "node:path";
import {
  z,
  ProjectDocument,
  ProjectRevision,
  MediaRef,
  Scene,
  Speech,
  OutputProfile,
  CaptionTrack,
  LibraryPayload,
  EditOperation,
  Proposal,
  TimelineManifest,
  CreativePlan,
  SourceRange,
  ErrorProtocol,
  ModelSettingsPatch,
} from "./contracts/index.ts";
import { WeaverError, errorProtocol, exitCode } from "./contracts/errors.ts";
import { newId } from "./store/index.ts";
import { importCaptions } from "./timeline/captions.ts";

const argv = process.argv.slice(2),
  words: string[] = [],
  options: Record<string, string | boolean> = {};
for (let i = 0; i < argv.length; i++) {
  const arg = argv[i];
  if (!arg.startsWith("--")) words.push(arg);
  else {
    const equals = arg.indexOf("="),
      key = arg.slice(2, equals < 0 ? undefined : equals),
      value = equals < 0 ? undefined : arg.slice(equals + 1);
    if (value !== undefined) options[key] = value;
    else if (argv[i + 1] && !argv[i + 1].startsWith("--"))
      options[key] = argv[++i];
    else options[key] = true;
  }
}
const str = (key: string, optional = false): string => {
  const v = options[key];
  if (typeof v === "string" && v) return v;
  if (optional) return "";
  throw new WeaverError("INVALID_INPUT", `缺少 --${key}`);
};
const csv = (key: string): string[] | undefined =>
  typeof options[key] === "string"
    ? str(key).split(",").filter(Boolean)
    : undefined;
const jsonFile = (key: string): unknown =>
  JSON.parse(fs.readFileSync(str(key), "utf8"));
const requestId =
  typeof options["request-id"] === "string"
    ? options["request-id"]
    : newId("request");
function cliRuntime(): RuntimeContext {
  const runtime = currentRuntime();
  const configFile = str("config-file", true);
  const configBase = str("config-base", true);
  if (!configFile && !configBase) return runtime;
  const file = configFile ? path.resolve(configFile) : runtime.configFile;
  return {
    ...runtime,
    configFile: file,
    configBase: configBase ? path.resolve(configBase) : path.dirname(file),
  };
}
let application: Application | undefined;
try {
  const app = new Application({
    runtime: cliRuntime(),
    dataDir: str("data-dir", true) || undefined,
  });
  application = app;
  let result: unknown;
  let jsonlOutput = false;
  const [command, action, arg] = words;
  if (!command || command === "help" || options.help)
    result = {
      usage:
        "weaver <command> [--json] [--data-dir /absolute/root] [--config-file /absolute/config.local.yaml] [--config-base /absolute/base]",
      writes:
        "--expected-revision <rev> / --expected-version <version> 和 --request-id <stable-id>；未给 request-id 时本次生成",
      commands: [
        "doctor --json",
        "models list | models settings get",
        "models settings set --file /abs/model-settings.json",
        "models download <model-id> [--root /abs/download-root --wait]",
        "models verify <model-id> [--root /abs/download-root]",
        "models use <model-id> --path /abs/existing-model-or-file",
        "models use-provider modelbest",
        "schema [project|revision|scene|speech|profile|captions|library|ops|proposal|timeline|model-settings|error]",
        "project create <id> [--title text] [--workflow study-explainer]",
        "project list|show [id]",
        "project apply --project id --ops /abs/edit-ops.json --expected-revision rev",
        "project import --project id --file /abs/document.json --expected-revision rev",
        "project brief <id>",
        "project context <id>",
        "asset add --project id --file /abs/media --expected-revision rev [--asset-id id]",
        "library list|show [id] [--version digest]",
        "library set --file /abs/payload.json [--media /abs/file] [--id id --expected-version digest]",
        "library delete --id id --expected-version digest",
        "captions import --project id --file /abs/subtitles.srt --locale zh --expected-revision rev",
        "captions from-analysis --project id --locale zh [--source-id id --run runId] --expected-revision rev",
        "captions translate --project id --locale zh --target-locale en --expected-revision rev [--wait]",
        "captions apply-translation --project id --run runId --expected-revision rev",
        "creative-plan import|show|apply --project id [--file /abs/plan.json --append] [--expected-revision rev]",
        "speakers analyze --project id --source-id id --locale zh|en [--from-us n --duration-us n --wait]",
        "speakers apply --project id --run runId --expected-revision rev",
        "build --project id [--locales zh,en] [--profiles landscape,portrait,square] [--plan|--wait] [--regenerate]",
        "run list [--project id] | run status|cancel|resume <runId> [--wait] | run events <runId> [--after seq]",
        "artifacts --project id",
        "worker",
        "events RUN [--after seq] (JSONL snapshot)",
        "capabilities --json",
        "asset adopt --project id --item library-id --version digest --expected-revision rev",
        "library import-builtin --package-version digest",
        "analyze --project id --with asr,describe [--align --locale zh] [--provider modelbest-vlm|deepseek-vlm] [--source-id id --from-us n --duration-us n] [--wait]",
        "analyze --project id --import /abs/evidence.json --expected-revision rev --wait",
        "search --project id --query text [--mode text|semantic|visual] [--rerank] [--sources id,id --from-us n --to-us n] [--wait]",
        "match --project id --edited asset-id [--sources id,id] --wait",
        "proposal import --project id --file /abs/proposal.json --expected-revision rev --wait",
        "proposal apply --project id --proposal proposal-id --select candidate-id,candidate-id --expected-revision rev [--ranges /abs/ranges.json --allow-reuse]",
        "asr --file /abs/audio-or-video [--locale zh] --wait [--dest /abs/result.json]",
        "tts --text text [--voice id --voice-version digest --provider local-voxcpm2] --wait [--dest /abs/speech.wav]",
        "voice-design --text sample --style description [--provider local-voxcpm2] --wait [--dest /abs/preview.wav]",
        "capture --url https://example.com [--width 1440 --height 1100 --selector css] --wait [--dest /abs/image.png]",
        "export --project id --format otio|jianying|bundle --dest /abs/empty-output [--delivery id]",
        "export verify --dir /abs/package | export install --dir /abs/jianying-package",
        "import --file /abs/bundle.zip [--id new-project-id]",
        "backup [--dest /abs/empty-backup] | restore --source /abs/backup --dest /abs/empty-state",
        "gc [--apply] | migrate --root /abs/legacy-workspace [--dry-run|--execute] | migrate rollback journal-id",
      ],
      providers: app.providers.descriptors(),
    };
  else if (command === "capabilities") result = app.capabilities();
  else if (command === "events") {
    jsonlOutput = true;
    const events = app.jobs.events(action, Number(str("after", true) || 0));
    result = events;
    for (const event of events)
      process.stdout.write(JSON.stringify(event) + "\n");
  } else if (command === "doctor") result = await app.providers.doctor();
  else if (command === "models") {
    if (action === "settings") {
      if (arg === "get") result = app.models.settings();
      else if (arg === "set")
        result = app.models.save(jsonFile("file"));
      else throw new WeaverError("INVALID_INPUT", "未知 models settings 操作");
    } else if (action === "list") result = app.models.view();
    else if (action === "download") {
      if (!arg) throw new WeaverError("INVALID_INPUT", "缺少 model-id");
      const run = app.models.download({
        id: arg,
        root: str("root", true) || app.models.settings().downloadRoot.value,
        requestId,
      });
      result = options.wait
        ? { run: await app.jobs.wait(run.id), nodes: app.jobs.nodes(run.id) }
        : run;
    } else if (action === "verify") {
      if (!arg) throw new WeaverError("INVALID_INPUT", "缺少 model-id");
      result = await app.models.verify(
        arg,
        str("root", true) || app.models.settings().downloadRoot.value,
      );
    } else if (action === "use") {
      if (!arg) throw new WeaverError("INVALID_INPUT", "缺少 model-id");
      result = await app.models.adopt(arg, str("path"));
    } else if (action === "use-provider") {
      if (!arg) throw new WeaverError("INVALID_INPUT", "缺少 provider-id");
      result = app.models.adoptProvider(arg, app.models.settings().revision);
    } else throw new WeaverError("INVALID_INPUT", "未知 models 操作");
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
      ops: z.array(EditOperation),
      proposal: Proposal,
      timeline: TimelineManifest,
      "model-settings": ModelSettingsPatch,
      error: ErrorProtocol,
    };
    const schema = Object.entries(schemas).find(
      ([key]) => key === (action || "project"),
    )?.[1];
    if (!schema) throw new WeaverError("INVALID_INPUT", "未知 schema");
    result = z.toJSONSchema(schema, { io: "input" });
  } else if (command === "project") {
    const projectId = str("project", true) || arg;
    if (action === "create")
      result = app.projects.create({
        id: arg,
        title: str("title", true) || arg || "未命名项目",
        workflow: str("workflow", true) || "study-explainer",
        requestId,
      });
    else if (action === "list") result = app.projects.list();
    else if (action === "show")
      result = app.projects.read(projectId, str("revision", true) || undefined);
    else if (action === "apply")
      result = app.projects.apply({
        projectId,
        expectedRevision: str("expected-revision"),
        requestId,
        ops: jsonFile("ops"),
      });
    else if (action === "import")
      result = app.projects.update({
        projectId,
        expectedRevision: str("expected-revision"),
        requestId,
        document: jsonFile("file"),
      });
    else if (action === "brief") result = app.agentBrief(projectId);
    else if (action === "context") result = await app.projectContext(projectId);
    else throw new WeaverError("INVALID_INPUT", "未知 project 操作");
  } else if (command === "asset" && action === "add")
    result = await app.addAsset({
      projectId: str("project"),
      expectedRevision: str("expected-revision"),
      requestId,
      file: str("file"),
      assetId: str("asset-id", true) || undefined,
      name: str("name", true) || undefined,
    });
  else if (command === "asset" && action === "adopt")
    result = await app.adoptMaterial({
      projectId: str("project"),
      expectedRevision: str("expected-revision"),
      requestId,
      itemId: str("item"),
      version: str("version"),
    });
  else if (command === "library") {
    const id = str("id", true) || arg;
    if (action === "import-builtin")
      result = await app.importBuiltins({
        expectedPackageVersion: str("package-version"),
        requestId,
      });
    else if (action === "list") result = app.library.list();
    else if (action === "show")
      result = app.library.read(id, str("version", true) || undefined);
    else if (action === "set")
      result = await app.importLibrary({
        itemId: id,
        expectedVersion: str("expected-version", true) || null,
        requestId,
        payload: jsonFile("file"),
        file: str("media", true) || undefined,
      });
    else if (action === "delete")
      result = app.library.remove({
        itemId: id,
        expectedVersion: str("expected-version"),
        requestId,
      });
    else throw new WeaverError("INVALID_INPUT", "未知 library 操作");
  } else if (command === "captions" && action === "import") {
    const projectId = str("project"),
      p = app.projects.read(projectId);
    const track = importCaptions(
      fs.readFileSync(str("file"), "utf8"),
      str("locale"),
      p.document.profiles[0].fps,
      options["source-id"]
        ? MediaRef.parse({
            assetId: str("source-id"),
            version: str("source-version"),
          })
        : undefined,
    );
    result = app.projects.apply({
      projectId,
      expectedRevision: str("expected-revision"),
      requestId,
      ops: [
        {
          op: "captions",
          value: [
            ...p.document.captions.filter((c) => c.locale !== track.locale),
            track,
          ],
        },
      ],
    });
  } else if (command === "captions" && action === "from-analysis") {
    result = app.analysis.adoptCaptions({projectId: str("project"), locale: str("locale"),
      sourceId: str("source-id", true) || undefined, runId: str("run", true) || undefined,
      expectedRevision: str("expected-revision"), requestId});
  } else if (command === "captions" && action === "translate") {
    const run = await app.captions.submit({projectId: str("project"), locale: str("locale"),
      targetLocale: str("target-locale"), expectedRevision: str("expected-revision"), requestId});
    result = options.wait ? {run: await app.jobs.wait(run.id), nodes: app.jobs.nodes(run.id)} : run;
  } else if (command === "captions" && action === "apply-translation") {
    result = app.captions.apply({projectId: str("project"), runId: str("run"),
      expectedRevision: str("expected-revision"), requestId});
  } else if (command === "creative-plan") {
    if (action === "import") result = app.authoring.save({projectId: str("project"),
      expectedRevision: str("expected-revision"), requestId, plan: jsonFile("file")});
    else if (action === "apply") result = app.authoring.apply({projectId: str("project"),
      expectedRevision: str("expected-revision"), requestId, append: !!options.append});
    else if (action === "show") result = app.projects.read(str("project")).document.creativePlan ?? null;
    else throw new WeaverError("INVALID_INPUT", "未知 creative-plan 操作");
  } else if (command === "speakers") {
    if (action === "analyze") {
      const run = await app.speakers.submit({projectId: str("project"), sourceId: str("source-id"),
        locale: str("locale"), requestId,
        fromUs: options["from-us"] === undefined ? undefined : Number(str("from-us")),
        durationUs: options["duration-us"] === undefined ? undefined : Number(str("duration-us"))});
      result = options.wait ? {run: await app.jobs.wait(run.id), nodes: app.jobs.nodes(run.id)} : run;
    } else if (action === "apply") result = app.speakers.apply({projectId: str("project"), runId: str("run"),
      expectedRevision: str("expected-revision"), requestId});
    else throw new WeaverError("INVALID_INPUT", "未知 speakers 操作");
  } else if (command === "build") {
    const input = {
      projectId: str("project"),
      locales: csv("locales"),
      profiles: csv("profiles"),
      regenerate: !!options.regenerate,
      requestId,
    };
    if (options.plan) {
      const { nodes, snapshot, ...plan } = await app.builds.plan(input);
      result = { ...plan, revision: snapshot.projectRevision.id };
    } else {
      const run = await app.builds.submit(input);
      result = options.wait
        ? {
            run: await app.jobs.wait(run.id),
            nodes: app.jobs.nodes(run.id),
            deliveries: await app.builds.deliveries(input.projectId),
          }
        : run;
    }
  } else if (command === "run") {
    if (action === "list")
      result = app.jobs.list(str("project", true) || undefined);
    else if (action === "status")
      result = { run: app.jobs.read(arg), nodes: app.jobs.nodes(arg) };
    else if (action === "cancel") result = app.jobs.cancel(arg);
    else if (action === "resume") {
      const run = app.jobs.resume(arg);
      result = options.wait
        ? { run: await app.jobs.wait(run.id), nodes: app.jobs.nodes(run.id) }
        : run;
    } else if (action === "events")
      result = app.jobs.events(arg, Number(str("after", true) || 0));
    else throw new WeaverError("INVALID_INPUT", "未知 run 操作");
  } else if (
    command === "analyze" ||
    command === "describe" ||
    command === "transcribe"
  ) {
    const run = options.import
      ? app.analysis.importEvidence({
          projectId: str("project"),
          expectedRevision: str("expected-revision"),
          requestId,
          entries: jsonFile("import"),
        })
      : await app.analysis.submit({
          projectId: str("project"),
          kinds:
            command === "describe"
              ? ["describe"]
              : command === "transcribe"
                ? ["asr"]
                : csv("with") || ["asr"],
          requestId,
          sourceId: str("source-id", true) || undefined,
          vlmProvider: str("provider", true) || undefined,
          locale: str("locale", true) || undefined,
          fromUs: options["from-us"] ? Number(str("from-us")) : undefined,
          durationUs: options["duration-us"]
            ? Number(str("duration-us"))
            : undefined,
          regenerate: !!options.regenerate,
          align: !!options.align,
        });
    result = options.wait
      ? { run: await app.jobs.wait(run.id), nodes: app.jobs.nodes(run.id) }
      : run;
  } else if (command === "capture") {
    const run = app.analysis.capture({
      projectId: str("project", true) || undefined,
      url: str("url"),
      width: Number(str("width", true) || 1440),
      height: Number(str("height", true) || 1100),
      selector: str("selector", true) || undefined,
      requestId,
    });
    result = options.wait
      ? { run: await app.jobs.wait(run.id), nodes: app.jobs.nodes(run.id) }
      : run;
    if (options.wait && options.dest)
      await app.saveRunOutput(run.id, str("dest"));
  } else if (command === "search") {
    if (options.rerank && str("mode", true) !== "semantic")
      throw new WeaverError("INVALID_INPUT", "候选重排只适用于语义检索");
    if (str("mode", true) === "visual") {
      const run = await app.visual.submit({projectId: str("project"), query: str("query"), requestId,
        sourceIds: csv("sources"), fromUs: options["from-us"] ? Number(str("from-us")) : undefined,
        toUs: options["to-us"] ? Number(str("to-us")) : undefined});
      result = options.wait ? {run: await app.jobs.wait(run.id), nodes: app.jobs.nodes(run.id)} : run;
    } else if (str("mode", true) === "semantic") {
      const run = await app.analysis.submitSemantic({
        projectId: str("project"),
        query: str("query"),
        requestId,
        rerank: !!options.rerank,
        sourceIds: csv("sources"),
        fromUs: options["from-us"] ? Number(str("from-us")) : undefined,
        toUs: options["to-us"] ? Number(str("to-us")) : undefined,
      });
      result = options.wait
        ? { run: await app.jobs.wait(run.id), nodes: app.jobs.nodes(run.id) }
        : run;
    } else
      result = app.analysis.search({
        projectId: str("project"),
        query: str("query"),
        requestId,
        sourceIds: csv("sources"),
        fromUs: options["from-us"] ? Number(str("from-us")) : undefined,
        toUs: options["to-us"] ? Number(str("to-us")) : undefined,
      });
  } else if (command === "match") {
    const run = app.analysis.submitMatch({
      projectId: str("project"),
      editedId: str("edited"),
      sourceIds: csv("sources"),
      requestId,
    });
    result = options.wait
      ? { run: await app.jobs.wait(run.id), nodes: app.jobs.nodes(run.id) }
      : run;
  } else if (command === "proposal" && action === "import") {
    const run = app.analysis.importProposal({
      projectId: str("project"),
      expectedRevision: str("expected-revision"),
      proposal: jsonFile("file"),
      requestId,
    });
    result = options.wait
      ? { run: await app.jobs.wait(run.id), nodes: app.jobs.nodes(run.id) }
      : run;
  } else if (command === "proposal" && action === "apply")
    result = app.analysis.apply({
      projectId: str("project"),
      proposalId: str("proposal"),
      selection: csv("select") || [],
      expectedRevision: str("expected-revision"),
      requestId,
      allowReuse: !!options["allow-reuse"],
      ranges: options.ranges ? z.record(z.string(), SourceRange).parse(jsonFile("ranges")) : undefined,
    });
  else if (
    command === "asr" ||
    command === "tts" ||
    command === "voice-design"
  ) {
    const run = await app.analysis.standalone({
      kind: command,
      provider: str("provider", true) || undefined,
      file: str("file", true) || undefined,
      text: str("text", true) || undefined,
      style: str("style", true) || undefined,
      voiceId: str("voice", true) || undefined,
      voiceVersion: str("voice-version", true) || undefined,
      locale: str("locale", true) || undefined,
      requestId,
    });
    result = options.wait
      ? { run: await app.jobs.wait(run.id), nodes: app.jobs.nodes(run.id) }
      : run;
    if (options.wait && options.dest)
      result = { result, output: await app.saveRunOutput(run.id, str("dest")) };
  } else if (command === "export") {
    if (action === "verify") result = await app.interchange.verify(str("dir"));
    else if (action === "install")
      result = await app.interchange.installJianying(
        str("dir"),
        str("drafts-root", true) || undefined,
      );
    else {
      const format = z
        .enum(["bundle", "otio", "jianying"])
        .parse(str("format"));
      result =
        format === "bundle"
          ? await app.interchange.bundle(str("project"), str("dest"))
          : await app.interchange.export({
              projectId: str("project"),
              format,
              destination: str("dest"),
              deliveryId: str("delivery", true) || undefined,
            });
    }
  } else if (command === "import")
    result = await app.interchange.importBundle(
      str("file"),
      requestId,
      str("id", true) || undefined,
    );
  else if (command === "backup")
    result = await app.backup(str("dest", true) || undefined);
  else if (command === "restore")
    result = app.restore(str("source"), str("dest"));
  else if (command === "gc") result = app.gc(!!options.apply);
  else if (command === "migrate")
    result =
      action === "rollback"
        ? app.migration.rollback(arg)
        : options.execute
          ? await app.migration.execute(str("root"), requestId)
          : app.migration.inventory(str("root"));
  else if (command === "artifacts")
    result = await app.builds.deliveries(str("project"));
  else if (command === "worker") {
    const controller = new AbortController();
    process.on("SIGTERM", () => controller.abort());
    process.on("SIGINT", () => controller.abort());
    await app.jobs.worker(controller.signal);
    result = { stopped: true };
  } else
    throw new WeaverError("INVALID_INPUT", `未知命令 ${command}`, null, [
      "运行 weaver help",
    ]);
  const waited = z
    .object({ run: z.object({ state: z.string() }) })
    .safeParse(result);
  if (
    options.wait &&
    waited.success &&
    ["failed", "partial", "cancelled", "interrupted"].includes(
      waited.data.run.state,
    )
  )
    process.exitCode = 1;
  if (!jsonlOutput)
    process.stdout.write(
      JSON.stringify(
        { ok: true, result, requestId },
        null,
        options.json ? 0 : 2,
      ) + "\n",
    );
} catch (error) {
  const protocol = errorProtocol(error);
  process.stdout.write(JSON.stringify({ ok: false, error: protocol }) + "\n");
  process.exitCode = exitCode(protocol.code);
} finally {
  application?.close();
}
