import fs from "node:fs";
import path from "node:path";
import { BundledEngines } from "../contracts/index.ts";
import { currentPlatform, currentRuntime } from "../runtime.ts";

export function bundledEngines() {
  const runtime = currentRuntime();
  if (runtime.mode !== "production") return [];
  const file = path.join(runtime.resourcesDir, "bundled-engines.json");
  const manifest = BundledEngines.parse(JSON.parse(fs.readFileSync(file, "utf8")));
  if (manifest.platform !== currentPlatform())
    throw new Error("随包运行环境与当前平台不匹配");
  const root = path.dirname(runtime.resourcesDir);
  const resolve = (relative: string) => {
    if (path.isAbsolute(relative) || path.win32.isAbsolute(relative) ||
        relative.split(/[\\/]/).includes("..") || /[\u0000-\u001f\u007f]/.test(relative))
      throw new Error("随包运行环境路径必须位于应用资源内");
    const resolved = path.resolve(root, relative);
    if (fs.existsSync(resolved) && !fs.realpathSync(resolved).startsWith(fs.realpathSync(root) + path.sep))
      throw new Error("随包运行环境的符号链接越出应用资源");
    return resolved;
  };
  return manifest.components.map((component) => ({
    ...component,
    directory: resolve(component.directory),
    bindings: Object.fromEntries(Object.entries(component.bindings)
      .map(([key, relative]) => [key, resolve(relative)])),
  }));
}

export function bundledBinding(setting: string): string {
  return bundledEngines().find((component) => setting in component.bindings)
    ?.bindings[setting] || "";
}
