import fs from "node:fs";
import path from "node:path";
import { currentRuntime } from "../runtime.ts";

export function defaultModelPython(
  platform: NodeJS.Platform = process.platform,
): string {
  return defaultVenvPython(".venv", platform);
}

export function defaultSpeechPython(
  platform: NodeJS.Platform = process.platform,
): string {
  return defaultVenvPython(".speech-venv", platform);
}

function defaultVenvPython(
  venv: ".venv" | ".speech-venv",
  platform: NodeJS.Platform,
): string {
  return platform === "win32"
    ? path.join("weaver", venv, "Scripts", "python.exe")
    : path.join("weaver", venv, "bin", "python");
}

export function resolveExecutable(value: string, root: string): string {
  if (!value) return "";
  const runtime = currentRuntime();
  const named = path.basename(value).toLowerCase();
  if (!/[\\/]/.test(value) || named === value.toLowerCase()) {
    if ((named === "ffmpeg" || named === "ffmpeg.exe") && runtime.tools.ffmpeg)
      return runtime.tools.ffmpeg;
    if ((named === "ffprobe" || named === "ffprobe.exe") && runtime.tools.ffprobe)
      return runtime.tools.ffprobe;
    if ((named === "python3" || named === "python" || named === "python3.exe" || named === "python.exe") && runtime.tools.python)
      return runtime.tools.python;
  }
  const candidates = /[\\/]/.test(value)
    ? executableCandidates(
        path.resolve(root, value.replace(/[\\/]/g, path.sep)),
      )
    : (process.env.PATH || "")
        .split(path.delimiter)
        .filter(Boolean)
        .flatMap((directory) =>
          executableCandidates(path.join(directory, value)),
        );
  return candidates.find(isExecutable) || "";
}

function executableCandidates(file: string): string[] {
  return process.platform === "win32" && !path.extname(file)
    ? [file, `${file}.exe`]
    : [file];
}

function isExecutable(file: string): boolean {
  try {
    fs.accessSync(file, fs.constants.X_OK);
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
}
