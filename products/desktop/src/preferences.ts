import fs from "node:fs";
import path from "node:path";
import type { DesktopPreferences } from "./protocol";

const fileName = "preferences.json";
const preferenceFields = new Set([
  "theme",
  "layout",
  "dataDir",
  "configFile",
  "configBase",
  "modelDir",
  "window",
]);

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`${label}必须是对象`);
  return value as Record<string, unknown>;
}

function optionalPath(
  root: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = root[key];
  if (value === undefined) return undefined;
  if (
    typeof value !== "string" ||
    !value ||
    value.length > 32767 ||
    value.includes("\0")
  )
    throw new Error(`${key} 必须是有效路径字符串`);
  return value;
}

function integer(
  root: Record<string, unknown>,
  key: string,
  min: number,
  max: number,
): number {
  const value = root[key];
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < min ||
    value > max
  )
    throw new Error(`${key} 必须是 ${min} 到 ${max} 之间的整数`);
  return value;
}

function boolean(root: Record<string, unknown>, key: string): boolean {
  const value = root[key];
  if (typeof value !== "boolean")
    throw new Error(`${key} 必须是布尔值`);
  return value;
}

export function parsePreferencesPatch(
  value: unknown,
): Partial<DesktopPreferences> {
  const root = record(value, "桌面设置");
  for (const key of Object.keys(root)) {
    if (!preferenceFields.has(key))
      throw new Error(`未知桌面设置字段：${key}`);
  }
  const patch: Partial<DesktopPreferences> = {};
  if (root.theme !== undefined) {
    if (
      root.theme !== "system" &&
      root.theme !== "light" &&
      root.theme !== "dark"
    )
      throw new Error("theme 无效");
    patch.theme = root.theme;
  }
  if (root.layout !== undefined) {
    const layout = record(root.layout, "layout");
    const collapsed = record(layout.collapsed, "layout.collapsed");
    for (const key of Object.keys(layout)) {
      if (!["left", "right", "bottom", "collapsed"].includes(key))
        throw new Error(`未知 layout 字段：${key}`);
    }
    for (const key of Object.keys(collapsed)) {
      if (!["left", "right", "bottom"].includes(key))
        throw new Error(`未知 layout.collapsed 字段：${key}`);
    }
    patch.layout = {
      left: integer(layout, "left", 160, 640),
      right: integer(layout, "right", 220, 640),
      bottom: integer(layout, "bottom", 120, 480),
      collapsed: {
        left: boolean(collapsed, "left"),
        right: boolean(collapsed, "right"),
        bottom: boolean(collapsed, "bottom"),
      },
    };
  }
  for (const key of [
    "dataDir",
    "configFile",
    "configBase",
    "modelDir",
  ] as const) {
    const parsed = optionalPath(root, key);
    if (parsed !== undefined) patch[key] = parsed;
  }
  if (root.window !== undefined) {
    const window = record(root.window, "window");
    for (const key of Object.keys(window)) {
      if (!["x", "y", "width", "height"].includes(key))
        throw new Error(`未知 window 字段：${key}`);
    }
    patch.window = {
      x: integer(window, "x", -10_000_000, 10_000_000),
      y: integer(window, "y", -10_000_000, 10_000_000),
      width: integer(window, "width", 1, 1_000_000),
      height: integer(window, "height", 1, 1_000_000),
    };
  }
  return patch;
}

export function readPreferences(dir: string): DesktopPreferences {
  const file = path.join(dir, fileName);
  let content: string;
  try {
    content = fs.readFileSync(file, "utf8");
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    )
      return { theme: "system" };
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`无法读取桌面设置文件 ${file}：${reason}`);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    throw new Error(`桌面设置文件 ${file} 不是有效 JSON`);
  }
  let parsed: Partial<DesktopPreferences>;
  try {
    parsed = parsePreferencesPatch(raw);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`桌面设置文件 ${file} 不符合合同：${reason}`);
  }
  return { theme: parsed.theme ?? "system", ...parsed };
}

export function writePreferences(
  dir: string,
  value: DesktopPreferences,
): DesktopPreferences {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, fileName);
  const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
  let fd: number | undefined;
  try {
    fd = fs.openSync(temp, "wx", 0o600);
    fs.writeFileSync(fd, JSON.stringify(value), "utf8");
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
    fs.renameSync(temp, file);
    fs.chmodSync(file, 0o600);
    return value;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
    fs.rmSync(temp, { force: true });
  }
}
