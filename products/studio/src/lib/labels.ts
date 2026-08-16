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

export function recipeHint(id: string): string {
  if (id === "taxonomy-parade") return "一种模型一场，最后点破容易混的一对。";
  if (id === "problem-then-rule") return "先讲会坏的那条，再讲规则。";
  return id;
}
