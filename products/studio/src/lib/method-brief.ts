import { roleLabel } from "./labels";
import type { RecipeCard } from "../types";

/** 给人看的骨架。不写 scene id、不写 apply。 */
export function methodShape(recipe: RecipeCard): string {
  if (recipe.requires_kinds) return "一种模型一场";
  const scenes = recipe.default_scenes ?? [];
  const roles = scenes.map((scene) => roleLabel(scene.role)).filter(Boolean);
  if (roles.length) return roles.join(" → ");
  return scenes.map((scene) => scene.id).join(" → ");
}
