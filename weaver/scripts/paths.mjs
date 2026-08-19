import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

export function weaverRoot() {
  if (process.env.LIGHTWEAVER_ROOT) return path.resolve(process.env.LIGHTWEAVER_ROOT);
  return path.resolve(here, "../..");
}

export function firstPartyRoot() {
  return process.env.LIGHTWEAVER_FIRST_PARTY
    ? path.resolve(process.env.LIGHTWEAVER_FIRST_PARTY)
    : path.join(weaverRoot(), "data/first-party");
}

export function labUrl() {
  return process.env.LAB_URL ?? "http://127.0.0.1:5173";
}
