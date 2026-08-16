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

export type VoiceSlot = { key: string; file: string; said: string; primary: boolean };

export function voiceSlots(asset: Asset): VoiceSlot[] {
  const slots: VoiceSlot[] = [];
  for (const [key, file] of Object.entries(asset.files ?? {})) {
    if (file) slots.push({ key, file, said: asset.texts?.[key] ?? "", primary: false });
  }
  if (asset.file && !slots.some((slot) => slot.file === asset.file)) {
    slots.unshift({
      key: asset.locale || "main",
      file: asset.file,
      said: asset.text ?? "",
      primary: true,
    });
  }
  if (slots[0]) slots[0] = { ...slots[0], primary: true };
  return slots;
}

export function filmVoiceRef(voices: Record<string, string> | undefined): string {
  return [...new Set(Object.values(voices ?? {}).filter(Boolean))][0] ?? "";
}

export function slotLabel(key: string): string {
  if (key === "zh") return "中文";
  if (key === "en") return "英文";
  if (key === "main") return "主声";
  return key;
}
