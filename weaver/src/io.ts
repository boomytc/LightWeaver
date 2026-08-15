import fs from "node:fs";
import path from "node:path";

export function safeJoin(root: string, rel: string): string {
  const base = path.resolve(root);
  const resolved = path.resolve(base, rel);
  if (resolved !== base && !resolved.startsWith(base + path.sep)) {
    throw new Error("路径越界");
  }
  return resolved;
}

export function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, "utf8")) as T;
}

export function atomicWriteJson(file: string, data: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  fs.renameSync(tmp, file);
}

export function exists(file: string): boolean {
  return fs.existsSync(file);
}
