import fs from "node:fs";
import path from "node:path";
import type { Asset, AssetDoc, FilmDoc, ProjectRecord, ProjectSource } from "./schema.ts";
import { filmLangs, filmStudySlug, filmTask, normalizeFilm } from "./schema.ts";
import { firstPartyRoot, projectRoots, userRoot, weaverRoot } from "./paths.ts";
import { atomicWriteJson, readJson } from "./io.ts";
import { resolveTask } from "./tasks/registry.ts";

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
    for (const name of fs.readdirSync(dir).sort()) {
      const projectDir = path.join(dir, name);
      if (!fs.statSync(projectDir).isDirectory()) continue;
      if (!fs.existsSync(filmPath(projectDir))) continue;
      found.push(loadProjectAt(projectDir, source));
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
  return { id: film.id, source, root: dir, film, assets };
}

export function saveFilm(project: ProjectRecord, film: FilmDoc): void {
  if (film.id !== project.id) throw new Error("不能改项目 id");
  const next = normalizeFilm(film);
  atomicWriteJson(filmPath(project.root), next);
  project.film = next;
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
  const parent = source === "first-party" ? firstPartyRoot(root) : userRoot(root);
  const dir = path.join(parent, id);
  const film = resolveTask(options.task).createFilm(
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
