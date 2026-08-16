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
