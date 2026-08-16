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

export type VoiceOrigin = "upload" | "instruct";

export type VoiceClip = { file: string; said: string };

export type VoiceClone = {
  file?: string;
  said: string;
  instruct: string;
  origin: VoiceOrigin;
};

/** 一套声只有一支克隆源。有 instruct 就是铸出来的；没有就是上传的。 */
export function voiceCloneSource(asset?: Asset): VoiceClone {
  if (!asset) return { said: "", instruct: "", origin: "instruct" };
  const instruct = (asset.style || asset.styles?.zh || asset.styles?.en || "").trim();
  let file = asset.file;
  let said = (asset.text ?? "").trim();
  if (!file) {
    const entry = Object.entries(asset.files ?? {}).find(([, item]) => item);
    if (entry) {
      file = entry[1];
      said = (asset.texts?.[entry[0]] ?? said).trim();
    }
  }
  return { file, said, instruct, origin: instruct ? "instruct" : "upload" };
}

/** 出片 Hi-Fi 用的那支克隆源。 */
export function voiceHifiRef(asset?: Asset): VoiceClip | undefined {
  const source = voiceCloneSource(asset);
  return source.file ? { file: source.file, said: source.said } : undefined;
}

/** 出片用的那支 wav。VoxCPM2 不按语言标签分流。 */
export function resolveVoicePrompt(
  project: ProjectRecord | null,
  ref: AssetRef,
  _locale?: Locale,
  root = weaverRoot(),
) {
  const parsed = parseAssetRef(ref);
  const asset = findAsset(project, ref, root);
  if (!parsed || !asset) return null;
  const relPath = voiceHifiRef(asset)?.file;
  if (!relPath) return null;
  const scopeRoot = parsed.scope === "library" ? libraryRoot(root) : project!.root;
  const absPath = path.join(scopeRoot, relPath);
  if (!fs.existsSync(absPath)) return null;
  return { asset, relPath, scopeRoot, absPath };
}

export function voiceStyle(asset: Asset, locale?: string): string {
  if (locale && asset.styles?.[locale]) return asset.styles[locale] ?? "";
  if (locale && asset.locale === locale && asset.style) return asset.style;
  return asset.styles?.zh ?? asset.styles?.en ?? asset.style ?? "";
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
    texts?: Record<string, string>;
    style?: string;
    styles?: Record<string, string>;
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
    texts: input.texts,
    style: input.style,
    styles: input.styles,
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

export function voiceCloneText(asset: Asset, locale?: string): string {
  if (locale && asset.texts?.[locale]) return asset.texts[locale] ?? "";
  if (locale && asset.locale === locale && asset.text) return asset.text;
  return asset.text ?? "";
}

export function voiceSetId(asset: Asset): string {
  if (asset.files && (asset.files.zh || asset.files.en) && !asset.locale) return asset.id;
  return asset.id.replace(/[.-](zh|en)$/i, "") || asset.id;
}

export type VoiceSet = {
  id: string;
  label: string;
  ref: string;
  asset: Asset;
  locales: string[];
};

export function listVoiceSets(assets: Asset[]): VoiceSet[] {
  const groups = new Map<string, Asset[]>();
  for (const asset of assets.filter((item) => item.kind === "voice")) {
    const id = voiceSetId(asset);
    const bucket = groups.get(id) ?? [];
    bucket.push(asset);
    groups.set(id, bucket);
  }
  return [...groups.entries()].map(([id, members]) => {
    const primary = members.find((item) => item.files && (item.files.zh || item.files.en)) ?? members[0]!;
    const locales = new Set<string>();
    for (const member of members) {
      if (member.locale) locales.add(member.locale);
      for (const locale of Object.keys(member.files ?? {})) locales.add(locale);
    }
    return {
      id,
      label: primary.label ?? id,
      ref: `library:${primary.id}`,
      asset: primary,
      locales: [...locales],
    };
  });
}

export function patchLibraryAsset(
  id: string,
  patch: {
    label?: string;
    text?: string;
    style?: string;
    locale?: string;
    texts?: Record<string, string>;
    styles?: Record<string, string>;
  },
  root = weaverRoot(),
): Asset {
  const assets = loadLibrary(root);
  const current = assets.find((item) => item.id === id);
  if (!current) throw new Error(`找不到库资产 ${id}`);
  const packed = Boolean(current.files && Object.keys(current.files).length > 1);
  const texts = { ...(current.texts ?? {}) };
  const styles = { ...(current.styles ?? {}) };
  if (patch.texts) Object.assign(texts, patch.texts);
  if (patch.styles) Object.assign(styles, patch.styles);
  if (patch.locale && patch.text !== undefined) texts[patch.locale] = patch.text;
  if (patch.locale && patch.style !== undefined) styles[patch.locale] = patch.style;
  const next: Asset = {
    ...current,
    label: patch.label ?? current.label,
    text: patch.text ?? current.text,
    style: patch.style ?? current.style,
    locale: packed ? undefined : (patch.locale ?? current.locale),
    texts: Object.keys(texts).length ? texts : current.texts,
    styles: Object.keys(styles).length ? styles : current.styles,
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
