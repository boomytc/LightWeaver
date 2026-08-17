import { roleLabel } from "./labels";
import type { RecipeCard } from "../types";

export type MethodShape = "kinds" | "problem-then-rule";

export function recipeIdOfMethod(asset: { id: string }): string {
  return asset.id.replace(/^method\./, "");
}

export function methodShapeKind(recipe?: Pick<RecipeCard, "requires_kinds">): MethodShape {
  return recipe?.requires_kinds ? "kinds" : "problem-then-rule";
}

export function methodShapeName(shape: MethodShape): string {
  return shape === "kinds" ? "一种模型一场" : "问题然后规则";
}

/** 给人看的骨架。不写 scene id、不写 apply。 */
export function methodShape(recipe: RecipeCard): string {
  if (recipe.requires_kinds) return methodShapeName("kinds");
  const scenes = recipe.default_scenes ?? [];
  const roles = scenes.map((scene) => roleLabel(scene.role)).filter(Boolean);
  if (roles.length) return roles.join(" → ");
  return scenes.map((scene) => scene.id).join(" → ") || methodShapeName("problem-then-rule");
}
