import fs from "node:fs";
import path from "node:path";
import { findAsset, lineRelPath, resolveAssetFile } from "../assets.ts";
import {
  err,
  filmLangs,
  isOstMode,
  sceneNeedsLine,
  type FilmDoc,
  type Issue,
  type ProjectRecord,
  warn,
} from "../schema.ts";
import type { CreateFilmInput, TaskModule } from "./types.ts";

export const footageNarration: TaskModule = {
  id: "footage-narration",
  recipePack: "footage-narration",
  renderer: "compose",
  surface: "clips",
  label: { zh: "原片解说", en: "Footage narration" },
  sceneKinds: ["clip"],
  frame: {
    pinnedKinds: [],
    expandableKinds: ["clip"],
    minExpandable: 1,
    seedPlaceholderId: "cut-01",
  },
  createFilm,
  validate: validateFootageNarration,
  isReadyToRender: originAndLinesReady,
};

function createFilm(input: CreateFilmInput): FilmDoc {
  const title = input.title ?? input.id;
  return {
    id: input.id,
    task: "footage-narration",
    brand: input.brand ?? "LightWeaver",
    voices: {
      zh: "library:voice.prompt",
      en: "library:voice.prompt",
    },
    capture: { kind: "manual" },
    locales: {
      zh: { title, output: input.output ?? `${input.id}.mp4` },
      en: { title, output: input.outputEn ?? `${input.id}.en.mp4` },
    },
    scenes: [
      {
        id: "cut-01",
        kind: "clip",
        ost: "narration",
        lines: { zh: "cut-01", en: "cut-01" },
      },
    ],
  };
}

function validateFootageNarration(project: ProjectRecord, root: string): Issue[] {
  const issues: Issue[] = [];
  const { film } = project;
  const locales = filmLangs(film);
  const clips = film.scenes.filter((scene) => scene.kind === "clip");
  if (clips.length < 1) issues.push(err("scenes", "至少一场 clip"));

  for (const scene of film.scenes) {
    const base = `scenes.${scene.id}`;
    if (!isOstMode(scene.ost)) {
      issues.push(err(`${base}.ost`, "ost 必须是 narration / original / mix"));
    }
    if (!scene.source) {
      issues.push(err(`${base}.source`, "clip 需要源视频引用"));
    } else {
      const asset = findAsset(project, scene.source, root);
      if (!asset) {
        issues.push(err(`${base}.source`, `找不到源视频 ${scene.source}`));
      } else if (asset.kind !== "video") {
        issues.push(err(`${base}.source`, `源必须是 video，不能是 ${asset.kind}`));
      } else {
        const resolved = resolveAssetFile(project, scene.source, locales[0], root);
        if (!resolved || !fs.existsSync(resolved.absPath)) {
          issues.push(warn(`${base}.source`, `源视频文件不存在：${scene.source}`));
        }
      }
    }
    if (typeof scene.in !== "number" || typeof scene.out !== "number" || !Number.isFinite(scene.in) || !Number.isFinite(scene.out)) {
      issues.push(err(`${base}.in`, "clip 需要 in / out（秒）"));
    } else if (scene.in < 0) {
      issues.push(err(`${base}.in`, "in 不能为负"));
    } else if (scene.in >= scene.out) {
      issues.push(err(`${base}.in`, "in 必须小于 out"));
    }

    for (const locale of locales) {
      const line = scene.lines?.[locale]?.trim() ?? "";
      if (sceneNeedsLine(scene) && !line) {
        issues.push(err(`${base}.lines.${locale}`, "解说场需要旁白"));
      }
      if (!sceneNeedsLine(scene)) continue;
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

function originAndLinesReady(project: ProjectRecord, root: string): boolean {
  const locales = filmLangs(project.film);
  for (const scene of project.film.scenes) {
    if (scene.kind !== "clip") continue;
    if (!scene.source) return false;
    const resolved = resolveAssetFile(project, scene.source, locales[0], root);
    if (!resolved || !fs.existsSync(resolved.absPath)) return false;
    if (!sceneNeedsLine(scene)) continue;
    for (const locale of locales) {
      const wav = path.join(project.root, lineRelPath(scene.id, locale));
      if (!fs.existsSync(wav)) return false;
    }
  }
  return project.film.scenes.some((scene) => scene.kind === "clip");
}
