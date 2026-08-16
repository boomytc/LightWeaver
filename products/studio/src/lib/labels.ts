import type { Asset } from "../types";

export function assetLabel(assets: Asset[], ref: string | undefined): string {
  if (!ref) return "未指定";
  const id = ref.replace(/^library:|^asset:/, "");
  const asset = assets.find((item) => item.id === id);
  return asset?.label ?? id;
}

export function kindLabel(kind: string): string {
  if (kind === "voice") return "音色";
  if (kind === "element") return "元素";
  if (kind === "reference") return "参考图";
  if (kind === "still") return "静帧";
  return kind;
}

export function sourceLabel(source: string): string {
  return source === "first-party" ? "顾客片" : "本机片";
}

export function compactWhen(when?: string): string {
  if (!when) return "";
  return when.split(/\n/).map((line) => line.trim()).filter(Boolean)[0] ?? "";
}

export function roleLabel(role?: string): string {
  if (role === "problem") return "问题";
  if (role === "rule") return "规则";
  if (role === "contrast") return "对照";
  return role ?? "";
}

export function recipeHint(recipe: { id: string; when?: string }): string {
  return compactWhen(recipe.when) || recipe.id;
}
