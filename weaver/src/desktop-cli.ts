import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "./contracts/index.ts";
import { installRuntime, RuntimeContext } from "./runtime.ts";
import { errorProtocol } from "./contracts/errors.ts";

function desktopUserData(): string {
  if (process.env.LIGHTWEAVER_USER_DATA) return path.resolve(process.env.LIGHTWEAVER_USER_DATA);
  const appData = process.platform === "darwin"
    ? path.join(os.homedir(), "Library", "Application Support")
    : process.platform === "win32"
      ? process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming")
      : process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
  return path.join(appData, "LightWeaver");
}

function resourceFile(root: string, relative: string): string {
  if (!relative || path.isAbsolute(relative) || relative.split(/[\\/]/).includes(".."))
    throw new Error("安装包运行时包含无效路径");
  return path.resolve(root, relative);
}

try {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const tools = RuntimeContext.shape.tools.parse(JSON.parse(fs.readFileSync(path.join(root, "runtime-tools.json"), "utf8")));
  const user = desktopUserData();
  const prefsFile = path.join(user, "preferences.json");
  const PreferencePaths = z.object({
    dataDir: z.string().min(1).optional(),
    configFile: z.string().min(1).optional(),
    configBase: z.string().min(1).optional(),
    modelDir: z.string().min(1).optional(),
  });
  const prefs = PreferencePaths.parse(fs.existsSync(prefsFile) ? JSON.parse(fs.readFileSync(prefsFile, "utf8")) : {});
  const dataDir = path.resolve(prefs.dataDir || path.join(user, "weaver"));
  const configFile = path.resolve(prefs.configFile || path.join(user, "config.local.yaml"));
  installRuntime({
    mode: "production",
    resourcesDir: path.join(root, "resources"),
    configFile,
    configBase: path.resolve(prefs.configBase || path.dirname(configFile)),
    dataDir,
    modelDir: path.resolve(prefs.modelDir || path.join(dataDir, "models")),
    tempDir: path.join(dataDir, "tmp"),
    logDir: path.join(dataDir, "logs"),
    tools: {
      node: process.execPath,
      ffmpeg: resourceFile(root, tools.ffmpeg),
      ffprobe: resourceFile(root, tools.ffprobe),
      supervisor: resourceFile(root, tools.supervisor),
      cardRenderer: resourceFile(root, tools.cardRenderer),
      cardBrowser: resourceFile(root, tools.cardBrowser),
      cardSite: resourceFile(root, tools.cardSite),
      python: resourceFile(root, tools.python),
    },
  });
  process.env.LIGHTWEAVER_CARD_INFO = path.join(root, "card", "info.json");
  await import("./cli.ts");
} catch (error) {
  process.stdout.write(JSON.stringify({ ok: false, error: errorProtocol(error) }) + "\n");
  process.exitCode = 1;
}
