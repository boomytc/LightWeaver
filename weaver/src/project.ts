import fs from "node:fs";
import path from "node:path";
import type { Asset, AssetDoc, FilmDoc, ProjectRecord, ProjectSource } from "./schema.ts";
import { TASK_IDS, filmLangs, filmStudySlug, filmTask, normalizeFilm } from "./schema.ts";
import { UNSET_RECIPE, instanceRoot, projectRoots, weaverRoot, workspaceRootOf } from "./paths.ts";
import { atomicWriteJson, readJson } from "./io.ts";
import { resolveTask } from "./tasks/registry.ts";
import { recipeIdOf } from "./method.ts";

export function recipeFolder(recipe?: string): string {
  return recipeIdOf(recipe ?? "") || UNSET_RECIPE;
}

export function filmPath(root: string): string {
  return path.join(root, "film.json");
}

export function assetsPath(root: string): string {
  return path.join(root, "assets.json");
}

export function listProjects(root = weaverRoot()): ProjectRecord[] {
  const found: ProjectRecord[] = [];
  for (const { source, dir } of projectRoots(root)) {
    if (!fs.existsSync(dir)) continue;
    for (const task of TASK_IDS) {
      const taskDir = path.join(dir, task);
      if (!fs.existsSync(taskDir) || !fs.statSync(taskDir).isDirectory()) continue;
      for (const recipe of fs.readdirSync(taskDir).sort()) {
        const recipeDir = path.join(taskDir, recipe);
        if (!fs.statSync(recipeDir).isDirectory()) continue;
        for (const name of fs.readdirSync(recipeDir).sort()) {
          const projectDir = path.join(recipeDir, name);
          if (!fs.statSync(projectDir).isDirectory()) continue;
          if (!fs.existsSync(filmPath(projectDir))) continue;
          found.push(loadProjectAt(projectDir, source));
        }
      }
    }
  }
  return found;
}

export function loadProject(id: string, root = weaverRoot()): ProjectRecord {
  const match = listProjects(root).find((project) => project.id === id);
  if (!match) throw new Error(`找不到项目 ${id}`);
  return match;
}

export function loadProjectAt(dir: string, source: ProjectSource): ProjectRecord {
  const film = normalizeFilm(readJson<FilmDoc>(filmPath(dir)));
  const assets = fs.existsSync(assetsPath(dir)) ? readJson<AssetDoc>(assetsPath(dir)).assets : [];
  if (film.id !== path.basename(dir)) {
    throw new Error(`项目目录 ${path.basename(dir)} 与 film.id ${film.id} 不一致`);
  }
  const folderRecipe = path.basename(path.dirname(dir));
  const folderTask = path.basename(path.dirname(path.dirname(dir)));
  const task = filmTask(film);
  if (folderTask !== task) {
    throw new Error(`项目 ${film.id} 在 ${folderTask}/ 下，与 film.task ${task} 不一致`);
  }
  const wantedRecipe = recipeFolder(film.recipe);
  if (folderRecipe !== wantedRecipe) {
    throw new Error(`项目 ${film.id} 在 ${folderRecipe}/ 下，与 film.recipe ${wantedRecipe} 不一致`);
  }
  return { id: film.id, source, root: dir, film, assets };
}

export function saveFilm(project: ProjectRecord, film: FilmDoc): void {
  if (film.id !== project.id) throw new Error("不能改项目 id");
  const next = normalizeFilm(film);
  atomicWriteJson(filmPath(project.root), next);
  project.film = next;
  relocateProject(project);
}

function relocateProject(project: ProjectRecord): void {
  const root = workspaceRootOf(project.root);
  const dest = instanceRoot(
    project.source,
    filmTask(project.film),
    recipeFolder(project.film.recipe),
    project.id,
    root,
  );
  if (path.resolve(project.root) === path.resolve(dest)) return;
  if (fs.existsSync(dest)) throw new Error(`项目目录已存在：${dest}`);
  const from = project.root;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.renameSync(from, dest);
  project.root = dest;
  pruneEmptyDir(path.dirname(from));
}

function pruneEmptyDir(dir: string): void {
  try {
    if (fs.readdirSync(dir).length === 0) fs.rmdirSync(dir);
  } catch {
    /* leave it */
  }
}

export function saveAssets(project: ProjectRecord, assets: Asset[]): void {
  atomicWriteJson(assetsPath(project.root), { assets });
  project.assets = assets;
}

export function createProject(
  id: string,
  options: {
    title?: string;
    source?: ProjectSource;
    brand?: string;
    task?: string;
    studySlug?: string;
    output?: string;
    outputEn?: string;
  } = {},
  root = weaverRoot(),
): ProjectRecord {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) {
    throw new Error("项目 id 必须是 kebab-case");
  }
  if (listProjects(root).some((project) => project.id === id)) {
    throw new Error(`项目已存在：${id}`);
  }
  const source = options.source ?? "user";
  const task = resolveTask(options.task);
  const dir = instanceRoot(source, task.id, recipeFolder(), id, root);
  const film = task.createFilm(
    {
      id,
      title: options.title,
      brand: options.brand,
      studySlug: options.studySlug,
      source,
      output: options.output,
      outputEn: options.outputEn,
    },
    root,
  );
  fs.mkdirSync(path.join(dir, "assets"), { recursive: true });
  atomicWriteJson(filmPath(dir), normalizeFilm(film));
  atomicWriteJson(assetsPath(dir), { assets: [] });
  return loadProjectAt(dir, source);
}

export function projectSummary(project: ProjectRecord) {
  return {
    id: project.id,
    source: project.source,
    root: project.root,
    brand: project.film.brand,
    task: filmTask(project.film),
    studySlug: filmStudySlug(project.film),
    locales: Object.keys(project.film.locales),
    langs: filmLangs(project.film),
    scenes: project.film.scenes.length,
    assets: project.assets.length,
    voices: project.film.voices,
    kit: project.film.kit ?? [],
    recipe: project.film.recipe,
    titles: Object.fromEntries(
      Object.entries(project.film.locales).map(([locale, copy]) => [locale, copy.title]),
    ),
  };
}
