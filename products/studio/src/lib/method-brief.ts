import { roleLabel } from "./labels";
import type { Asset, RecipeCard } from "../types";

export type MethodShape = "kinds" | "problem-then-rule";

export function recipeIdOfMethod(asset: { id: string }): string {
  return asset.id.replace(/^method\./, "");
}

export function methodShapeKind(recipe?: Pick<RecipeCard, "requires_kinds">): MethodShape {
  return recipe?.requires_kinds ? "kinds" : "problem-then-rule";
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

/** 给人看的骨架。不写 scene id、不写 apply。 */
export function methodShape(recipe: RecipeCard): string {
  if (recipe.requires_kinds) return methodShapeName("kinds");
  const scenes = recipe.default_scenes ?? [];
  const roles = scenes.map((scene) => roleLabel(scene.role)).filter(Boolean);
  if (roles.length) return roles.join(" → ");
  return scenes.map((scene) => scene.id).join(" → ") || methodShapeName("problem-then-rule");
}
