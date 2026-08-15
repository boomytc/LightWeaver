import fs from "node:fs";
import path from "node:path";
import { recipeRoot, weaverRoot } from "./paths.ts";
import { isImplementedTask, isStudyRole, type StudyRole, type TaskId } from "./schema.ts";
import { listTasks, tryGetTask } from "./tasks/registry.ts";

export type RecipeLevel = "film" | "scene";

export type RecipeSceneStub = {
  id: string;
  kind: string;
  role?: StudyRole;
  still?: string;
  fit?: "cover" | "contain";
};

export type Recipe = {
  id: string;
  task: TaskId;
  level: RecipeLevel;
  when: string;
  canon?: string[];
  requires_kinds?: boolean;
  default_scenes?: RecipeSceneStub[];
  path: string;
  body: string;
};

export type RecipeSummary = Omit<Recipe, "body" | "default_scenes">;

const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function splitFrontmatter(text: string): { raw: string; body: string } | null {
  if (!text.startsWith("---")) return null;
  const lines = text.split(/\r?\n/);
  if (lines[0]?.trim() !== "---") return null;
  const end = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
  if (end < 0) return null;
  return {
    raw: lines.slice(1, end).join("\n"),
    body: lines.slice(end + 1).join("\n").replace(/^\n+/, ""),
  };
}

function unquote(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function parseScalar(raw: string): string | boolean {
  const value = unquote(raw.trim());
  if (value === "true") return true;
  if (value === "false") return false;
  return value;
}

function parseInlineObject(raw: string): Record<string, string> | null {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return null;
  const inner = trimmed.slice(1, -1).trim();
  if (!inner) return {};
  const out: Record<string, string> = {};
  for (const part of inner.split(",")) {
    const colon = part.indexOf(":");
    if (colon < 0) return null;
    const key = part.slice(0, colon).trim();
    const value = unquote(part.slice(colon + 1).trim());
    if (!key) return null;
    out[key] = value;
  }
  return out;
}

function parseYaml(raw: string): Record<string, unknown> | null {
  const data: Record<string, unknown> = {};
  const lines = raw.split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    if (!line.trim() || line.trim().startsWith("#")) {
      i += 1;
      continue;
    }
    if (/^\s/.test(line)) return null;
    const match = /^([A-Za-z0-9_]+):\s*(.*)$/.exec(line);
    if (!match) return null;
    const key = match[1]!;
    const rest = match[2] ?? "";
    if (rest === "|") {
      const block: string[] = [];
      i += 1;
      while (i < lines.length && (/^\s+/.test(lines[i] ?? "") || (lines[i] ?? "").trim() === "")) {
        const current = lines[i] ?? "";
        block.push(current.replace(/^\s{2}/, ""));
        i += 1;
      }
      data[key] = block.join("\n").replace(/^\n+|\n+$/g, "");
      continue;
    }
    if (rest === "") {
      const items: unknown[] = [];
      i += 1;
      while (i < lines.length) {
        const item = lines[i] ?? "";
        if (!item.trim()) {
          i += 1;
          continue;
        }
        const list = /^\s+-\s+(.*)$/.exec(item);
        if (!list) break;
        const payload = list[1] ?? "";
        const inline = parseInlineObject(payload);
        if (inline) {
          items.push(inline);
          i += 1;
          continue;
        }
        if (payload.includes(":")) {
          const obj: Record<string, string> = {};
          const first = /^([A-Za-z0-9_]+):\s*(.*)$/.exec(payload);
          if (!first) return null;
          obj[first[1]!] = String(parseScalar(first[2] ?? ""));
          i += 1;
          while (i < lines.length) {
            const cont = /^\s{4,}([A-Za-z0-9_]+):\s*(.*)$/.exec(lines[i] ?? "");
            if (!cont) break;
            obj[cont[1]!] = String(parseScalar(cont[2] ?? ""));
            i += 1;
          }
          items.push(obj);
          continue;
        }
        items.push(parseScalar(payload));
        i += 1;
      }
      data[key] = items;
      continue;
    }
    data[key] = parseScalar(rest);
    i += 1;
  }
  return data;
}

function asStringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value.filter((item): item is string => typeof item === "string");
  return items.length === value.length ? items : undefined;
}

function asSceneStub(value: unknown, task: string): RecipeSceneStub | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string" || !row.id) return null;
  if (typeof row.kind !== "string" || !row.kind) return null;
  const module = tryGetTask(task);
  if (!module?.sceneKinds.includes(row.kind)) return null;
  let role: StudyRole | undefined;
  if (row.role !== undefined) {
    if (typeof row.role !== "string" || !isStudyRole(row.role)) return null;
    role = row.role;
  }
  let fit: "cover" | "contain" | undefined;
  if (row.fit !== undefined) {
    if (row.fit !== "cover" && row.fit !== "contain") return null;
    fit = row.fit;
  }
  return {
    id: row.id,
    kind: row.kind,
    still: typeof row.still === "string" ? row.still : undefined,
    role,
    fit,
  };
}

function recipeFromFile(file: string, expectedTask: string): Recipe | null {
  const name = path.basename(file);
  if (name === "index.md" || !name.endsWith(".md")) return null;
  let text: string;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    return null;
  }
  const split = splitFrontmatter(text);
  if (!split) return null;
  const data = parseYaml(split.raw);
  if (!data) return null;
  const id = data.id;
  const task = data.task;
  const level = data.level;
  const when = data.when;
  if (typeof id !== "string" || !ID_RE.test(id)) return null;
  if (id !== name.slice(0, -3)) return null;
  if (typeof task !== "string" || !isImplementedTask(task) || task !== expectedTask) return null;
  if (level !== "film" && level !== "scene") return null;
  if (typeof when !== "string" || !when.trim()) return null;
  let defaultScenes: RecipeSceneStub[] | undefined;
  if (data.default_scenes !== undefined) {
    if (!Array.isArray(data.default_scenes)) return null;
    defaultScenes = [];
    for (const item of data.default_scenes) {
      const stub = asSceneStub(item, task);
      if (!stub) return null;
      defaultScenes.push(stub);
    }
  }
  const recipe: Recipe = {
    id,
    task,
    level,
    when: when.trim(),
    path: file,
    body: split.body,
  };
  const canon = asStringList(data.canon);
  if (canon) recipe.canon = canon;
  if (typeof data.requires_kinds === "boolean") recipe.requires_kinds = data.requires_kinds;
  if (defaultScenes) recipe.default_scenes = defaultScenes;
  return recipe;
}

function taskDirs(root: string, task?: string): string[] {
  if (task !== undefined) {
    return isImplementedTask(task) ? [task] : [];
  }
  return listTasks().map((item) => item.id);
}

export function listRecipes(root = weaverRoot(), task?: string): Recipe[] {
  const base = recipeRoot(root);
  const found: Recipe[] = [];
  for (const id of taskDirs(root, task)) {
    const dir = path.join(base, id);
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) continue;
    for (const name of fs.readdirSync(dir)) {
      if (!name.endsWith(".md")) continue;
      const recipe = recipeFromFile(path.join(dir, name), id);
      if (recipe) found.push(recipe);
    }
  }
  found.sort((a, b) => a.task.localeCompare(b.task) || a.id.localeCompare(b.id));
  return found;
}

export function loadRecipe(id: string, root = weaverRoot()): Recipe {
  if (!ID_RE.test(id)) throw new Error(`非法 recipe id：${id}`);
  for (const recipe of listRecipes(root)) {
    if (recipe.id === id) return recipe;
  }
  throw new Error(`找不到 recipe：${id}`);
}

export function showRecipe(id: string, root = weaverRoot()): Recipe {
  return loadRecipe(id, root);
}

export function summarizeRecipe(recipe: Recipe): RecipeSummary {
  return {
    id: recipe.id,
    task: recipe.task,
    level: recipe.level,
    when: recipe.when,
    canon: recipe.canon,
    requires_kinds: recipe.requires_kinds,
    path: recipe.path,
  };
}
