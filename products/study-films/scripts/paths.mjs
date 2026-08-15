import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

export const filmsRoot = path.resolve(here, "..");
export const weaverRoot = path.resolve(filmsRoot, "../..");

export function lightuiRoot() {
  return process.env.LIGHTUI_ROOT ?? path.resolve(weaverRoot, "../LightUI");
}

export function labUrl() {
  return process.env.LAB_URL ?? "http://127.0.0.1:5173";
}

export function requireLightuiRoot() {
  const dest = lightuiRoot();
  if (!fs.existsSync(dest)) {
    throw new Error(`LightUI 不在 ${dest}。设置 LIGHTUI_ROOT 指向 LightUI 仓库根。`);
  }
  return dest;
}
