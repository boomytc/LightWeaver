import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, randomUUID } from "node:crypto";
import { z, Id, ModelSettingsField } from "./contracts/index.ts";
import { WeaverError } from "./contracts/errors.ts";
import { currentRuntime, resourcePath, usesInstalledConfig } from "./runtime.ts";
const defaultRoot = fileURLToPath(new URL("../../", import.meta.url));

export function localConfigPath(root = defaultRoot): string {
  if (usesInstalledConfig(root)) return currentRuntime().configFile;
  return path.join(path.resolve(root), "config.local.yaml");
}

const configRequestMarker = "# lightweaver-config-request-v1 ";
const configRequestLine =
  /^# lightweaver-config-request-v1 [^\r\n]*(?:\r?\n|$)/gm;

export function configRevision(content: string): string {
  return createHash("sha256")
    .update(content.replace(configRequestLine, ""))
    .digest("hex");
}

function configContentValue(content: string, name: string): string {
  const line = content
    .split(/\r?\n/)
    .find((line) => line.startsWith(`${name}:`));
  if (!line) return "";
  return scalarValue(line.slice(name.length + 1), name);
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

type ConfigSetting = {
  key: string;
  environment: string;
  fallback?: string;
};

export function readConfig(
  input: {
    root?: string;
    env?: NodeJS.ProcessEnv;
    localContent?: string;
  } = {},
) {
  const root = input.root ?? defaultRoot;
  const file = localConfigPath(root);
  const local = input.localContent ??
    (fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "");
  const defaultsFile = usesInstalledConfig(root)
    ? resourcePath("config.yaml")
    : path.join(path.resolve(root), "config.yaml");
  if (!fs.existsSync(defaultsFile))
    throw new WeaverError("CONFIG_MISSING", "缺少默认配置 config.yaml", {
      file: defaultsFile,
    });
  const defaults = fs.readFileSync(defaultsFile, "utf8");
  const env = input.env ?? process.env;
  return {
    field(setting: ConfigSetting): z.infer<typeof ModelSettingsField> {
      const fromFile = configContentValue(local, setting.key).trim();
      if (fromFile) return { value: fromFile, source: "file" };
      const fromEnvironment = env[setting.environment]?.trim();
      if (fromEnvironment)
        return { value: fromEnvironment, source: "environment" };
      const fromDefault = configContentValue(defaults, setting.key).trim() ||
        setting.fallback?.trim();
      return fromDefault
        ? { value: fromDefault, source: "default" }
        : { value: "", source: "unset" };
    },
  };
}

function quoteScalar(value: string): string {
  if (/[\u0000-\u001f\u007f-\u009f]/.test(value))
    throw new WeaverError("INVALID_INPUT", "本地配置值不能包含控制字符");
  return `'${value.replace(/'/g, "''")}'`;
}

const ConfigRequestReceipt = z.strictObject({
  schemaVersion: z.literal(1),
  requestId: Id,
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  expectedRevision: z.string().regex(/^[a-f0-9]{64}$/),
  targetRevision: z.string().regex(/^[a-f0-9]{64}$/),
  result: z.unknown(),
  createdAt: z.string(),
});
type ConfigRequestReceipt = z.infer<typeof ConfigRequestReceipt>;

function normalizedPatch(
  patch: Readonly<Record<string, string | undefined>>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(patch)
      .filter((entry): entry is [string, string] => entry[1] !== undefined)
      .sort(([left], [right]) => left.localeCompare(right, "en")),
  );
}

function requestFingerprint(
  expectedRevision: string,
  patch: Record<string, string>,
  identity?: unknown,
): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        expectedRevision,
        ...(identity === undefined
          ? { patch: Object.entries(patch) }
          : { request: identity }),
      }),
    )
    .digest("hex");
}

function applyConfigPatch(
  current: string,
  patch: Record<string, string>,
): string {
  const lines = current ? current.split(/\r?\n/) : [];
  for (const [key, value] of Object.entries(patch)) {
    const matches = lines.flatMap((line, index) =>
      line.startsWith(`${key}:`) ? [index] : [],
    );
    if (matches.length > 1)
      throw new WeaverError("INVALID_INPUT", "本地配置包含重复的模型设置项", {
        key,
      });
    const next = `${key}: ${quoteScalar(value)}`;
    if (matches.length) lines[matches[0]] = next;
    else {
      if (lines.length && lines.at(-1) === "") lines.splice(-1, 0, next);
      else lines.push(next);
    }
  }
  return `${lines.join("\n").replace(/\n+$/, "")}\n`;
}

function syncDirectory(directory: string): void {
  let fd: number | undefined;
  try {
    fd = fs.openSync(directory, "r");
    fs.fsyncSync(fd);
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      ["EINVAL", "ENOTSUP", "EPERM", "EISDIR"].includes(String(error.code))
    )
      return;
    throw error;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

function atomicWrite(file: string, content: string): void {
  const directory = path.dirname(file),
    temp = path.join(
      directory,
      `.${path.basename(file)}.${process.pid}.${randomUUID()}.tmp`,
    );
  let fd: number | undefined;
  try {
    fd = fs.openSync(temp, "wx", 0o600);
    fs.writeFileSync(fd, content, "utf8");
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
    fs.chmodSync(temp, 0o600);
    fs.renameSync(temp, file);
    fs.chmodSync(file, 0o600);
    syncDirectory(directory);
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
    fs.rmSync(temp, { force: true });
  }
}

function configRequestReceipts(content: string): ConfigRequestReceipt[] {
  const receipts: ConfigRequestReceipt[] = [];
  for (const line of content.split(/\r?\n/)) {
    if (!line.startsWith(configRequestMarker)) continue;
    try {
      const encoded = line.slice(configRequestMarker.length);
      receipts.push(
        ConfigRequestReceipt.parse(
          JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")),
        ),
      );
    } catch {
      throw new WeaverError("INVALID_INPUT", "模型配置请求收据损坏");
    }
  }
  return receipts;
}

function matchingRequest<T>(
  content: string,
  requestId: string,
  fingerprint: string,
  schema: z.ZodType<T>,
): T | undefined {
  const prior = configRequestReceipts(content).find(
    (request) => request.requestId === requestId,
  );
  if (!prior) return;
  if (prior.fingerprint !== fingerprint)
    throw new WeaverError(
      "REQUEST_ID_REUSED",
      "同一 requestId 对应不同配置请求",
      { requestId },
    );
  return schema.parse(prior.result);
}

export function replayConfigRequest<T>(input: {
  root?: string;
  requestId: string;
  expectedRevision: string;
  identity: unknown;
  resultSchema: z.ZodType<T>;
}): T | undefined {
  Id.parse(input.requestId);
  const file = localConfigPath(input.root);
  const content = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  return matchingRequest(
    content,
    input.requestId,
    requestFingerprint(input.expectedRevision, {}, input.identity),
    input.resultSchema,
  );
}

export function patchLocalConfig<T>(input: {
  root?: string;
  requestId: string;
  expectedRevision: string;
  patch: Readonly<Record<string, string | undefined>>;
  identity?: unknown;
  resultSchema: z.ZodType<T>;
  buildResult: (content: string, revision: string) => T;
}): T {
  Id.parse(input.requestId);
  const root = input.root || defaultRoot,
    file = localConfigPath(root),
    lock = `${file}.lock`,
    patch = normalizedPatch(input.patch),
    fingerprint = requestFingerprint(
      input.expectedRevision,
      patch,
      input.identity,
    );
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
    for (const entry of fs.readdirSync(path.dirname(file), {
      withFileTypes: true,
    })) {
      if (
        entry.isFile() &&
        entry.name.startsWith(`.${path.basename(file)}.`) &&
        entry.name.endsWith(".tmp")
      )
        fs.rmSync(path.join(path.dirname(file), entry.name), { force: true });
    }
    const current = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "",
      prior = matchingRequest(
        current,
        input.requestId,
        fingerprint,
        input.resultSchema,
      );
    if (prior !== undefined) return prior;
    if (configRevision(current) !== input.expectedRevision)
      throw new WeaverError(
        "CONFIG_CONFLICT",
        "config.local.yaml 已被其他操作修改，请刷新后重试",
      );
    const content = applyConfigPatch(current, patch),
      revision = configRevision(content),
      result = input.resultSchema.parse(input.buildResult(content, revision));
    const receipt: ConfigRequestReceipt = {
      schemaVersion: 1,
      requestId: input.requestId,
      fingerprint,
      expectedRevision: input.expectedRevision,
      targetRevision: revision,
      result,
      createdAt: new Date().toISOString(),
    };
    const stored = `${content.replace(/\n+$/, "")}\n${configRequestMarker}${Buffer.from(
      JSON.stringify(ConfigRequestReceipt.parse(receipt)),
    ).toString("base64url")}\n`;
    if (configRevision(stored) !== revision)
      throw new WeaverError(
        "EXECUTION_FAILED",
        "模型配置请求收据改变了配置修订",
      );
    atomicWrite(file, stored);
    return result;
  } finally {
    fs.closeSync(lockFd);
    try {
      const current = fs.statSync(lock);
      if (current.dev === lockIdentity.dev && current.ino === lockIdentity.ino)
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
      data && typeof data === "object" && "pid" in data ? Number(data.pid) : 0;
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
  root: string,
  env: NodeJS.ProcessEnv,
): { base: string; key: string } {
  const prefix = provider.toUpperCase();
  const config = readConfig({ root, env });
  const base = config.field({
    key: `${provider}_base_url`,
    environment: `${prefix}_BASE_URL`,
  }).value.replace(/\/$/, "");
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
    key: config.field({
      key: `${provider}_api_key`,
      environment: `${prefix}_API_KEY`,
    }).value,
  };
}

export const modelbestBackend = (
  root = defaultRoot,
  env: NodeJS.ProcessEnv = process.env,
) => remoteBackend("modelbest", root, env);
export const deepseekBackend = (
  root = defaultRoot,
  env: NodeJS.ProcessEnv = process.env,
) => remoteBackend("deepseek", root, env);
