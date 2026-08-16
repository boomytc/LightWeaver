import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { weaverRoot } from "./paths.ts";

export const DEFAULT_MODELBEST_BASE = "https://api.modelbest.cn/v1";

export function localConfigPath(root = weaverRoot()): string {
  return path.join(root, "config.local.yaml");
}

export type ModelbestProbe = { ok: boolean; message: string };

export type ModelbestStatus = {
  configured: boolean;
  hint?: string;
  source?: "env" | "file";
  probe?: ModelbestProbe;
};

export function modelbestStatus(
  root = weaverRoot(),
  env: NodeJS.ProcessEnv = process.env,
): ModelbestStatus {
  const { key } = modelbestBackend(root, env);
  const fromEnv = (env.MODELBEST_API_KEY ?? "").trim();
  const fromFile = readYamlScalar(localConfigPath(root), "modelbest_api_key");
  const status: ModelbestStatus = fromEnv
    ? { configured: true, hint: keyHint(fromEnv), source: "env" }
    : fromFile
      ? { configured: true, hint: keyHint(fromFile), source: "file" }
      : { configured: false };
  const cached = readProbeCache(root);
  if (key && cached?.ok && cached.fp === keyFingerprint(key)) {
    status.probe = { ok: true, message: "连接正常" };
  }
  return status;
}

export function setModelbestApiKey(key: string, root = weaverRoot()): ModelbestStatus {
  const value = key.trim();
  if (!value) throw new Error("先贴一段 API key");
  upsertYamlScalar(localConfigPath(root), "modelbest_api_key", value, {
    modelbest_base_url: DEFAULT_MODELBEST_BASE,
  });
  return modelbestStatus(root, {});
}

export function modelbestBackend(
  root = weaverRoot(),
  env: NodeJS.ProcessEnv = process.env,
): { base: string; key: string } {
  const base = (
    env.MODELBEST_BASE_URL ||
    readYamlScalar(localConfigPath(root), "modelbest_base_url") ||
    DEFAULT_MODELBEST_BASE
  ).replace(/\/$/, "");
  const key = (env.MODELBEST_API_KEY || readYamlScalar(localConfigPath(root), "modelbest_api_key") || "").trim();
  return { base, key };
}

export async function probeModelbest(
  root = weaverRoot(),
  env: NodeJS.ProcessEnv = process.env,
  request: typeof fetch = fetch,
): Promise<ModelbestProbe> {
  const { base, key } = modelbestBackend(root, env);
  if (!key) {
    clearProbeCache(root);
    return { ok: false, message: "还没有密钥，先去获取" };
  }
  try {
    const response = await request(`${base}/audio/speech`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "VoxCPM2",
        input: "测",
        voice: "default",
        response_format: "wav",
        do_normalize: true,
      }),
      signal: AbortSignal.timeout(20000),
    });
    const result: ModelbestProbe =
      response.status === 401 || response.status === 403
        ? { ok: false, message: "密钥无效" }
        : response.ok
          ? { ok: true, message: "连接正常" }
          : { ok: false, message: `连接失败 ${response.status}` };
    rememberProbe(root, key, result);
    return result;
  } catch {
    const result = { ok: false, message: "连不上 ModelBest" };
    rememberProbe(root, key, result);
    return result;
  }
}

function probeCachePath(root: string): string {
  return path.join(root, ".cache", "modelbest-probe.json");
}

function keyFingerprint(key: string): string {
  return createHash("sha256").update(key).digest("hex").slice(0, 16);
}

function readProbeCache(root: string): { fp: string; ok: boolean } | undefined {
  const file = probeCachePath(root);
  if (!fs.existsSync(file)) return undefined;
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as { fp?: string; ok?: boolean };
    if (!parsed.fp || parsed.ok !== true) return undefined;
    return { fp: parsed.fp, ok: true };
  } catch {
    return undefined;
  }
}

function rememberProbe(root: string, key: string, result: ModelbestProbe): void {
  if (result.ok) {
    fs.mkdirSync(path.dirname(probeCachePath(root)), { recursive: true });
    fs.writeFileSync(probeCachePath(root), `${JSON.stringify({ fp: keyFingerprint(key), ok: true })}\n`);
    return;
  }
  const cached = readProbeCache(root);
  if (cached?.fp === keyFingerprint(key)) clearProbeCache(root);
}

function clearProbeCache(root: string): void {
  fs.rmSync(probeCachePath(root), { force: true });
}

function keyHint(key: string): string {
  return key.length <= 4 ? "····" : `··${key.slice(-4)}`;
}

function readYamlScalar(file: string, name: string): string {
  if (!fs.existsSync(file)) return "";
  const line = fs
    .readFileSync(file, "utf8")
    .split(/\r?\n/)
    .find((item) => item.startsWith(`${name}:`));
  if (!line) return "";
  return unquote(line.slice(name.length + 1).trim());
}

function upsertYamlScalar(
  file: string,
  name: string,
  value: string,
  defaults: Record<string, string> = {},
): void {
  const quoted = yamlQuote(value);
  if (!fs.existsSync(file)) {
    const lines = Object.entries(defaults).map(([key, item]) => `${key}: ${yamlQuote(item)}`);
    lines.push(`${name}: ${quoted}`);
    fs.writeFileSync(file, `${lines.join("\n")}\n`);
    return;
  }
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  const index = lines.findIndex((item) => item.startsWith(`${name}:`));
  if (index >= 0) lines[index] = `${name}: ${quoted}`;
  else lines.push(`${name}: ${quoted}`);
  for (const [key, item] of Object.entries(defaults)) {
    if (!lines.some((line) => line.startsWith(`${key}:`))) {
      lines.unshift(`${key}: ${yamlQuote(item)}`);
    }
  }
  fs.writeFileSync(file, `${lines.join("\n").replace(/\n+$/, "")}\n`);
}

function yamlQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function unquote(raw: string): string {
  if (raw.length >= 2 && raw.startsWith("'") && raw.endsWith("'")) {
    return raw.slice(1, -1).replace(/''/g, "'");
  }
  if (raw.length >= 2 && raw.startsWith('"') && raw.endsWith('"')) {
    return raw.slice(1, -1);
  }
  return raw;
}
