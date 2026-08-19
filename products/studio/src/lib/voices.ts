import {
  voiceCloneSource,
  voiceHifiRef,
  voiceSetId,
  type VoiceClip,
  type VoiceClone,
  type VoiceOrigin,
} from "@lightweaver/weaver/voices";
import type { Asset } from "../types";

export { voiceCloneSource, voiceHifiRef, voiceSetId, type VoiceClip, type VoiceClone, type VoiceOrigin };

export function listVoicePacks(assets: Asset[]): Asset[] {
  const groups = new Map<string, Asset>();
  for (const asset of assets.filter((item) => item.kind === "voice")) {
    const id = voiceSetId(asset);
    const current = groups.get(id);
    if (!current || asset.files) groups.set(id, asset);
  }
  return [...groups.values()];
}

export function voiceFile(asset: Asset, locale: string): string | undefined {
  return asset.files?.[locale] ?? (asset.locale === locale ? asset.file : undefined) ?? asset.file;
}

export function filmVoiceRef(voices: Record<string, string> | undefined): string {
  return [...new Set(Object.values(voices ?? {}).filter(Boolean))][0] ?? "";
}
