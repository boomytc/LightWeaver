import fs from "node:fs";
import path from "node:path";
import { libraryRoot, weaverRoot } from "./paths.ts";
import { loadLibrary, upsertLibraryAsset } from "./assets.ts";
import { recipeIdOf } from "./recipes.ts";
import { getTask } from "./tasks/registry.ts";
import type { Asset } from "./schema.ts";

export type MethodShape = "kinds" | "problem-then-rule";
export const METHOD_SHAPES = ["kinds", "problem-then-rule"] as const;

const ID_RE = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;

export function isMethodShape(value: unknown): value is MethodShape {
  return value === "kinds" || value === "problem-then-rule";
}

export function parseMethodShape(value: unknown): MethodShape {
  if (value === "一种模型一场") return "kinds";
  if (value === "问题然后规则") return "problem-then-rule";
  if (isMethodShape(value)) return value;
  throw new Error("骨架只能是一种模型一场，或问题然后规则");
}

export function methodNameOf(asset: Pick<Asset, "id" | "label">): string {
  return (asset.label ?? recipeIdOf(asset.id)).trim();
}

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

function methodRel(recipeId: string, root: string): string {
  const pack = getTask("study-explainer").recipePack;
  return path.posix.join("methods", pack, `${recipeId}.md`);
}

function serializeMethodFile(input: {
  recipeId: string;
  title: string;
  when: string;
  shape: MethodShape;
}): string {
  const when = input.when.trim();
  const whenBlock = when.includes("\n")
    ? `when: |\n${when.split("\n").map((line) => `  ${line}`).join("\n")}`
    : `when: ${JSON.stringify(when)}`;
  const shape =
    input.shape === "kinds"
      ? "requires_kinds: true"
      : [
          "default_scenes:",
          "  - id: problem",
          "    kind: still",
          "    role: problem",
          "    fit: contain",
          "  - id: rule",
          "    kind: still",
          "    role: rule",
          "    fit: contain",
          "  - id: contrast",
          "    kind: still",
          "    role: contrast",
          "    fit: contain",
        ].join("\n");
  return `---
id: ${input.recipeId}
task: study-explainer
level: film
${whenBlock}
${shape}
---

# ${input.title}
`;
}

function writeMethodFile(rel: string, input: Parameters<typeof serializeMethodFile>[0], root: string): void {
  const dest = path.join(libraryRoot(root), rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, serializeMethodFile(input));
}

export function createLibraryMethod(
  input: { label: string; text: string; shape: MethodShape },
  root = weaverRoot(),
): Asset {
  const label = input.label.trim();
  const text = input.text.trim();
  if (!label) throw new Error("先写名称");
  if (!text) throw new Error("先写何时用");
  const shape = parseMethodShape(input.shape);
  const existing = methodsIn(root);
  if (existing.some((item) => methodNameOf(item) === label)) throw new Error(`${label} 已在方法库里`);
  const id = methodIdFromName(label, existing.map((item) => item.id));
  const recipeId = recipeIdOf(id);
  const rel = methodRel(recipeId, root);
  writeMethodFile(rel, { recipeId, title: label, when: text, shape }, root);
  return upsertLibraryAsset({ id, kind: "method", label, text, file: rel }, root);
}

export function updateLibraryMethod(
  id: string,
  patch: { label?: string; text?: string; shape?: MethodShape },
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
  const recipeId = recipeIdOf(id);
  const rel = current.file || methodRel(recipeId, root);
  const shape = patch.shape !== undefined ? parseMethodShape(patch.shape) : inferShape(rel, root);
  writeMethodFile(rel, { recipeId, title: label, when: text, shape }, root);
  return upsertLibraryAsset({ ...current, label, text, file: rel }, root);
}

function inferShape(rel: string, root: string): MethodShape {
  const abs = path.join(libraryRoot(root), rel);
  if (!fs.existsSync(abs)) return "problem-then-rule";
  const raw = fs.readFileSync(abs, "utf8");
  return raw.includes("requires_kinds:") ? "kinds" : "problem-then-rule";
}
