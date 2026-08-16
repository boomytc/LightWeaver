import fs from "node:fs";
import { err, filmTask, isImplementedTask, parseAssetRef, type Issue, type ProjectRecord, warn } from "./schema.ts";
import { findAsset, resolveAssetFile } from "./assets.ts";
import { listProjects, loadProject } from "./project.ts";
import { weaverRoot } from "./paths.ts";
import { loadRecipe } from "./recipes.ts";
import { taskAllowsKind, tryGetTask } from "./tasks/registry.ts";

export function validateProject(project: ProjectRecord, root = weaverRoot()): Issue[] {
  const issues: Issue[] = [];
  const { film } = project;
  const taskId = filmTask(film);
  if (!isImplementedTask(taskId) || !tryGetTask(taskId)) {
    issues.push(err("task", `未知任务类型：${taskId}`));
  }

  const locales = Object.keys(film.locales);
  if (!locales.length) issues.push(err("locales", "至少需要一个 locale"));

  const sceneIds = film.scenes.map((scene) => scene.id);
  if (new Set(sceneIds).size !== sceneIds.length) {
    issues.push(err("scenes", "场景 id 重复"));
  }

  const outputs = new Set<string>();
  for (const locale of locales) {
    const copy = film.locales[locale];
    if (!copy?.title) issues.push(err(`locales.${locale}.title`, "缺标题"));
    if (!copy?.output) issues.push(err(`locales.${locale}.output`, "缺成片文件名"));
    if (copy?.output) {
      if (outputs.has(copy.output)) issues.push(err(`locales.${locale}.output`, `成片文件名重复 ${copy.output}`));
      outputs.add(copy.output);
    }
    const voiceRef = film.voices[locale];
    if (!voiceRef) {
      issues.push(warn(`voices.${locale}`, "未指定音色"));
    } else if (!findAsset(project, voiceRef, root)) {
      issues.push(err(`voices.${locale}`, `找不到音色 ${voiceRef}`));
    } else {
      const resolved = resolveAssetFile(project, voiceRef, locale, root);
      if (!resolved || !fs.existsSync(resolved.absPath)) {
        issues.push(warn(`voices.${locale}`, `音色文件不存在：${voiceRef}`));
      }
    }
  }

  for (const [index, ref] of (film.kit ?? []).entries()) {
    const parsed = parseAssetRef(ref);
    const path = `kit.${index}`;
    if (!parsed || parsed.scope !== "library") {
      issues.push(err(path, `必须是 library: 引用：${ref}`));
      continue;
    }
    const asset = findAsset(project, ref, root);
    if (!asset) {
      issues.push(err(path, `找不到素材 ${ref}`));
      continue;
    }
    if (asset.kind !== "element" && asset.kind !== "reference") {
      issues.push(err(path, `kit 只能放元素或参考图，不能放 ${asset.kind}`));
    }
  }

  if (film.recipe) {
    try {
      const recipe = loadRecipe(film.recipe, root);
      if (recipe.level !== "film") {
        issues.push(err("recipe", `只能点名成片方法卡，${film.recipe} 是 ${recipe.level} 卡`));
      }
    } catch {
      issues.push(err("recipe", `找不到方法卡 ${film.recipe}`));
    }
  }

  for (const scene of film.scenes) {
    const base = `scenes.${scene.id}`;
    if (!taskAllowsKind(taskId, scene.kind)) {
      issues.push(err(base, `未知场景 kind：${scene.kind}`));
    }
    for (const locale of locales) {
      const line = scene.lines?.[locale]?.trim() ?? "";
      if (!line) issues.push(err(`${base}.lines.${locale}`, "缺旁白"));
    }
    if (scene.kind === "still") {
      if (!scene.still) {
        issues.push(err(`${base}.still`, "静帧场景需要 still 资产引用"));
      } else if (!findAsset(project, scene.still, root)) {
        issues.push(err(`${base}.still`, `找不到静帧 ${scene.still}`));
      } else {
        for (const locale of locales) {
          const resolved = resolveAssetFile(project, scene.still, locale, root);
          if (!resolved || !fs.existsSync(resolved.absPath)) {
            issues.push(warn(`${base}.still.${locale}`, `静帧文件不存在：${scene.still}`));
          }
        }
      }
    }
    if (scene.kind === "title" && !film.locales[locales[0] ?? ""]?.titleCard?.headline) {
      issues.push(warn(`${base}`, "片头缺少 headline"));
    }
    for (const locale of locales) {
      const lineRef = `asset:line.${scene.id}.${locale}`;
      const lineAsset = findAsset(project, lineRef, root);
      if (!lineAsset) {
        issues.push(warn(`${base}.line.${locale}`, "尚未合成旁白 wav"));
        continue;
      }
      const resolved = resolveAssetFile(project, lineRef, locale, root);
      if (!resolved || !fs.existsSync(resolved.absPath)) {
        issues.push(warn(`${base}.line.${locale}`, "旁白 wav 文件缺失"));
      }
    }
  }

  const task = tryGetTask(taskId);
  if (task) issues.push(...task.validate(project, root));
  return issues;
}

export function everyStillPngExists(project: ProjectRecord, root = weaverRoot()): boolean {
  const locales = Object.keys(project.film.locales);
  for (const scene of project.film.scenes) {
    if (scene.kind !== "still") continue;
    if (!scene.still) return false;
    for (const locale of locales) {
      const resolved = resolveAssetFile(project, scene.still, locale, root);
      if (!resolved || !fs.existsSync(resolved.absPath)) return false;
    }
  }
  return project.film.scenes.some((scene) => scene.kind === "still");
}

export function isRenderable(project: ProjectRecord, root = weaverRoot()): boolean {
  if (hasErrors(validateProject(project, root))) return false;
  return everyStillPngExists(project, root);
}

export function isCompletedFilm(project: ProjectRecord, root = weaverRoot()): boolean {
  return project.film.capture?.kind === "lightui-lab" && everyStillPngExists(project, root);
}

export function validateWorkspace(root = weaverRoot(), id?: string): { project: string; issues: Issue[] }[] {
  const projects = id ? [loadProject(id, root)] : listProjects(root);
  return projects.map((project) => ({ project: project.id, issues: validateProject(project, root) }));
}

export function hasErrors(issues: Issue[]): boolean {
  return issues.some((issue) => issue.level === "error");
}
