import type { Asset } from "../types";

export function voicePackId(asset: Asset): string {
  if (asset.files && (asset.files.zh || asset.files.en) && !asset.locale) return asset.id;
  return asset.id.replace(/[.-](zh|en)$/i, "") || asset.id;
}

export function listVoicePacks(assets: Asset[]): Asset[] {
  const groups = new Map<string, Asset>();
  for (const asset of assets.filter((item) => item.kind === "voice")) {
    const id = voicePackId(asset);
    const current = groups.get(id);
    if (!current || asset.files) groups.set(id, asset);
  }
  return [...groups.values()];
}

export function voiceFile(asset: Asset, locale: string): string | undefined {
  return asset.files?.[locale] ?? (asset.locale === locale ? asset.file : undefined) ?? asset.file;
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

export function voiceHifiRef(asset?: Asset): VoiceClip | undefined {
  const source = voiceCloneSource(asset);
  return source.file ? { file: source.file, said: source.said } : undefined;
}

export function filmVoiceRef(voices: Record<string, string> | undefined): string {
  return [...new Set(Object.values(voices ?? {}).filter(Boolean))][0] ?? "";
}
