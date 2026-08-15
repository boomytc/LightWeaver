import { spawnSync } from "node:child_process";
import path from "node:path";
import { filmsProductRoot, weaverRoot } from "./paths.ts";
export function runCapture(options: { projectId?: string; locale?: string; root?: string }): void {
  const root = options.root ?? weaverRoot();
  const script = path.join(filmsProductRoot(root), "scripts/capture.mjs");
  const args = [script];
  if (options.projectId) args.push("--project", options.projectId);
  if (options.locale === "zh") args.push("--zh");
  if (options.locale === "en") args.push("--en");
  const result = spawnSync(process.execPath, args, { stdio: "inherit", env: process.env });
  if (result.status !== 0) {
    process.exit(result.status ?? 2);
  }
}
