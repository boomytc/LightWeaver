import fs from "node:fs";
import path from "node:path";
import type { Asset, AssetDoc, AssetKind, AssetRef, Locale, ProjectRecord } from "./schema.ts";
import { isAssetKind, parseAssetRef } from "./schema.ts";
import { libraryRoot, weaverRoot } from "./paths.ts";
import { atomicWriteJson, readJson } from "./io.ts";
import { saveAssets } from "./project.ts";

export function loadLibrary(root = weaverRoot()): Asset[] {
  const file = path.join(libraryRoot(root), "assets.json");
  if (!fs.existsSync(file)) return [];
  return readJson<AssetDoc>(file).assets;
}

export function saveLibrary(assets: Asset[], root = weaverRoot()): void {
  atomicWriteJson(path.join(libraryRoot(root), "assets.json"), { assets });
}

export function findAsset(
  project: ProjectRecord | null,
  ref: AssetRef,
  root = weaverRoot(),
): Asset | undefined {
  const parsed = parseAssetRef(ref);
  if (!parsed) return undefined;
  const pool = parsed.scope === "library" ? loadLibrary(root) : (project?.assets ?? []);
  return pool.find((asset) => asset.id === parsed.id);
}

export function resolveAssetFile(
  project: ProjectRecord | null,
  ref: AssetRef,
  locale?: Locale,
  root = weaverRoot(),
): { asset: Asset; absPath: string; relPath: string; scopeRoot: string } | null {
  const parsed = parseAssetRef(ref);
  const asset = findAsset(project, ref, root);
  if (!parsed || !asset) return null;
  const scopeRoot = parsed.scope === "library" ? libraryRoot(root) : project!.root;
  const relPath = (locale && asset.files?.[locale]) || asset.file;
  if (!relPath) return null;
  return { asset, relPath, scopeRoot, absPath: path.join(scopeRoot, relPath) };
}

export function remotionPublicPath(projectId: string, relPath: string): string {
  return `projects/${projectId}/${relPath.replace(/\\/g, "/")}`;
}

export function addAsset(
  target: { kind: "library" } | { kind: "project"; project: ProjectRecord },
  input: {
    id: string;
    kind: string;
    locale?: string;
    file?: string;
    files?: Record<string, string>;
    text?: string;
    style?: string;
    scene?: string;
    label?: string;
  },
  root = weaverRoot(),
): Asset {
  if (!isAssetKind(input.kind)) throw new Error(`未知资产 kind：${input.kind}`);
  if (!/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(input.id)) {
    throw new Error("资产 id 必须是 dotted/kebab 小写");
  }
  const asset: Asset = {
    id: input.id,
    kind: input.kind as AssetKind,
    locale: input.locale,
    file: input.file,
    files: input.files,
    text: input.text,
    style: input.style,
    scene: input.scene,
    label: input.label,
  };
  if (target.kind === "library") {
    const assets = loadLibrary(root);
    if (assets.some((item) => item.id === asset.id)) throw new Error(`库资产已存在：${asset.id}`);
    assets.push(asset);
    saveLibrary(assets, root);
    return asset;
  }
  if (target.project.assets.some((item) => item.id === asset.id)) {
    throw new Error(`项目资产已存在：${asset.id}`);
  }
  saveAssets(target.project, [...target.project.assets, asset]);
  return asset;
}

export function upsertLibraryAsset(asset: Asset, root = weaverRoot()): Asset {
  const assets = loadLibrary(root);
  saveLibrary([...assets.filter((item) => item.id !== asset.id), asset], root);
  return asset;
}

export function patchLibraryAsset(
  id: string,
  patch: { label?: string; text?: string; style?: string; locale?: string },
  root = weaverRoot(),
): Asset {
  const assets = loadLibrary(root);
  const current = assets.find((item) => item.id === id);
  if (!current) throw new Error(`找不到库资产 ${id}`);
  const next: Asset = {
    ...current,
    label: patch.label ?? current.label,
    text: patch.text ?? current.text,
    style: patch.style ?? current.style,
    locale: patch.locale ?? current.locale,
  };
  return upsertLibraryAsset(next, root);
}

export function upsertAsset(project: ProjectRecord, asset: Asset): void {
  const next = project.assets.filter((item) => item.id !== asset.id);
  next.push(asset);
  atomicWriteJson(path.join(project.root, "assets.json"), { assets: next });
  project.assets = next;
}

export function lineAssetId(sceneId: string, locale: Locale): string {
  return `line.${sceneId}.${locale}`;
}

export function lineRelPath(sceneId: string, locale: Locale): string {
  return path.posix.join("assets/lines", locale, `${sceneId}.wav`);
}

export function stillRelPath(name: string, locale: Locale): string {
  return path.posix.join("assets/stills", locale, name);
}

export function outputRelPath(file: string): string {
  return path.posix.join("assets/outputs", file);
}
