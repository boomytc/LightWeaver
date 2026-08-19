import fs from "node:fs";
import { err, filmLangs, filmTask, isImplementedTask, parseAssetRef, type Issue, type ProjectRecord, warn } from "./schema.ts";
import { findAsset, resolveAssetFile, resolveVoicePrompt, voiceHifiRef } from "./assets.ts";
import { listProjects, loadProject } from "./project.ts";
import { weaverRoot } from "./paths.ts";
import { assertFilmMethod } from "./recipes.ts";
import { taskAllowsKind, tryGetTask } from "./tasks/registry.ts";

export function validateProject(project: ProjectRecord, root = weaverRoot()): Issue[] {
  const issues: Issue[] = [];
  const { film } = project;
  const taskId = filmTask(film);
  if (!isImplementedTask(taskId) || !tryGetTask(taskId)) {
    issues.push(err("task", `未知任务类型：${taskId}`));
  }

  const locales = filmLangs(film);
  if (!Object.keys(film.locales).length) issues.push(err("locales", "至少需要一个 locale"));
  if (!locales.length) issues.push(err("langs", "至少选一种要出的语言"));

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
    const voiceRef = film.voices[locale] ?? film.voices[Object.keys(film.voices)[0] ?? ""];
    if (!voiceRef) {
      issues.push(warn(`voices.${locale}`, "未指定音色"));
    } else if (!findAsset(project, voiceRef, root)) {
      issues.push(err(`voices.${locale}`, `找不到音色 ${voiceRef}`));
    } else {
      const resolved = resolveVoicePrompt(project, voiceRef, locale, root);
      if (!resolved) {
        issues.push(warn(`voices.${locale}`, `还没有克隆源 wav：${voiceRef}`));
      } else if (!voiceHifiRef(findAsset(project, voiceRef, root))?.said) {
        issues.push(warn(`voices.${locale}`, `缺文本：${voiceRef}。上传会自动转写，或 weaver voice asr --id`));
      }
    }
  }

  const voiceRefs = [...new Set(locales.map((locale) => film.voices[locale]).filter(Boolean))];
  if (voiceRefs.length > 1) {
    issues.push(warn("voices", "要出的几种语言必须用同一套音色，不要拆开点"));
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
      assertFilmMethod(film.recipe, root);
    } catch (error) {
      issues.push(err("recipe", error instanceof Error ? error.message : `找不到方法卡 ${film.recipe}`));
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
    const taskForScene = tryGetTask(taskId);
    if (taskForScene?.frame.expandableKinds.includes(scene.kind)) {
      if (!scene.still) {
        issues.push(err(`${base}.still`, "可展开场需要 still 资产引用"));
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

export function isRenderable(project: ProjectRecord, root = weaverRoot()): boolean {
  if (hasErrors(validateProject(project, root))) return false;
  const task = tryGetTask(filmTask(project.film));
  return task?.isReadyToRender?.(project, root) ?? true;
}

export function isCompletedFilm(project: ProjectRecord, root = weaverRoot()): boolean {
  return tryGetTask(filmTask(project.film))?.isComplete?.(project, root) ?? false;
}

export function validateWorkspace(root = weaverRoot(), id?: string): { project: string; issues: Issue[] }[] {
  const projects = id ? [loadProject(id, root)] : listProjects(root);
  return projects.map((project) => ({ project: project.id, issues: validateProject(project, root) }));
}

export function hasErrors(issues: Issue[]): boolean {
  return issues.some((issue) => issue.level === "error");
}
