import fs from "node:fs";
import path from "node:path";
import type { ProjectRecord } from "./schema.ts";
import { filmStudySlug, filmTask } from "./schema.ts";
import { labUrl, libraryRoot, lightuiRoot, recipeRoot, weaverRoot } from "./paths.ts";
import { tryGetTask } from "./tasks/registry.ts";
import { assetsPath, filmPath } from "./project.ts";
import { lineRelPath, outputRelPath, resolveAssetFile, stillRelPath } from "./assets.ts";

/** 项目外路径（brief.files）。不要依赖 rel。 */
export type PathEntry = { path: string; exists: boolean; rel?: string };

/** 项目内媒体。rel 必填，供 projectMedia(id, rel) / /api/media。 */
export type MediaPath = { path: string; exists: boolean; rel: string };

export type MediaFile = MediaPath & {
  sceneId: string;
  locale: string;
  ref?: string;
};

export type ProjectPaths = {
  projectRoot: string;
  film: string;
  assetsDoc: string;
  stillFiles: MediaFile[];
  lineFiles: MediaFile[];
  outputFiles: Record<string, MediaPath>;
  library: string;
  recipes: string;
  labUrl?: string;
  publishDir?: string;
  brief:
    | { kind: "study"; root: string; files: Record<string, PathEntry> }
    | { kind: "project-brief"; files: { brief: PathEntry; briefEn: PathEntry } }
    | { kind: "hybrid"; root?: string; files: Record<string, PathEntry> };
};

function posixRel(rel: string): string {
  return rel.replaceAll("\\", "/");
}

function entry(abs: string): PathEntry {
  return { path: abs, exists: fs.existsSync(abs) };
}

function media(abs: string, rel: string): MediaPath {
  return { path: abs, rel: posixRel(rel), exists: fs.existsSync(abs) };
}

function studyFiles(studyRoot: string): Record<string, PathEntry> {
  return {
    idea: entry(path.join(studyRoot, "idea.md")),
    ideaEn: entry(path.join(studyRoot, "idea.en.md")),
    study: entry(path.join(studyRoot, "study.json")),
    kinds: entry(path.join(studyRoot, "src/lib/kinds.ts")),
    sourceMd: entry(path.join(studyRoot, "references/SOURCE.md")),
  };
}

function projectBriefFiles(projectRoot: string): { brief: PathEntry; briefEn: PathEntry } {
  return {
    brief: entry(path.join(projectRoot, "brief.md")),
    briefEn: entry(path.join(projectRoot, "brief.en.md")),
  };
}

function stillFileId(ref: string | undefined, sceneId: string): string {
  if (!ref) return sceneId;
  return ref.match(/^asset:still\.(.+)$/)?.[1] ?? sceneId;
}

export function projectPaths(
  project: ProjectRecord,
  root = weaverRoot(),
  env: NodeJS.ProcessEnv = process.env,
): ProjectPaths {
  const { film } = project;
  const slug = filmStudySlug(film);
  const task = filmTask(film);
  const locales = Object.keys(film.locales);
  const uiRoot = lightuiRoot(root, env);

  const stillFiles: MediaFile[] = [];
  const expandableKinds = tryGetTask(task)?.frame.expandableKinds ?? [];
  for (const scene of film.scenes) {
    if (!expandableKinds.includes(scene.kind)) continue;
    for (const locale of locales) {
      const ref = scene.still;
      const resolved = ref ? resolveAssetFile(project, ref, locale, root) : null;
      if (resolved) {
        stillFiles.push({
          sceneId: scene.id,
          locale,
          ref,
          rel: posixRel(resolved.relPath),
          path: resolved.absPath,
          exists: fs.existsSync(resolved.absPath),
        });
        continue;
      }
      const rel = stillRelPath(`${stillFileId(ref, scene.id)}.png`, locale);
      stillFiles.push({
        sceneId: scene.id,
        locale,
        ...(ref ? { ref } : {}),
        rel,
        path: path.join(project.root, rel),
        exists: fs.existsSync(path.join(project.root, rel)),
      });
    }
  }

  const lineFiles: MediaFile[] = [];
  for (const scene of film.scenes) {
    for (const locale of locales) {
      const rel = lineRelPath(scene.id, locale);
      lineFiles.push({
        sceneId: scene.id,
        locale,
        rel,
        path: path.join(project.root, rel),
        exists: fs.existsSync(path.join(project.root, rel)),
      });
    }
  }

  const outputFiles: Record<string, MediaPath> = {};
  for (const locale of locales) {
    const file = film.locales[locale]?.output;
    if (!file) continue;
    const rel = outputRelPath(file);
    outputFiles[locale] = media(path.join(project.root, rel), rel);
  }

  let brief: ProjectPaths["brief"];
  if (!uiRoot) {
    brief = { kind: "project-brief", files: projectBriefFiles(project.root) };
  } else if (project.source === "first-party") {
    const studyRoot = path.join(uiRoot, "studies", slug ?? film.id);
    brief = { kind: "study", root: studyRoot, files: studyFiles(studyRoot) };
  } else if (slug) {
    const studyRoot = path.join(uiRoot, "studies", slug);
    brief = {
      kind: "hybrid",
      root: studyRoot,
      files: { ...studyFiles(studyRoot), ...projectBriefFiles(project.root) },
    };
  } else {
    brief = { kind: "project-brief", files: projectBriefFiles(project.root) };
  }

  return {
    projectRoot: project.root,
    film: filmPath(project.root),
    assetsDoc: assetsPath(project.root),
    stillFiles,
    lineFiles,
    outputFiles,
    library: libraryRoot(root),
    recipes: path.join(recipeRoot(root), tryGetTask(task)?.recipePack ?? task),
    labUrl: uiRoot && slug ? `${labUrl(env)}/s/${slug}` : undefined,
    publishDir: film.publish?.dir,
    brief,
  };
}
