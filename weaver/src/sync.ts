import fs from "node:fs";
import path from "node:path";
import { filmsProductRoot, weaverRoot } from "./paths.ts";
import { listProjects } from "./project.ts";
import { atomicWriteJson } from "./io.ts";
import { filmTask } from "./schema.ts";
import { tryGetTask } from "./tasks/registry.ts";

export type CatalogEntry = {
  id: string;
  projectId: string;
  locale: string;
  title: string;
};

export function syncRemotion(root = weaverRoot()): { compositions: CatalogEntry[]; links: string[] } {
  const filmsRoot = filmsProductRoot(root);
  const publicDir = path.join(filmsRoot, "public/projects");
  const generatedDir = path.join(filmsRoot, "src/generated");
  fs.mkdirSync(publicDir, { recursive: true });
  fs.mkdirSync(generatedDir, { recursive: true });

  const wanted = new Set<string>();
  const compositions: CatalogEntry[] = [];
  const links: string[] = [];

  for (const project of listProjects(root)) {
    const task = tryGetTask(filmTask(project.film));
    if (task?.renderer !== "remotion") {
      if (!task) console.warn(`sync 跳过未知任务：${project.id} (${filmTask(project.film)})`);
      continue;
    }
    const link = path.join(publicDir, project.id);
    wanted.add(project.id);
    relink(link, project.root);
    links.push(link);
    for (const [locale, copy] of Object.entries(project.film.locales)) {
      compositions.push({
        id: `${project.id}-${locale}`,
        projectId: project.id,
        locale,
        title: copy.title,
      });
    }
  }

  for (const name of fs.readdirSync(publicDir)) {
    if (!wanted.has(name)) fs.rmSync(path.join(publicDir, name), { recursive: true, force: true });
  }

  atomicWriteJson(path.join(generatedDir, "catalog.json"), { compositions });
  return { compositions, links };
}

function relink(link: string, target: string): void {
  const absTarget = path.resolve(target);
  try {
    const stat = fs.lstatSync(link);
    if (stat.isSymbolicLink() && fs.realpathSync(link) === fs.realpathSync(absTarget)) return;
    fs.rmSync(link, { recursive: true, force: true });
  } catch {
    /* missing */
  }
  fs.symlinkSync(absTarget, link, "dir");
}
