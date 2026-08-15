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

export function firstPartyRoot(root = weaverRoot()): string {
  return path.join(root, "products/study-films/projects");
}

export function userRoot(root = weaverRoot()): string {
  return path.join(root, "data/projects");
}

export function filmsProductRoot(root = weaverRoot()): string {
  return path.join(root, "products/study-films");
}

export function lightuiRoot(root = weaverRoot()): string {
  if (process.env.LIGHTUI_ROOT) return path.resolve(process.env.LIGHTUI_ROOT);
  return path.resolve(root, "../LightUI");
}

export function labUrl(): string {
  return process.env.LAB_URL ?? "http://127.0.0.1:5173";
}

export function requireLightuiRoot(root = weaverRoot()): string {
  const dest = lightuiRoot(root);
  if (!fs.existsSync(dest)) {
    throw new Error(`LightUI 不在 ${dest}。设置 LIGHTUI_ROOT 指向 LightUI 仓库根。`);
  }
  return dest;
}

export function projectRoots(root = weaverRoot()): { source: "first-party" | "user"; dir: string }[] {
  return [
    { source: "first-party", dir: firstPartyRoot(root) },
    { source: "user", dir: userRoot(root) },
  ];
}
