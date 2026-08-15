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

export function loadFilmSpecs() {
  const dir = path.join(filmsRoot, "films");
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => JSON.parse(fs.readFileSync(path.join(dir, name), "utf8")))
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function renderJobs(specs, only) {
  const jobs = [];
  for (const spec of specs) {
    for (const [locale, copy] of Object.entries(spec.locales ?? {})) {
      jobs.push({
        id: `${spec.id}-${locale}`,
        film: spec.id,
        locale,
        file: copy.output,
        publishDir: spec.publish?.dir,
      });
    }
  }
  if (!only) return jobs;
  const filtered = jobs.filter(
    (job) => job.id === only || job.film === only || job.locale === only,
  );
  return filtered;
}

export function requireLightuiRoot() {
  const root = lightuiRoot();
  if (!fs.existsSync(root)) {
    throw new Error(`LightUI 不在 ${root}。设置 LIGHTUI_ROOT 指向 LightUI 仓库根。`);
  }
  return root;
}
