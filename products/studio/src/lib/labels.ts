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
  if (kind === "method") return "方法";
  return kind;
}

export function sourceLabel(source: string): string {
  return source === "first-party" ? "data/first-party" : "data/projects";
}
