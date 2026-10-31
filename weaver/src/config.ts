import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WeaverError } from "./contracts/errors.ts";
const defaultRoot = fileURLToPath(new URL("../../", import.meta.url));
export function localConfigValue(name: string, root = defaultRoot): string {
  const file = path.join(root, "config.local.yaml");
  if (!fs.existsSync(file)) return "";
  const line = fs
    .readFileSync(file, "utf8")
    .split(/\r?\n/)
    .find((line) => line.startsWith(`${name}:`));
  if (!line) return "";
  const raw = line.slice(name.length + 1).trim();
  if (!raw || raw.startsWith("#")) return "";
  if (raw.startsWith("'")) {
    const match = /^'((?:[^']|'')*)'\s*(?:#.*)?$/.exec(raw);
    if (match) return match[1].replace(/''/g, "'");
  } else if (raw.startsWith('"')) {
    const match = /^("(?:[^"\\]|\\.)*")\s*(?:#.*)?$/.exec(raw);
    if (match) {
      try {
        const value: unknown = JSON.parse(match[1]);
        if (typeof value === "string") return value;
      } catch {
        // Invalid escapes use the same configuration error below.
      }
    }
  } else return raw.replace(/\s+#.*$/, "").trimEnd();
  throw new WeaverError("INVALID_INPUT", "本地配置的标量格式无效", {
    key: name,
  });
}
function remoteBackend(
  provider: "modelbest" | "deepseek",
  fallback: string,
  root: string,
  env: NodeJS.ProcessEnv,
): { base: string; key: string } {
  const prefix = provider.toUpperCase();
  const base = (
    env[`${prefix}_BASE_URL`] ||
    localConfigValue(`${provider}_base_url`, root) ||
    fallback
  ).replace(/\/$/, "");
  const url = new URL(base);
  if (
    !["https:", "http:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new WeaverError(
      "INVALID_INPUT",
      "provider 端点不能带凭据、查询参数或片段",
    );
  return {
    base,
    key: (
      env[`${prefix}_API_KEY`] ||
      localConfigValue(`${provider}_api_key`, root) ||
      ""
    ).trim(),
  };
}

export const modelbestBackend = (
  root = defaultRoot,
  env: NodeJS.ProcessEnv = process.env,
) => remoteBackend("modelbest", "https://api.modelbest.cn/v1", root, env);
export const deepseekBackend = (
  root = defaultRoot,
  env: NodeJS.ProcessEnv = process.env,
) => remoteBackend("deepseek", "https://api.deepseek.com", root, env);
