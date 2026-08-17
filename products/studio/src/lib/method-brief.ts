import { compactWhen, roleLabel } from "./labels";
import type { RecipeCard } from "../types";

export function methodShape(recipe: RecipeCard): string {
  if (recipe.requires_kinds) return "一种模型一场，kinds 由下一张片子提供";
  const scenes = recipe.default_scenes ?? [];
  if (!scenes.length) return "";
  return scenes
    .map((scene) => {
      const role = roleLabel(scene.role);
      return role ? `${scene.id}（${role}）` : scene.id;
    })
    .join(" → ");
}

export function methodApplyLine(recipe: RecipeCard): string {
  if (recipe.requires_kinds) {
    return `weaver recipe apply --project <id> --recipe ${recipe.id} --kinds <从 kinds.ts 读，逗号分隔>`;
  }
  return `weaver recipe apply --project <id> --recipe ${recipe.id}`;
}

export function buildMethodBrief(recipe: RecipeCard): string {
  const lines = [
    `方法卡：${recipe.id}（${recipe.title}）。下一张同类片子复用这张卡，不要另写骨架。`,
    `任务：${recipe.task}`,
    `何时：${compactWhen(recipe.when) || "未写"}`,
  ];
  const shape = methodShape(recipe);
  if (shape) lines.push(`骨架：${shape}`);
  if (recipe.requires_kinds) {
    lines.push("用法：从该 study 的 kinds.ts 读 KindId，一种 kind 一场，不要合并。");
  } else {
    lines.push("用法：按骨架铺场。还要加场就 scene add，不要改这张卡。");
  }
  lines.push(`  ${methodApplyLine(recipe)}`);
  lines.push("片子是实例。这张卡是可复用方法。");
  lines.push("成片写到该片子在 data/ 下的 assets/outputs/，不要写 products/study-films/。位置没点名就先问人。");
  return `${lines.join("\n")}\n`;
}
