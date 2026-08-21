import { parseArgs } from "node:util";
import { addAsset, loadLibrary, patchLibraryAsset, removeLibraryAsset, resolveVoicePrompt } from "./assets.ts";
import { runAsr } from "./asr.ts";
import {
  createLibraryMethod,
  listLibraryMethods,
  methodNameOf,
  parseMethodExpand,
  parseMethodScenes,
  updateLibraryMethod,
} from "./library-method.ts";
import { allocateNewMaterial, isMaterialKind, updateLibraryMaterial } from "./library-material.ts";
import { updateLibraryVoice, voiceNameOf } from "./voice-mint.ts";
import { runCapture } from "./capture.ts";
import { createProject, listProjects, loadProject, projectSummary } from "./project.ts";
import { weaverRoot } from "./paths.ts";
import { projectPaths } from "./project-paths.ts";
import { applyRecipe, formatRecipe, listRecipes, loadRecipe, setFilmRecipe, summarizeRecipe } from "./recipes.ts";
import { hasErrors, isRenderable, validateProject, validateWorkspace } from "./validate.ts";
import { syncRemotion } from "./sync.ts";
import { runTts } from "./tts.ts";
import { runPublish, runRender } from "./render.ts";
import { ASSET_KINDS, filmTask, isOstMode } from "./schema.ts";
import { addScene, moveScene, patchScene, removeScene, setCard, setKit, setLangs, setVoicePack } from "./scenes.ts";
import { getTask, listTasks } from "./tasks/registry.ts";
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
      points: { type: "string" },
      ref: { type: "string" },
      refs: { type: "string" },
      recipe: { type: "string" },
      kinds: { type: "string" },
      items: { type: "string" },
      langs: { type: "string" },
      expand: { type: "string" },
      scenes: { type: "string" },
      in: { type: "string" },
      out: { type: "string" },
      ost: { type: "string" },
    },
  });
  wantJson = Boolean(values.json);
  return { command, rest: positionals, values };
}

function str(values: Flags, key: string): string | undefined {
  const value = values[key];
  return typeof value === "string" ? value : undefined;
}

function num(values: Flags, key: string): number | undefined {
  const raw = str(values, key);
  if (raw === undefined || raw === "") return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value)) fail(`${key} 必须是数字`);
  return value;
}

function projectIdOf(rest: string[], values: Flags, at = 0): string {
  return rest[at] ?? str(values, "project") ?? "";
}

function requireProject(id: string): ProjectRecord {
  if (!id) fail("需要 --project <id>");
  return loadProject(id);
}

function findLibraryMethod(id: string | undefined, label: string | undefined, root: string) {
  const methods = loadLibrary(root).filter((item) => item.kind === "method");
  if (id) return methods.find((item) => item.id === id);
  if (label) return methods.find((item) => methodNameOf(item) === label.trim());
  return undefined;
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
      if (!id) fail("用法: weaver scene add --project <id> --id <scene> --kind still|clip");
      const task = getTask(filmTask(project.film));
      const roleRaw = str(values, "role");
      if (roleRaw && task.roles?.length && !task.roles.includes(roleRaw)) fail(`未知 role：${roleRaw}`);
      const ostRaw = str(values, "ost");
      if (ostRaw && !isOstMode(ostRaw)) fail("ost 必须是 narration / original / mix");
      addScene(project, {
        id,
        kind: str(values, "kind") ?? task.frame.expandableKinds[0],
        still: str(values, "still"),
        source: str(values, "source"),
        in: num(values, "in"),
        out: num(values, "out"),
        ost: ostRaw && isOstMode(ostRaw) ? ostRaw : undefined,
        fit: str(values, "fit") as "cover" | "contain" | undefined,
        role: roleRaw,
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
      const task = getTask(filmTask(project.film));
      const roleRaw = str(values, "role");
      if (roleRaw && task.roles?.length && !task.roles.includes(roleRaw)) fail(`未知 role：${roleRaw}`);
      const locale = str(values, "locale");
      const text = str(values, "text");
      const ostRaw = str(values, "ost");
      if (ostRaw && !isOstMode(ostRaw)) fail("ost 必须是 narration / original / mix");
      patchScene(project, id, {
        still: str(values, "still"),
        source: str(values, "source"),
        in: num(values, "in"),
        out: num(values, "out"),
        ost: ostRaw && isOstMode(ostRaw) ? ostRaw : undefined,
        fit: str(values, "fit") as "cover" | "contain" | undefined,
        role: roleRaw,
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
    const task = getTask(filmTask(project.film));
    const slots = task.cards?.map((item) => item.which) ?? [];
    if (!locale || !which || !slots.includes(which)) {
      fail(`需要 --locale 与 --which ${slots.join("|") || "（该任务没有卡片）"}`);
    }
    const tags = str(values, "tags");
    const points = str(values, "points");
    const headline = str(values, "headline");
    const lede = str(values, "lede");
    const kicker = str(values, "kicker");
    const patch: {
      headline?: string;
      lede?: string;
      kicker?: string;
      tags?: string[];
      points?: string[];
    } = {};
    if (headline !== undefined) patch.headline = headline;
    if (lede !== undefined) patch.lede = lede;
    if (kicker !== undefined) patch.kicker = kicker;
    if (tags !== undefined) patch.tags = tags.split(",").map((item) => item.trim()).filter(Boolean);
    if (points !== undefined) patch.points = points.split(";").map((item) => item.trim()).filter(Boolean);
    setCard(project, locale, which, patch);
    print(envelope(project, root));
    return;
  }

  if (command === "voice") {
    const sub = rest[0];
    if (sub === "asr") {
      const file = str(values, "file");
      const id = str(values, "id");
      const label = str(values, "label");
      if (file) {
        print(runAsr({ audio: file, root }));
        return;
      }
      const assets = loadLibrary(root).filter((item) => item.kind === "voice");
      const asset = id
        ? assets.find((item) => item.id === id)
        : label
          ? assets.find((item) => voiceNameOf(item) === label.trim())
          : undefined;
      if (!asset) fail("用法: weaver voice asr --file <wav> 或 --id <voice.id> 或 --label <名称>");
      const resolved = resolveVoicePrompt(null, `library:${asset.id}`, undefined, root);
      if (!resolved) fail(`音色 ${asset.label ?? asset.id} 还没有克隆源 wav`);
      const result = runAsr({ audio: resolved.absPath, root });
      const next = patchLibraryAsset(asset.id, { text: result.text }, root);
      print({ ...result, id: next.id, label: next.label ?? next.id });
      return;
    }
    if (sub !== "set") fail("用法: weaver voice set --project <id> --ref library:voice.prompt\n       weaver voice asr --file <wav> | --id <voice.id> | --label <名称>");
    const project = requireProject(str(values, "project") ?? "");
    if (str(values, "locale")) fail("一套音色给要出的语言，不要加 --locale");
    const ref = str(values, "ref");
    if (!ref) fail("需要 --ref（一套音色，例如 library:voice.prompt）");
    setVoicePack(project, ref);
    print(envelope(project, root));
    return;
  }

  if (command === "langs") {
    if (rest[0] !== "set") fail("用法: weaver langs set --project <id> --langs zh");
    const project = requireProject(str(values, "project") ?? "");
    const langs = str(values, "langs");
    if (!langs) fail("需要 --langs（逗号分隔，例如 zh 或 zh,en）");
    setLangs(
      project,
      langs
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    );
    print(envelope(project, root));
    return;
  }

  if (command === "kit") {
    if (rest[0] !== "set") fail("用法: weaver kit set --project <id> --refs library:element.mark,...");
    const project = requireProject(str(values, "project") ?? "");
    const refs = str(values, "refs");
    if (refs === undefined) fail("需要 --refs（逗号分隔的 library: 引用；空字符串清空）");
    setKit(
      project,
      refs
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    );
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
      let id = str(values, "id") ?? "";
      const file = str(values, "file");
      if (kind === "method") {
        fail("方法用 weaver method add --label <名称> --text <何时用> --expand fixed|list [--scenes id:role,...]");
      }
      if (isMaterialKind(kind) && values.library && !id) {
        id = allocateNewMaterial(kind, str(values, "label") ?? "", root).id;
      }
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
    if (sub === "set") {
      if (!values.library) fail("用法: weaver asset set --library --id <id> [--label] [--text] [--expand] [--scenes]");
      const id = str(values, "id") ?? "";
      if (!id) fail("需要 --id");
      const current = loadLibrary(root).find((item) => item.id === id);
      if (!current) fail(`找不到库资产 ${id}`);
      if (current.kind === "voice") {
        print(updateLibraryVoice(id, { label: str(values, "label"), text: str(values, "text") }, root));
        return;
      }
      if (current.kind === "method") {
        print(
          updateLibraryMethod(
            id,
            {
              label: str(values, "label"),
              text: str(values, "text"),
              expand: str(values, "expand") ? parseMethodExpand(str(values, "expand")) : undefined,
              scenes: str(values, "scenes") ? parseMethodScenes(str(values, "scenes")) : undefined,
            },
            root,
          ),
        );
        return;
      }
      if (isMaterialKind(current.kind)) {
        print(updateLibraryMaterial(id, { label: str(values, "label") }, root));
        return;
      }
      print(
        patchLibraryAsset(
          id,
          { label: str(values, "label"), text: str(values, "text"), style: str(values, "style") },
          root,
        ),
      );
      return;
    }
    if (sub === "rm") {
      if (!values.library) fail("用法: weaver asset rm --library --id <id> 或 --label <名称>");
      const id = str(values, "id");
      const label = str(values, "label");
      const assets = loadLibrary(root);
      const asset = id
        ? assets.find((item) => item.id === id)
        : label
          ? assets.find((item) => (item.label ?? item.id).trim() === label.trim())
          : undefined;
      if (!asset) fail("用法: weaver asset rm --library --id <id> 或 --label <名称>");
      const removed = removeLibraryAsset(asset.id, root);
      print({ ok: true, id: removed.id, label: removed.label ?? removed.id });
      return;
    }
    fail(`用法: weaver asset list|add|set|rm（kind: ${ASSET_KINDS.join(", ")}）`);
  }

  if (command === "method") {
    const sub = rest[0];
    if (sub === "list" || !sub) {
      print({ ok: true, methods: listLibraryMethods(root) });
      return;
    }
    if (sub === "add") {
      try {
        print(
          createLibraryMethod(
            {
              label: str(values, "label") ?? "",
              text: str(values, "text") ?? "",
              expand: parseMethodExpand(str(values, "expand")),
              scenes: str(values, "scenes") ? parseMethodScenes(str(values, "scenes")) : undefined,
            },
            root,
          ),
        );
      } catch (error) {
        fail(error instanceof Error ? error.message : String(error));
      }
      return;
    }
    if (sub === "set") {
      const method = findLibraryMethod(str(values, "id"), undefined, root);
      if (!method) fail("用法: weaver method set --id <id> [--label] [--text] [--expand] [--scenes]");
      try {
        print(
          updateLibraryMethod(
            method.id,
            {
              label: str(values, "label"),
              text: str(values, "text"),
              expand: str(values, "expand") ? parseMethodExpand(str(values, "expand")) : undefined,
              scenes: str(values, "scenes") ? parseMethodScenes(str(values, "scenes")) : undefined,
            },
            root,
          ),
        );
      } catch (error) {
        fail(error instanceof Error ? error.message : String(error));
      }
      return;
    }
    if (sub === "rm") {
      const method = findLibraryMethod(str(values, "id"), str(values, "label"), root);
      if (!method) fail("用法: weaver method rm --id <id> 或 --label <名称>");
      const removed = removeLibraryAsset(method.id, root);
      print({ ok: true, id: removed.id, label: removed.label ?? removed.id });
      return;
    }
    fail("用法: weaver method list|add|set|rm");
  }

  if (command === "recipe") {
    const sub = rest[0];
    if (sub === "list" || !sub) {
      const recipes = listRecipes(root, str(values, "task")).map(summarizeRecipe);
      print({ ok: true, recipes });
      return;
    }
    if (sub === "show") {
      const id = rest[1];
      if (!id) fail("用法: weaver recipe show <id>");
      try {
        const recipe = loadRecipe(id, root);
        if (wantJson) {
          const { body: _body, ...catalog } = recipe;
          print({ ok: true, ...catalog });
        } else {
          print(formatRecipe(recipe));
        }
      } catch (error) {
        fail(error instanceof Error ? error.message : String(error));
      }
      return;
    }
    if (sub === "use") {
      const project = requireProject(str(values, "project") ?? "");
      const recipeId = str(values, "recipe");
      if (recipeId === undefined) fail("用法: weaver recipe use --project <id> --recipe <id>（空字符串清空）");
      setFilmRecipe(project, recipeId, root);
      print(envelope(project, root));
      return;
    }
    if (sub === "apply") {
      const project = requireProject(str(values, "project") ?? "");
      const recipeId = str(values, "recipe") ?? "";
      if (!recipeId) fail("用法: weaver recipe apply --project <id> --recipe <id> [--items a,b,c]");
      const split = (key: string) =>
        (str(values, key) ?? "")
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean);
      try {
        const { skipped } = applyRecipe(project, recipeId, { items: split("items"), kinds: split("kinds") }, root);
        print({ ...envelope(project, root), skipped });
      } catch (error) {
        fail(error instanceof Error ? error.message : String(error), 2);
      }
      return;
    }
    fail("用法: weaver recipe list|show|use|apply");
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
    if (values.seed) fail("铸库请在 Studio /voices 听完再收。出片 tts 不改参考声，不要加 --seed");
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
            root,
          }),
        );
      } catch (error) {
        failed = true;
        console.error(error instanceof Error ? error.message : error);
      }
    }
    if (!attempted.length) fail("没有可合成的项目", 2);
    if (failed) fail(projectId ? "tts 失败" : "部分项目 tts 失败", 2);
    print(projectId ? results[0] : results);
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
  weaver method list|add|set|rm
  weaver recipe list|show|use|apply
  weaver scene list|add|rm|move|set
  weaver card set
  weaver voice set|asr
  weaver langs set
  weaver kit set
  weaver asset list|add|set|rm
  weaver validate [id]
  weaver capture [--project]
  weaver publish --project
  weaver sync
  weaver tts [--project]
  weaver render [--project]`);
}

main();
