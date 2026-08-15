import fs from "node:fs";
import type { FilmDoc, Issue, ProjectRecord } from "./schema.ts";
import { isSceneKind, parseAssetRef } from "./schema.ts";
import { findAsset, resolveAssetFile } from "./assets.ts";
import { listProjects, loadProject } from "./project.ts";
import { weaverRoot } from "./paths.ts";

export function validateProject(project: ProjectRecord, root = weaverRoot()): Issue[] {
  const issues: Issue[] = [];
  const { film } = project;
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
    } else if (!parseAssetRef(voiceRef) || !findAsset(project, voiceRef, root)) {
      issues.push(err(`voices.${locale}`, `找不到音色 ${voiceRef}`));
    } else {
      const resolved = resolveAssetFile(project, voiceRef, locale, root);
      if (!resolved || !fs.existsSync(resolved.absPath)) {
        issues.push(warn(`voices.${locale}`, `音色文件不存在：${voiceRef}`));
      }
    }
  }

  for (const scene of film.scenes) {
    const base = `scenes.${scene.id}`;
    if (!isSceneKind(scene.kind)) issues.push(err(base, `未知场景 kind：${scene.kind}`));
    for (const locale of locales) {
      const line = scene.lines?.[locale]?.trim() ?? "";
      if (!line) issues.push(err(`${base}.lines.${locale}`, "缺旁白"));
    }
    if (scene.kind === "still") {
      if (!scene.still) {
        issues.push(err(`${base}.still`, "静帧场景需要 still 资产引用"));
      } else if (!parseAssetRef(scene.still) || !findAsset(project, scene.still, root)) {
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

  return issues;
}

export function validateWorkspace(root = weaverRoot(), id?: string): { project: string; issues: Issue[] }[] {
  const projects = id ? [loadProject(id, root)] : listProjects(root);
  return projects.map((project) => ({ project: project.id, issues: validateProject(project, root) }));
}

export function hasErrors(issues: Issue[]): boolean {
  return issues.some((issue) => issue.level === "error");
}

function err(path: string, message: string): Issue {
  return { level: "error", path, message };
}

function warn(path: string, message: string): Issue {
  return { level: "warning", path, message };
}

export function assertFilmShape(film: FilmDoc): void {
  if (!film.id || !film.scenes) throw new Error("film.json 不完整");
}
