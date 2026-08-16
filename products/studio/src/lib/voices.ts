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

export const VOICE_CLONE_KEY = "clone";

export type VoiceClip = { file: string; said: string };

export type VoiceParts = {
  clone?: VoiceClip;
  preview?: VoiceClip;
  instruct: string;
};

function clipOf(file?: string, said?: string): VoiceClip | undefined {
  return file ? { file, said: (said ?? "").trim() } : undefined;
}

/** 克隆源只认 files.clone。其余 wav（含旧的 files.zh/en）都是试听。 */
export function voiceParts(asset?: Asset): VoiceParts {
  if (!asset) return { instruct: "" };
  const instruct = (asset.style || asset.styles?.zh || asset.styles?.en || "").trim();
  const clone = clipOf(asset.files?.[VOICE_CLONE_KEY], asset.texts?.[VOICE_CLONE_KEY]);
  let preview = clipOf(asset.file, asset.text);
  if (!preview) {
    const entry = Object.entries(asset.files ?? {}).find(([key, file]) => key !== VOICE_CLONE_KEY && file);
    if (entry) preview = clipOf(entry[1], asset.texts?.[entry[0]] ?? asset.text);
  }
  return { clone, preview, instruct };
}

export function voiceHifiRef(asset?: Asset): VoiceClip | undefined {
  const parts = voiceParts(asset);
  return parts.preview ?? parts.clone;
}

export function filmVoiceRef(voices: Record<string, string> | undefined): string {
  return [...new Set(Object.values(voices ?? {}).filter(Boolean))][0] ?? "";
}
