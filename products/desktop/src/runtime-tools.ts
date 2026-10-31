import fs from "node:fs";
import path from "node:path";

export type RuntimeTools = {
  node: string;
  ffmpeg: string;
  ffprobe: string;
  supervisor: string;
  cardRenderer: string;
  cardBrowser: string;
  cardSite: string;
  python: string;
};

type ToolName = keyof RuntimeTools;
type ToolKind = "file" | "executable" | "directory";

const TOOLS: readonly [ToolName, ToolKind][] = [
  ["node", "executable"],
  ["ffmpeg", "executable"],
  ["ffprobe", "executable"],
  ["supervisor", "file"],
  ["cardRenderer", "file"],
  ["cardBrowser", "executable"],
  ["cardSite", "directory"],
  ["python", "executable"],
];

function inside(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return (
    relative === "" ||
    (!relative.startsWith(`..${path.sep}`) &&
      relative !== ".." &&
      !path.isAbsolute(relative))
  );
}

function resolveTool(root: string, name: ToolName, value: unknown): string {
  if (typeof value !== "string" || !value)
    throw new Error(`runtime-tools.json 缺少 ${name}`);
  if (
    path.isAbsolute(value) ||
    path.win32.isAbsolute(value) ||
    /[\u0000-\u001f\u007f]/.test(value) ||
    value.split(/[\\/]/).includes("..")
  )
    throw new Error(`runtime-tools.json 的 ${name} 必须位于资源根内`);
  const resolved = path.resolve(root, value);
  if (!inside(root, resolved))
    throw new Error(`runtime-tools.json 的 ${name} 越出资源根`);
  return resolved;
}

function validateTool(file: string, name: ToolName, kind: ToolKind): void {
  let stat: fs.Stats;
  try {
    stat = fs.statSync(file);
  } catch {
    throw new Error(`随包工具 ${name} 不存在`);
  }
  if (kind === "directory" && !stat.isDirectory())
    throw new Error(`随包工具 ${name} 不是目录`);
  if (kind !== "directory" && !stat.isFile())
    throw new Error(`随包工具 ${name} 不是文件`);
  if (kind === "executable" && process.platform !== "win32") {
    try {
      fs.accessSync(file, fs.constants.X_OK);
    } catch {
      throw new Error(`随包工具 ${name} 不可执行`);
    }
  }
}

export function resolveRuntimeTools(bundleRoot: string): RuntimeTools {
  const root = path.resolve(bundleRoot);
  const manifestFile = path.join(root, "runtime-tools.json");
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
  } catch {
    throw new Error("随包 runtime-tools.json 不存在或无法解析");
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new Error("随包 runtime-tools.json 必须是对象");
  const manifest = raw as Record<string, unknown>;
  const canonicalRoot = fs.realpathSync(root);
  const tools = {} as RuntimeTools;
  for (const [name, kind] of TOOLS) {
    const resolved = resolveTool(root, name, manifest[name]);
    let canonical: string;
    try {
      canonical = fs.realpathSync(resolved);
    } catch {
      throw new Error(`随包工具 ${name} 不存在`);
    }
    if (!inside(canonicalRoot, canonical))
      throw new Error(`runtime-tools.json 的 ${name} 越出资源根`);
    validateTool(canonical, name, kind);
    tools[name] = canonical;
  }
  return tools;
}
