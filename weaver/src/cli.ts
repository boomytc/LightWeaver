import { parseArgs } from "node:util";
import { addAsset, loadLibrary } from "./assets.ts";
import { runCapture } from "./capture.ts";
import { createProject, listProjects, loadProject, projectSummary } from "./project.ts";
import { weaverRoot } from "./paths.ts";
import { projectPaths } from "./project-paths.ts";
import { hasErrors, isRenderable, validateProject, validateWorkspace } from "./validate.ts";
import { syncRemotion } from "./sync.ts";
import { runTts } from "./tts.ts";
import { runPublish, runRender } from "./render.ts";
import { ASSET_KINDS, isStudyRole } from "./schema.ts";
import { addScene, moveScene, patchScene, removeScene, setCard, setVoice } from "./scenes.ts";
import { listTasks } from "./tasks/registry.ts";
import type { ProjectRecord } from "./schema.ts";

type Flags = Record<string, string | boolean | undefined>;

let wantJson = false;

function fail(message: string, code = 1): never {
  if (wantJson) console.log(JSON.stringify({ ok: false, error: message }));
  else console.error(message);
  process.exit(code);
}

function print(data: unknown): void {
  console.log(typeof data === "string" && !wantJson ? data : JSON.stringify(data, null, 2));
}

function envelope(project: ProjectRecord, root = weaverRoot()) {
  return {
    ok: true,
    project: projectSummary(project),
    film: project.film,
    issues: validateProject(project, root),
    paths: projectPaths(project, root),
  };
}

function take(args: string[]): { command: string; rest: string[]; values: Flags } {
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
      all: { type: "boolean", default: false },
      task: { type: "string" },
      source: { type: "string" },
      "study-slug": { type: "string" },
      output: { type: "string" },
      "output-en": { type: "string" },
      after: { type: "string" },
      before: { type: "string" },
      index: { type: "string" },
      still: { type: "string" },
      fit: { type: "string" },
      role: { type: "string" },
      which: { type: "string" },
      headline: { type: "string" },
      lede: { type: "string" },
      kicker: { type: "string" },
      tags: { type: "string" },
      ref: { type: "string" },
    },
  });
  wantJson = Boolean(values.json);
  return { command, rest: positionals, values };
}

function str(values: Flags, key: string): string | undefined {
  const value = values[key];
  return typeof value === "string" ? value : undefined;
}

function projectIdOf(rest: string[], values: Flags, at = 0): string {
  return rest[at] ?? str(values, "project") ?? "";
}

function requireProject(id: string): ProjectRecord {
  if (!id) fail("需要 --project <id>");
  return loadProject(id);
}

function main(): void {
  const { command, rest, values } = take(process.argv.slice(2));
  const root = weaverRoot();

  if (command === "task") {
    if (rest[0] === "list" || !rest[0]) {
      print(listTasks().map((task) => ({ id: task.id, label: task.label })));
      return;
    }
    fail("用法: weaver task list");
  }

  if (command === "project") {
    const sub = rest[0];
    if (sub === "list" || !sub) {
      print(listProjects(root).map(projectSummary));
      return;
    }
    if (sub === "show") {
      const project = requireProject(rest[1] ?? str(values, "project") ?? "");
      print({
        ...projectSummary(project),
        film: project.film,
        assets: project.assets,
        paths: projectPaths(project, root),
        renderable: isRenderable(project, root),
      });
      return;
    }
    if (sub === "validate") {
      const id = rest[1] ?? str(values, "project");
      const reports = validateWorkspace(root, id);
      print(reports);
      if (reports.some((report) => hasErrors(report.issues))) process.exit(2);
      return;
    }
    if (sub === "create") {
      const id = rest[1];
      if (!id) fail("用法: weaver project create <id>");
      const sourceRaw = str(values, "source");
      if (sourceRaw && sourceRaw !== "user" && sourceRaw !== "first-party") fail("source 必须是 user 或 first-party");
      const project = createProject(
        id,
        {
          title: str(values, "title"),
          task: str(values, "task"),
          source: sourceRaw as "user" | "first-party" | undefined,
          studySlug: str(values, "study-slug"),
          output: str(values, "output"),
          outputEn: str(values, "output-en"),
        },
        root,
      );
      print(wantJson ? envelope(project, root) : projectSummary(project));
      return;
    }
    fail("用法: weaver project list|show|validate|create");
  }

  if (command === "scene") {
    const sub = rest[0];
    const project = requireProject(str(values, "project") ?? "");
    if (sub === "list" || !sub) {
      print(project.film.scenes);
      return;
    }
    if (sub === "add") {
      const id = str(values, "id");
      if (!id) fail("用法: weaver scene add --project <id> --id <scene> --kind still");
      const roleRaw = str(values, "role");
      if (roleRaw && !isStudyRole(roleRaw)) fail(`未知 role：${roleRaw}`);
      addScene(project, {
        id,
        kind: str(values, "kind") ?? "still",
        still: str(values, "still"),
        fit: str(values, "fit") as "cover" | "contain" | undefined,
        role: roleRaw && isStudyRole(roleRaw) ? roleRaw : undefined,
        after: str(values, "after"),
      });
      print(envelope(project, root));
      return;
    }
    if (sub === "rm") {
      const id = str(values, "id") ?? rest[1];
      if (!id) fail("用法: weaver scene rm --project <id> --id <scene>");
      removeScene(project, id);
      print(envelope(project, root));
      return;
    }
    if (sub === "move") {
      const id = str(values, "id");
      if (!id) fail("用法: weaver scene move --project <id> --id <scene> --after|--before");
      const indexRaw = str(values, "index");
      moveScene(project, id, {
        after: str(values, "after"),
        before: str(values, "before"),
        index: indexRaw !== undefined ? Number(indexRaw) : undefined,
      });
      print(envelope(project, root));
      return;
    }
    if (sub === "set") {
      const id = str(values, "id");
      if (!id) fail("用法: weaver scene set --project <id> --id <scene>");
      const roleRaw = str(values, "role");
      if (roleRaw && !isStudyRole(roleRaw)) fail(`未知 role：${roleRaw}`);
      const locale = str(values, "locale");
      const text = str(values, "text");
      patchScene(project, id, {
        still: str(values, "still"),
        fit: str(values, "fit") as "cover" | "contain" | undefined,
        role: roleRaw && isStudyRole(roleRaw) ? roleRaw : undefined,
        lines: locale && text !== undefined ? { [locale]: text } : undefined,
      });
      print(envelope(project, root));
      return;
    }
    fail("用法: weaver scene list|add|rm|move|set");
  }

  if (command === "card") {
    if (rest[0] !== "set") fail("用法: weaver card set --project <id> --locale zh --which title|close");
    const project = requireProject(str(values, "project") ?? "");
    const locale = str(values, "locale");
    const which = str(values, "which");
    if (!locale || (which !== "title" && which !== "close")) {
      fail("需要 --locale 与 --which title|close");
    }
    const tags = str(values, "tags");
    setCard(project, locale, which, {
      headline: str(values, "headline"),
      lede: str(values, "lede"),
      kicker: str(values, "kicker"),
      tags: tags ? tags.split(",").map((item) => item.trim()).filter(Boolean) : undefined,
    });
    print(envelope(project, root));
    return;
  }

  if (command === "voice") {
    if (rest[0] !== "set") fail("用法: weaver voice set --project <id> --locale zh --ref library:...");
    const project = requireProject(str(values, "project") ?? "");
    const locale = str(values, "locale");
    const ref = str(values, "ref");
    if (!locale || !ref) fail("需要 --locale 与 --ref");
    setVoice(project, locale, ref);
    print(envelope(project, root));
    return;
  }

  if (command === "asset") {
    const sub = rest[0];
    if (sub === "list" || !sub) {
      if (values.library) {
        print(loadLibrary(root));
        return;
      }
      const project = requireProject(str(values, "project") ?? rest[1] ?? "");
      print(project.assets);
      return;
    }
    if (sub === "add") {
      const kind = str(values, "kind") ?? "";
      const id = str(values, "id") ?? "";
      const file = str(values, "file");
      if (!kind || !id) fail("用法: weaver asset add --id <id> --kind still|voice|... [--file]");
      if (values.library) {
        print(
          addAsset(
            { kind: "library" },
            {
              id,
              kind,
              locale: str(values, "locale"),
              file,
              text: str(values, "text"),
              style: str(values, "style"),
              label: str(values, "label"),
            },
            root,
          ),
        );
        return;
      }
      const project = requireProject(str(values, "project") ?? "");
      print(
        addAsset(
          { kind: "project", project },
          {
            id,
            kind,
            locale: str(values, "locale"),
            file,
            text: str(values, "text"),
            style: str(values, "style"),
            label: str(values, "label"),
          },
          root,
        ),
      );
      return;
    }
    fail(`用法: weaver asset list|add（kind: ${ASSET_KINDS.join(", ")}）`);
  }

  if (command === "validate") {
    const id = rest[0] ?? str(values, "project");
    const reports = validateWorkspace(root, id);
    print(reports);
    if (reports.some((report) => hasErrors(report.issues))) process.exit(2);
    return;
  }

  if (command === "sync") {
    print(syncRemotion(root));
    return;
  }

  if (command === "capture") {
    const projectId = rest[0] ?? str(values, "project");
    runCapture({ projectId: projectId || undefined, locale: str(values, "locale"), root });
    return;
  }

  if (command === "publish") {
    const project = requireProject(projectIdOf(rest, values));
    print(runPublish({ projectId: project.id, locale: str(values, "locale"), root }));
    return;
  }

  if (command === "tts") {
    const projectId = rest[0] ?? str(values, "project") ?? "";
    const projects = projectId ? [loadProject(projectId, root)] : listProjects(root);
    const attempted: ProjectRecord[] = [];
    const results = [];
    let failed = false;
    for (const project of projects) {
      if (!projectId && !isRenderable(project, root)) {
        console.error(`skip tts ${project.id}（不可渲）`);
        continue;
      }
      attempted.push(project);
      try {
        results.push(
          runTts({
            projectId: project.id,
            locale: str(values, "locale"),
            scene: str(values, "scene"),
            seed: Boolean(values.seed),
            root,
          }),
        );
      } catch (error) {
        failed = true;
        console.error(error instanceof Error ? error.message : error);
      }
    }
    if (!attempted.length) fail("没有可合成的项目", 2);
    print(projectId ? results[0] : results);
    if (failed) process.exit(2);
    return;
  }

  if (command === "render") {
    const projectId = rest[0] ?? str(values, "project") ?? "";
    const projects = projectId ? [loadProject(projectId, root)] : listProjects(root);
    const attempted: ProjectRecord[] = [];
    const results = [];
    let failed = false;
    for (const project of projects) {
      if (!projectId && !isRenderable(project, root)) {
        console.error(`skip render ${project.id}（不可渲）`);
        continue;
      }
      attempted.push(project);
      try {
        results.push(runRender({ projectId: project.id, locale: str(values, "locale"), root }));
      } catch (error) {
        failed = true;
        console.error(error instanceof Error ? error.message : error);
      }
    }
    if (!attempted.length) fail("没有可渲染的项目", 2);
    print(projectId ? results[0] : results);
    if (failed) process.exit(2);
    return;
  }

  fail(`未知命令：${command}
命令:
  weaver task list
  weaver project list|show|validate|create
  weaver scene list|add|rm|move|set
  weaver card set
  weaver voice set
  weaver asset list|add
  weaver validate [id]
  weaver capture [--project]
  weaver publish --project
  weaver sync
  weaver tts [--project]
  weaver render [--project]`);
}

main();
