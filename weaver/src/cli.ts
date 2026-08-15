import { parseArgs } from "node:util";
import { loadLibrary } from "./assets.ts";
import { addAsset } from "./assets.ts";
import { createProject, listProjects, loadProject, projectSummary } from "./project.ts";
import { weaverRoot } from "./paths.ts";
import { hasErrors, validateWorkspace } from "./validate.ts";
import { syncRemotion } from "./sync.ts";
import { runTts } from "./tts.ts";
import { runRender } from "./render.ts";
import { ASSET_KINDS } from "./schema.ts";

type Flags = Record<string, string | boolean | undefined>;

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function print(data: unknown, asJson: boolean): void {
  if (asJson) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }
  if (typeof data === "string") {
    console.log(data);
    return;
  }
  console.log(JSON.stringify(data, null, 2));
}

function take(args: string[]): { command: string; rest: string[]; values: Flags; json: boolean } {
  const command = args[0];
  if (!command) fail("用法: weaver <command>");
  const { values, positionals } = parseArgs({
    args: args.slice(1),
    allowPositionals: true,
    strict: false,
    options: {
      json: { type: "boolean", default: false },
      project: { type: "string" },
      locale: { type: "string" },
      scene: { type: "string" },
      kind: { type: "string" },
      id: { type: "string" },
      file: { type: "string" },
      text: { type: "string" },
      style: { type: "string" },
      label: { type: "string" },
      title: { type: "string" },
      library: { type: "boolean", default: false },
      seed: { type: "boolean", default: false },
    },
  });
  return { command, rest: positionals, values, json: Boolean(values.json) };
}

function main(): void {
  const { command, rest, values, json } = take(process.argv.slice(2));
  const root = weaverRoot();

  if (command === "project") {
    const sub = rest[0];
    if (sub === "list" || !sub) {
      print(listProjects(root).map(projectSummary), json);
      return;
    }
    if (sub === "show") {
      const id = rest[1] ?? String(values.project ?? "");
      if (!id) fail("用法: weaver project show <id>");
      const project = loadProject(id, root);
      print({ ...projectSummary(project), film: project.film, assets: project.assets }, json);
      return;
    }
    if (sub === "validate") {
      const id = rest[1] ?? (typeof values.project === "string" ? values.project : undefined);
      const reports = validateWorkspace(root, id);
      print(reports, json);
      if (reports.some((report) => hasErrors(report.issues))) process.exit(2);
      return;
    }
    if (sub === "create") {
      const id = rest[1];
      if (!id) fail("用法: weaver project create <id> [--title ...]");
      const project = createProject(id, { title: typeof values.title === "string" ? values.title : undefined }, root);
      print(projectSummary(project), json);
      return;
    }
    fail("用法: weaver project list|show|validate|create");
  }

  if (command === "asset") {
    const sub = rest[0];
    if (sub === "list" || !sub) {
      if (values.library) {
        print(loadLibrary(root), json);
        return;
      }
      const id = typeof values.project === "string" ? values.project : rest[1];
      if (!id) fail("用法: weaver asset list --project <id> | --library");
      const project = loadProject(id, root);
      print(project.assets, json);
      return;
    }
    if (sub === "add") {
      const kind = String(values.kind ?? "");
      const id = String(values.id ?? "");
      const file = typeof values.file === "string" ? values.file : undefined;
      if (!kind || !id) fail("用法: weaver asset add --id <id> --kind still|voice|... [--file] [--project|--library]");
      if (values.library) {
        const asset = addAsset(
          { kind: "library" },
          {
            id,
            kind,
            locale: typeof values.locale === "string" ? values.locale : undefined,
            file,
            text: typeof values.text === "string" ? values.text : undefined,
            style: typeof values.style === "string" ? values.style : undefined,
            label: typeof values.label === "string" ? values.label : undefined,
          },
          root,
        );
        print(asset, json);
        return;
      }
      const projectId = typeof values.project === "string" ? values.project : "";
      if (!projectId) fail("asset add 需要 --project 或 --library");
      const asset = addAsset(
        { kind: "project", project: loadProject(projectId, root) },
        {
          id,
          kind,
          locale: typeof values.locale === "string" ? values.locale : undefined,
          file,
          text: typeof values.text === "string" ? values.text : undefined,
          style: typeof values.style === "string" ? values.style : undefined,
          label: typeof values.label === "string" ? values.label : undefined,
        },
        root,
      );
      print(asset, json);
      return;
    }
    fail(`用法: weaver asset list|add（kind: ${ASSET_KINDS.join(", ")}）`);
  }

  if (command === "validate") {
    const id = rest[0] ?? (typeof values.project === "string" ? values.project : undefined);
    const reports = validateWorkspace(root, id);
    print(reports, json);
    if (reports.some((report) => hasErrors(report.issues))) process.exit(2);
    return;
  }

  if (command === "sync") {
    print(syncRemotion(root), json);
    return;
  }

  if (command === "tts") {
    const projectId = rest[0] ?? (typeof values.project === "string" ? values.project : "");
    const ids = projectId ? [projectId] : listProjects(root).map((project) => project.id);
    if (!ids.length) fail("没有可合成的项目");
    const result = ids.map((id) =>
      runTts({
        projectId: id,
        locale: typeof values.locale === "string" ? values.locale : undefined,
        scene: typeof values.scene === "string" ? values.scene : undefined,
        seed: Boolean(values.seed),
        root,
      }),
    );
    print(projectId ? result[0] : result, true);
    return;
  }

  if (command === "render") {
    const projectId = rest[0] ?? (typeof values.project === "string" ? values.project : "");
    const ids = projectId ? [projectId] : listProjects(root).map((project) => project.id);
    if (!ids.length) fail("没有可渲染的项目");
    const result = ids.map((id) =>
      runRender({
        projectId: id,
        locale: typeof values.locale === "string" ? values.locale : undefined,
        root,
      }),
    );
    print(projectId ? result[0] : result, true);
    return;
  }

  fail(`未知命令：${command}
命令:
  weaver project list|show|validate|create
  weaver asset list|add
  weaver validate [id]
  weaver sync
  weaver tts --project <id>
  weaver render --project <id>`);
}

main();
