import fs from "node:fs";
import path from "node:path";
import { loadLibrary } from "./assets.ts";
import { recipeIdOf } from "./method.ts";
import { err, isOstMode, methodNeedsOf, type Issue, type ProjectRecord } from "./schema.ts";

export function assertMethodGates(project: ProjectRecord, root: string): Issue[] {
  const recipe = project.film.recipe?.trim();
  if (!recipe) return [];
  const wanted = recipeIdOf(recipe);
  const asset = loadLibrary(root).find((item) => item.kind === "method" && recipeIdOf(item.id) === wanted);
  if (!asset) return [];

  const issues: Issue[] = [];
  for (const need of methodNeedsOf(asset)) {
    if (need === "match-report") {
      const abs = path.join(project.root, "assets/match/report.json");
      if (!fs.existsSync(abs)) issues.push(err("recipe.needs.match-report", "需要 weaver match 写出匹配报告"));
      continue;
    }
    if (need === "description") {
      const found = project.assets.some(
        (item) => item.kind === "description" && item.file && fs.existsSync(path.join(project.root, item.file)),
      );
      if (!found) issues.push(err("recipe.needs.description", "需要 weaver describe 写出描述树"));
      continue;
    }
    if (need === "transcript") {
      const found = project.assets.some(
        (item) => item.kind === "transcript" && item.file && fs.existsSync(path.join(project.root, item.file)),
      );
      if (!found) issues.push(err("recipe.needs.transcript", "需要 weaver transcribe 写出转写"));
    }
  }

  if (asset.clipOst && isOstMode(asset.clipOst)) {
    for (const scene of project.film.scenes) {
      if (scene.kind !== "clip") continue;
      if (scene.ost !== asset.clipOst) {
        issues.push(err(`scenes.${scene.id}.ost`, `方法卡要求 ost 为 ${asset.clipOst}`));
      }
    }
  }
  return issues;
}
