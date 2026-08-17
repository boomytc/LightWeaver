import { loadLibrary, upsertLibraryAsset } from "./assets.ts";
import { weaverRoot } from "./paths.ts";
import type { Asset } from "./schema.ts";

const ID_RE = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;
const MATERIAL_KINDS = ["element", "reference"] as const;
export type MaterialKind = (typeof MATERIAL_KINDS)[number];

export function isMaterialKind(value: unknown): value is MaterialKind {
  return value === "element" || value === "reference";
}

export function materialNameOf(asset: Pick<Asset, "id" | "label">): string {
  return (asset.label ?? asset.id).trim();
}

export function materialIdFromName(kind: MaterialKind, name: string, taken: string[] = []): string {
  const ascii = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const prefix = `${kind}.`;
  const slug = ascii && ID_RE.test(ascii) ? ascii.replace(new RegExp(`^${kind}\\.`), "") : "pack";
  const base = `${prefix}${slug}`;
  if (!taken.includes(base)) return base;
  for (let n = 2; n < 1000; n++) {
    const next = `${base}-${n}`;
    if (!taken.includes(next)) return next;
  }
  throw new Error("无法分配素材 id");
}

function materialsIn(root: string): Asset[] {
  return loadLibrary(root).filter((item) => isMaterialKind(item.kind));
}

export function allocateNewMaterial(
  kind: MaterialKind,
  name: string,
  root = weaverRoot(),
): { id: string; label: string } {
  if (!isMaterialKind(kind)) throw new Error("素材只能是元素或参考图");
  const label = name.trim();
  if (!label) throw new Error("先写名称");
  const existing = materialsIn(root);
  if (existing.some((item) => materialNameOf(item) === label)) throw new Error(`${label} 已在素材库里`);
  return { id: materialIdFromName(kind, label, existing.map((item) => item.id)), label };
}

export function updateLibraryMaterial(
  id: string,
  patch: { label?: string },
  root = weaverRoot(),
): Asset {
  const current = loadLibrary(root).find((item) => item.id === id);
  if (!current) throw new Error(`找不到库资产 ${id}`);
  if (!isMaterialKind(current.kind)) throw new Error(`${id} 不是素材`);
  const label = patch.label !== undefined ? patch.label.trim() : materialNameOf(current);
  if (!label) throw new Error("先写名称");
  const clash = materialsIn(root).find((item) => item.id !== id && materialNameOf(item) === label);
  if (clash) throw new Error(`${label} 已在素材库里`);
  return upsertLibraryAsset({ ...current, label }, root);
}
