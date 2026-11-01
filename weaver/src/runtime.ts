import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "./contracts/index.ts";

const devRoot = fileURLToPath(new URL("../../", import.meta.url));

export const RuntimeContext = z
  .object({
    mode: z.enum(["development", "production"]),
    resourcesDir: z.string().min(1),
    configFile: z.string().min(1),
    configBase: z.string().min(1),
    dataDir: z.string().min(1),
    modelDir: z.string().min(1),
    tempDir: z.string().min(1),
    logDir: z.string().min(1),
    tools: z
      .object({
        node: z.string().min(1),
        ffmpeg: z.string(),
        ffprobe: z.string(),
        supervisor: z.string().min(1),
        cardRenderer: z.string().min(1),
        cardBrowser: z.string(),
        cardSite: z.string(),
        python: z.string(),
      })
      .strict(),
  })
  .strict();
export type RuntimeContext = z.infer<typeof RuntimeContext>;

let active: RuntimeContext | undefined;

function absoluteDir(file: string, label: string): string {
  const resolved = path.resolve(file);
  if (!path.isAbsolute(resolved))
    throw new Error(`${label} 必须是绝对路径`);
  return resolved;
}

export function developmentRuntime(
  env: NodeJS.ProcessEnv = process.env,
): RuntimeContext {
  const dataDir = path.resolve(
    env.LIGHTWEAVER_DATA_DIR || path.join(devRoot, "data", ".weaver"),
  );
  const configFile = path.resolve(
    env.LIGHTWEAVER_CONFIG_FILE || path.join(devRoot, "config.local.yaml"),
  );
  const configBase = path.resolve(env.LIGHTWEAVER_CONFIG_BASE || path.dirname(configFile));
  return RuntimeContext.parse({
    mode: "development",
    resourcesDir: devRoot,
    configFile,
    configBase,
    dataDir,
    modelDir: path.resolve(
      env.LIGHTWEAVER_MODEL_DOWNLOAD_ROOT || path.join(dataDir, "models"),
    ),
    tempDir: path.join(dataDir, "tmp"),
    logDir: path.join(dataDir, "logs"),
    tools: {
      node: env.LIGHTWEAVER_NODE || process.execPath,
      ffmpeg: env.LIGHTWEAVER_FFMPEG || "",
      ffprobe: env.LIGHTWEAVER_FFPROBE || "",
      supervisor: path.join(devRoot, "weaver", "scripts", "process-supervisor.mjs"),
      cardRenderer:
        env.LIGHTWEAVER_CARD_RENDERER ||
        path.join(devRoot, "node_modules", ".bin", "weaver-card"),
      cardBrowser: env.LIGHTWEAVER_CHROME || "",
      cardSite: env.LIGHTWEAVER_CARD_SITE || "",
      python: env.LIGHTWEAVER_PYTHON || "",
    },
  });
}

export function installRuntime(input: RuntimeContext): RuntimeContext {
  const parsed = RuntimeContext.parse(input);
  const context: RuntimeContext = {
    ...parsed,
    resourcesDir: absoluteDir(parsed.resourcesDir, "资源目录"),
    configFile: path.resolve(parsed.configFile),
    configBase: absoluteDir(parsed.configBase, "配置基准"),
    dataDir: absoluteDir(parsed.dataDir, "数据目录"),
    modelDir: absoluteDir(parsed.modelDir, "模型目录"),
    tempDir: absoluteDir(parsed.tempDir, "临时目录"),
    logDir: absoluteDir(parsed.logDir, "日志目录"),
    tools: {
      ...parsed.tools,
      node: path.resolve(parsed.tools.node),
      supervisor: path.resolve(parsed.tools.supervisor),
      cardRenderer: path.resolve(parsed.tools.cardRenderer),
    },
  };
  if (process.versions.electron)
    throw new Error("共享核不能把 Electron 可执行文件当作 Node 服务");
  const nodeName = path.basename(context.tools.node).toLowerCase();
  if (nodeName !== "node" && nodeName !== "node.exe")
    throw new Error("服务运行时必须是 Node，不能是 Electron 或其他可执行文件");
  for (const dir of [context.dataDir, context.modelDir, context.tempDir, context.logDir])
    fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(path.dirname(context.configFile), { recursive: true });
  active = context;
  return context;
}

export function currentRuntime(): RuntimeContext {
  return active ?? developmentRuntime();
}

export function cliInvocation(context = currentRuntime()) {
  const node = context.tools.node;
  const entry = context.mode === "production"
    ? path.join(path.dirname(context.resourcesDir), "service", "cli.mjs")
    : path.join(context.resourcesDir, "weaver", "bin", "weaver.mjs");
  const quote = (value: string) => process.platform === "win32"
    ? `'${value.replaceAll("'", "''")}'`
    : `'${value.replaceAll("'", "'\"'\"'")}'`;
  const command = [node, entry, "--data-dir", context.dataDir, "--config-file", context.configFile, "--config-base", context.configBase]
    .map(quote).join(" ");
  return {
    node,
    entry,
    shell: process.platform === "win32" ? "PowerShell" : "POSIX shell",
    command: `${process.platform === "win32" ? "& " : ""}${command}`,
  };
}

export function resourcePath(...parts: string[]): string {
  const file = path.join(currentRuntime().resourcesDir, ...parts);
  const root = path.resolve(currentRuntime().resourcesDir);
  const resolved = path.resolve(file);
  if (resolved !== root && !resolved.startsWith(root + path.sep))
    throw new Error("资源路径越界");
  return resolved;
}

export function resolveConfiguredPath(value: string): string {
  if (!value) return "";
  return path.resolve(currentRuntime().configBase, value);
}

export function usesInstalledConfig(root: string | undefined): boolean {
  if (!root) return true;
  const resolved = path.resolve(root);
  const runtime = currentRuntime();
  return (
    resolved === path.resolve(runtime.configBase) ||
    resolved === path.resolve(runtime.resourcesDir) ||
    resolved === path.resolve(devRoot)
  );
}
