import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

export function weaverRoot(): string {
  if (process.env.LIGHTWEAVER_ROOT) return path.resolve(process.env.LIGHTWEAVER_ROOT);
  return path.resolve(here, "../..");
}

export function libraryRoot(root = weaverRoot()): string {
  return path.join(root, "library");
}

export function recipeRoot(root = weaverRoot()): string {
  if (process.env.LIGHTWEAVER_RECIPES) return path.resolve(process.env.LIGHTWEAVER_RECIPES);
  return path.join(libraryRoot(root), "methods");
}

export function firstPartyRoot(root = weaverRoot()): string {
  return path.join(root, "data/first-party");
}

export function userRoot(root = weaverRoot()): string {
  return path.join(root, "data/projects");
}

export function instanceRel(source: "first-party" | "user", task: string, id: string): string {
  const tree = source === "first-party" ? "data/first-party" : "data/projects";
  return `${tree}/${task}/${id}`;
}

export function instanceRoot(
  source: "first-party" | "user",
  task: string,
  id: string,
  root = weaverRoot(),
): string {
  return path.join(source === "first-party" ? firstPartyRoot(root) : userRoot(root), task, id);
}

export function voiceCandidateRoot(root = weaverRoot()): string {
  return path.join(root, "data/voice-candidates");
}

export function filmsProductRoot(root = weaverRoot()): string {
  return path.join(root, "products/study-films");
}

/** 作业脚本在 weaver 包内，不跟 LIGHTWEAVER_ROOT。 */
export function weaverScriptsRoot(): string {
  return path.resolve(here, "../scripts");
}

export function lightuiRoot(_root = weaverRoot(), env: NodeJS.ProcessEnv = process.env): string | undefined {
  const override = (env.LIGHTUI_ROOT ?? "").trim();
  if (!override) return undefined;
  return path.resolve(override);
}

export function lightasrRoot(_root = weaverRoot(), env: NodeJS.ProcessEnv = process.env): string | undefined {
  const override = (env.LIGHTASR_ROOT ?? "").trim();
  if (!override) return undefined;
  return path.resolve(override);
}

export function labUrl(env: NodeJS.ProcessEnv = process.env): string {
  return env.LAB_URL ?? "http://127.0.0.1:5173";
}

export function requireLightuiRoot(root = weaverRoot(), env: NodeJS.ProcessEnv = process.env): string {
  const dest = lightuiRoot(root, env);
  if (!dest) {
    throw new Error("未设置 LIGHTUI_ROOT。发布或读取 LightUI 研究时请指向拷贝根目录。");
  }
  if (!fs.existsSync(dest)) {
    throw new Error(`发布目标不在 ${dest}。设置 LIGHTUI_ROOT 指向拷贝根目录。`);
  }
  return dest;
}

export function projectRoots(root = weaverRoot()): { source: "first-party" | "user"; dir: string }[] {
  return [
    { source: "first-party", dir: firstPartyRoot(root) },
    { source: "user", dir: userRoot(root) },
  ];
}
