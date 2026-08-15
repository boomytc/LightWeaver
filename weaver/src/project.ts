import fs from "node:fs";
import path from "node:path";
import type { Asset, AssetDoc, FilmDoc, ProjectRecord, ProjectSource } from "./schema.ts";
import { firstPartyRoot, projectRoots, userRoot, weaverRoot } from "./paths.ts";
import { atomicWriteJson, readJson } from "./io.ts";

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
  const film = readJson<FilmDoc>(filmPath(dir));
  const assets = fs.existsSync(assetsPath(dir)) ? readJson<AssetDoc>(assetsPath(dir)).assets : [];
  if (film.id !== path.basename(dir)) {
    throw new Error(`项目目录 ${path.basename(dir)} 与 film.id ${film.id} 不一致`);
  }
  return { id: film.id, source, root: dir, film, assets };
}

export function saveFilm(project: ProjectRecord, film: FilmDoc): void {
  if (film.id !== project.id) throw new Error("不能改项目 id");
  atomicWriteJson(filmPath(project.root), film);
  project.film = film;
}

export function saveAssets(project: ProjectRecord, assets: Asset[]): void {
  atomicWriteJson(assetsPath(project.root), { assets });
  project.assets = assets;
}

export function createProject(
  id: string,
  options: { title?: string; source?: ProjectSource; brand?: string } = {},
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
  const title = options.title ?? id;
  const brand = options.brand ?? "LightWeaver";
  const film: FilmDoc = {
    id,
    brand,
    voices: {
      zh: "library:voice.prompt-zh",
      en: "library:voice.prompt-en",
    },
    locales: {
      zh: {
        title,
        output: `${id}.mp4`,
        titleCard: { kicker: `${brand}  ·  Film`, headline: title, lede: "", tags: [] },
        closeCard: { headline: "说清楚", lede: "" },
      },
      en: {
        title,
        output: `${id}.en.mp4`,
        titleCard: { kicker: `${brand}  ·  Film`, headline: title, lede: "", tags: [] },
        closeCard: { headline: "Say it this way", lede: "" },
      },
    },
    scenes: [
      { id: "title", kind: "title", lines: { zh: title, en: title } },
      { id: "close", kind: "close", lines: { zh: "说清楚。", en: "Say it this way." } },
    ],
  };
  fs.mkdirSync(path.join(dir, "assets"), { recursive: true });
  atomicWriteJson(filmPath(dir), film);
  atomicWriteJson(assetsPath(dir), { assets: [] });
  return loadProjectAt(dir, source);
}

export function projectSummary(project: ProjectRecord) {
  return {
    id: project.id,
    source: project.source,
    root: project.root,
    brand: project.film.brand,
    locales: Object.keys(project.film.locales),
    scenes: project.film.scenes.length,
    assets: project.assets.length,
    titles: Object.fromEntries(
      Object.entries(project.film.locales).map(([locale, copy]) => [locale, copy.title]),
    ),
  };
}
