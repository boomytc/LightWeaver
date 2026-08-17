import type { Asset } from "../types";

export type MethodShape = "kinds" | "problem-then-rule";

export function recipeIdOfMethod(asset: { id: string }): string {
  return asset.id.replace(/^method\./, "");
}

export function methodShapeOf(asset?: Pick<Asset, "shape">): MethodShape {
  return asset?.shape === "kinds" ? "kinds" : "problem-then-rule";
}

export function methodShapeName(shape: MethodShape): string {
  return shape === "kinds" ? "一种模型一场" : "问题 → 规则 → 对照";
}

/** 人看的名称。片子上存的是 apply id。 */
export function methodLabel(
  library: Array<Pick<Asset, "id" | "kind" | "label">>,
  recipeId?: string,
): string {
  if (!recipeId) return "";
  const wanted = recipeIdOfMethod({ id: recipeId });
  const asset = library.find((item) => item.kind === "method" && recipeIdOfMethod(item) === wanted);
  return (asset?.label ?? "").trim();
}
