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

export function voiceCandidateRoot(root = weaverRoot()): string {
  return path.join(root, "data/voice-candidates");
}

export function filmsProductRoot(root = weaverRoot()): string {
  return path.join(root, "products/study-films");
}

export function lightuiRoot(root = weaverRoot()): string {
  if (process.env.LIGHTUI_ROOT) return path.resolve(process.env.LIGHTUI_ROOT);
  return path.resolve(root, "../LightUI");
}

export function lightasrRoot(root = weaverRoot(), env: NodeJS.ProcessEnv = process.env): string {
  const override = (env.LIGHTASR_ROOT ?? "").trim();
  if (override) return path.resolve(override);
  return path.resolve(root, "../LightASR");
}

export function labUrl(): string {
  return process.env.LAB_URL ?? "http://127.0.0.1:5173";
}

export function requireLightuiRoot(root = weaverRoot()): string {
  const dest = lightuiRoot(root);
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
