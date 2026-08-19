import fs from "node:fs";
import path from "node:path";
import { libraryRoot, weaverRoot } from "./paths.ts";
import { loadLibrary, upsertLibraryAsset } from "./assets.ts";
import { methodNameOf, recipeIdOf } from "./method.ts";
import { resolveTask } from "./tasks/registry.ts";
import {
  isMethodExpand,
  methodExpandOf,
  type Asset,
  type MethodExpand,
  type MethodScene,
} from "./schema.ts";

const ID_RE = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;

export function parseMethodExpand(value: unknown): MethodExpand {
  if (value === "固定" || value === "固定场次") return "fixed";
  if (value === "清单" || value === "一项一场" || value === "清单一项一场") return "list";
  if (isMethodExpand(value)) return value;
  throw new Error("铺场只能是固定场次，或清单一项一场");
}

export function parseMethodScenes(value: unknown): MethodScene[] {
  if (value === undefined || value === null || value === "") return [];
  if (typeof value === "string") {
    return normalizeMethodScenes(
      value
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean)
        .map((part) => {
          const [id, role] = part.split(":").map((item) => item.trim());
          return { id: id ?? "", role: role || undefined };
        }),
    );
  }
  if (!Array.isArray(value)) throw new Error("场次必须是列表");
  return normalizeMethodScenes(value);
}

export function normalizeMethodScenes(value: unknown[]): MethodScene[] {
  const scenes: MethodScene[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const id = String(row.id ?? "").trim();
    if (!id) continue;
    if (!ID_RE.test(id)) throw new Error(`场次 id 必须是 dotted/kebab 小写：${id}`);
    const role = typeof row.role === "string" && row.role.trim() ? row.role.trim() : undefined;
    const fit = row.fit === "cover" || row.fit === "contain" ? row.fit : "contain";
    const kind = typeof row.kind === "string" && row.kind.trim() ? row.kind.trim() : undefined;
    scenes.push({ id, role, fit, kind });
  }
  return scenes;
}

export { methodNameOf };

export function methodIdFromName(name: string, taken: string[] = []): string {
  const ascii = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const base =
    ascii && ID_RE.test(ascii) ? (ascii.startsWith("method.") ? ascii : `method.${ascii}`) : "method.pack";
  if (!taken.includes(base)) return base;
  for (let n = 2; n < 1000; n++) {
    const next = `${base}-${n}`;
    if (!taken.includes(next)) return next;
  }
  throw new Error("无法分配方法 id");
}

function methodsIn(root: string): Asset[] {
  return loadLibrary(root).filter((item) => item.kind === "method");
}

function methodRel(recipeId: string, taskId?: string): string {
  const pack = resolveTask(taskId).recipePack;
  return path.posix.join("methods", pack, `${recipeId}.md`);
}

function serializeMethodFile(input: {
  title: string;
  when: string;
  expand: MethodExpand;
  scenes: MethodScene[];
}): string {
  const when = input.when.trim();
  const plan =
    input.expand === "list"
      ? "铺场：清单一项一场"
      : [
          "铺场：固定场次",
          ...input.scenes.map((scene) => (scene.role ? `- ${scene.id}（${scene.role}）` : `- ${scene.id}`)),
        ].join("\n");
  return `# ${input.title}\n\n${when}\n\n${plan}\n`;
}

function writeMethodFile(rel: string, input: Parameters<typeof serializeMethodFile>[0], root: string): void {
  const dest = path.join(libraryRoot(root), rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, serializeMethodFile(input));
}

export function createLibraryMethod(
  input: { label: string; text: string; expand: MethodExpand; scenes?: unknown; task?: string },
  root = weaverRoot(),
): Asset {
  const label = input.label.trim();
  const text = input.text.trim();
  if (!label) throw new Error("先写名称");
  if (!text) throw new Error("先写何时用");
  const task = resolveTask(input.task);
  const expand = parseMethodExpand(input.expand);
  const scenes = expand === "list" ? [] : parseMethodScenes(input.scenes);
  if (expand === "fixed" && scenes.length === 0) throw new Error("固定场次至少写一场");
  const existing = methodsIn(root);
  if (existing.some((item) => methodNameOf(item) === label)) throw new Error(`${label} 已在方法库里`);
  const id = methodIdFromName(label, existing.map((item) => item.id));
  const recipeId = recipeIdOf(id);
  const rel = methodRel(recipeId, task.id);
  writeMethodFile(rel, { title: label, when: text, expand, scenes }, root);
  return upsertLibraryAsset(
    {
      id,
      kind: "method",
      label,
      text,
      file: rel,
      task: task.id,
      expand,
      scenes: expand === "fixed" ? scenes : undefined,
    },
    root,
  );
}

export function updateLibraryMethod(
  id: string,
  patch: { label?: string; text?: string; expand?: MethodExpand; scenes?: unknown },
  root = weaverRoot(),
): Asset {
  const current = loadLibrary(root).find((item) => item.id === id);
  if (!current) throw new Error(`找不到库资产 ${id}`);
  if (current.kind !== "method") throw new Error(`${id} 不是方法`);
  const label = patch.label !== undefined ? patch.label.trim() : methodNameOf(current);
  const text = patch.text !== undefined ? patch.text.trim() : (current.text ?? "").trim();
  if (!label) throw new Error("先写名称");
  if (!text) throw new Error("先写何时用");
  const clash = methodsIn(root).find((item) => item.id !== id && methodNameOf(item) === label);
  if (clash) throw new Error(`${label} 已在方法库里`);
  const expand = patch.expand !== undefined ? parseMethodExpand(patch.expand) : methodExpandOf(current);
  const scenes =
    expand === "list"
      ? []
      : patch.scenes !== undefined
        ? parseMethodScenes(patch.scenes)
        : (current.scenes ?? []);
  if (expand === "fixed" && scenes.length === 0) throw new Error("固定场次至少写一场");
  const recipeId = recipeIdOf(id);
  const task = resolveTask(current.task);
  const rel = current.file || methodRel(recipeId, task.id);
  writeMethodFile(rel, { title: label, when: text, expand, scenes }, root);
  return upsertLibraryAsset({
    ...current,
    label,
    text,
    file: rel,
    task: task.id,
    expand,
    scenes: expand === "fixed" ? scenes : undefined,
  }, root);
}

export function listLibraryMethods(root = weaverRoot()): Array<{
  id: string;
  recipe: string;
  label: string;
  text: string;
  expand: MethodExpand;
  scenes: MethodScene[];
}> {
  return methodsIn(root).map((item) => ({
    id: item.id,
    recipe: recipeIdOf(item.id),
    label: methodNameOf(item),
    text: (item.text ?? "").trim(),
    expand: methodExpandOf(item),
    scenes: item.scenes ?? [],
  }));
}
