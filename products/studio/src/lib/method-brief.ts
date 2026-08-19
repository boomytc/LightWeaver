import { methodExpandOf, type Asset, type MethodExpand } from "@lightweaver/weaver/schema";
import { recipeIdOf } from "@lightweaver/weaver/method";

export type { MethodExpand };
export { methodExpandOf };
export { recipeIdOf };

export function methodExpandName(expand: MethodExpand): string {
  return expand === "list" ? "清单一项一场" : "固定场次";
}

export function roleLabel(role?: string): string {
  if (role === "problem") return "问题";
  if (role === "rule") return "规则";
  if (role === "contrast") return "对照";
  return role ?? "";
}

export function methodPlanLine(asset: Pick<Asset, "expand" | "scenes">): string {
  if (methodExpandOf(asset) === "list") return methodExpandName("list");
  const scenes = asset.scenes ?? [];
  const bits = scenes.map((scene) => roleLabel(scene.role) || scene.id).filter(Boolean);
  return bits.join(" → ") || methodExpandName("fixed");
}

/** 人看的名称。片子上存的是 apply id。 */
export function methodLabel(
  library: Array<Pick<Asset, "id" | "kind" | "label">>,
  recipeId?: string,
): string {
  if (!recipeId) return "";
  const wanted = recipeIdOf(recipeId);
  const asset = library.find((item) => item.kind === "method" && recipeIdOf(item.id) === wanted);
  return (asset?.label ?? "").trim();
}
