import path from "node:path";

export function safeJoin(root: string, rel: string): string {
  const base = path.resolve(root);
  const resolved = path.resolve(base, rel);
  if (resolved !== base && !resolved.startsWith(base + path.sep)) {
    throw new Error("路径越界");
  }
  return resolved;
}
