import fs from "node:fs";
import path from "node:path";

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
