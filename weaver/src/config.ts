import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { WeaverError } from "./contracts/errors.ts";
import { currentRuntime, usesInstalledConfig } from "./runtime.ts";
const defaultRoot = fileURLToPath(new URL("../../", import.meta.url));

export function localConfigPath(root = defaultRoot): string {
  if (usesInstalledConfig(root)) return currentRuntime().configFile;
  return path.join(path.resolve(root), "config.local.yaml");
}

export function configRevision(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function scalarValue(rawValue: string, key: string): string {
  const raw = rawValue.trim();
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
    key,
  });
}

export function localConfigValue(name: string, root = defaultRoot): string {
  const file = localConfigPath(root);
  if (!fs.existsSync(file)) return "";
  const line = fs
    .readFileSync(file, "utf8")
    .split(/\r?\n/)
    .find((line) => line.startsWith(`${name}:`));
  if (!line) return "";
  return scalarValue(line.slice(name.length + 1), name);
}

function quoteScalar(value: string): string {
  if (/[\u0000-\u001f\u007f-\u009f]/.test(value))
    throw new WeaverError(
      "INVALID_INPUT",
      "本地配置值不能包含控制字符",
    );
  return `'${value.replace(/'/g, "''")}'`;
}

export function patchLocalConfig(input: {
  root?: string;
  expectedRevision: string;
  patch: Record<string, string | undefined>;
}): string {
  const root = input.root || defaultRoot,
    file = localConfigPath(root),
    lock = `${file}.lock`;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  let lockFd: number;
  try {
    lockFd = fs.openSync(lock, "wx", 0o600);
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "EEXIST"
    ) {
      recoverStaleLock(lock);
      throw new WeaverError(
        "CONFIG_LOCKED",
        "模型配置正在被另一进程保存，请重试",
        { lock },
        [],
        true,
      );
    }
    throw error;
  }
  const lockIdentity = fs.fstatSync(lockFd);
  try {
    fs.writeFileSync(
      lockFd,
      JSON.stringify({
        pid: process.pid,
        createdAt: Date.now(),
      }),
      { encoding: "utf8" },
    );
    const current = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
    if (configRevision(current) !== input.expectedRevision)
      throw new WeaverError(
        "CONFIG_CONFLICT",
        "config.local.yaml 已被其他操作修改，请刷新后重试",
      );
    let lines = current ? current.split(/\r?\n/) : [];
    for (const [key, value] of Object.entries(input.patch)) {
      if (value === undefined) continue;
      const matches = lines.flatMap((line, index) =>
        line.startsWith(`${key}:`) ? [index] : [],
      );
      if (matches.length > 1)
        throw new WeaverError(
          "INVALID_INPUT",
          "本地配置包含重复的模型设置项",
          { key },
        );
      const next = `${key}: ${quoteScalar(value)}`;
      if (matches.length) lines[matches[0]] = next;
      else {
        if (lines.length && lines.at(-1) === "") lines.splice(-1, 0, next);
        else lines.push(next);
      }
    }
    const content = `${lines.join("\n").replace(/\n+$/, "")}\n`,
      revision = configRevision(content),
      temp = path.join(
        path.dirname(file),
        `.config.local.yaml.${process.pid}.${Date.now()}.tmp`,
      );
    try {
      const fd = fs.openSync(temp, "wx", 0o600);
      try {
        fs.writeFileSync(fd, content, "utf8");
        fs.fsyncSync(fd);
      } finally {
        fs.closeSync(fd);
      }
      fs.chmodSync(temp, 0o600);
      fs.renameSync(temp, file);
      fs.chmodSync(file, 0o600);
    } finally {
      fs.rmSync(temp, { force: true });
    }
    return revision;
  } finally {
    fs.closeSync(lockFd);
    try {
      const current = fs.statSync(lock);
      if (
        current.dev === lockIdentity.dev &&
        current.ino === lockIdentity.ino
      )
        fs.rmSync(lock, { force: true });
    } catch {
      // The owner never removes a lock that it cannot prove is its own.
    }
  }
}

function recoverStaleLock(lock: string): void {
  const emptyGraceMs = 30_000,
    deadOwnerGraceMs = 30_000,
    malformedGraceMs = 5 * 60 * 1000;
  let stale = false,
    observed: fs.Stats | undefined;
  try {
    const stat = fs.statSync(lock),
      age = Date.now() - stat.mtimeMs;
    observed = stat;
    if (age < emptyGraceMs) return;
    let data: unknown;
    try {
      data = JSON.parse(fs.readFileSync(lock, "utf8"));
    } catch {
      if (age > malformedGraceMs) fs.rmSync(lock, { force: true });
      return;
    }
    const pid =
      data && typeof data === "object" && "pid" in data
        ? Number(data.pid)
        : 0;
    if (!Number.isInteger(pid) || pid <= 0) {
      if (age > malformedGraceMs) fs.rmSync(lock, { force: true });
      return;
    }
    let alive = false;
    try {
      process.kill(pid, 0);
      alive = true;
    } catch (error) {
      if (
        !error ||
        typeof error !== "object" ||
        !("code" in error) ||
        error.code !== "ESRCH"
      ) {
        // EPERM and unknown probe failures mean the owner may still be alive.
        alive = true;
      }
    }
    stale = !alive && age > deadOwnerGraceMs;
  } catch {
    // A lock that disappears between calls needs no recovery.
    return;
  }
  if (stale && observed) {
    try {
      const current = fs.statSync(lock);
      if (current.dev === observed.dev && current.ino === observed.ino)
        fs.rmSync(lock, { force: true });
    } catch {
      // Another process already released or replaced the lock.
    }
  }
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
