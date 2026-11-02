import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import {
  z,
  Digest,
  EngineCatalogItem,
  EngineInstallInput,
  EngineStatus,
  EngineVerifyResult,
  EngineView,
  ModelFileState,
  ModelReleaseFile,
  ModelSettingsField,
} from "../contracts/index.ts";
import { WeaverError } from "../contracts/errors.ts";
import { readConfig } from "../config.ts";
import { Jobs, type NodeContext } from "../jobs/index.ts";
import { currentRuntime } from "../runtime.ts";
import { fileDigest } from "../adapters/toolchain.ts";
import {
  defaultModelPython,
  defaultSpeechPython,
  resolveExecutable,
} from "../adapters/executable.ts";
import type { Models } from "../models/service.ts";
import { extractArchive } from "./archive.ts";
import { downloadArtifact } from "./download.ts";
import {
  engineBindingValue,
  engineCatalog,
  installDirectory,
  requirementsPath,
} from "./catalog.ts";

type CatalogFile = z.infer<typeof ModelReleaseFile>;
type EngineItem = z.infer<typeof EngineCatalogItem>;
type ActivePathState =
  | "unset"
  | "missing"
  | "wrong-type"
  | "unavailable"
  | "present";

const MARKER = ".lightweaver-engine.json";
const MARKER_SCHEMA = 1;
const EngineMarker = z.object({
  schemaVersion: z.literal(MARKER_SCHEMA),
  id: z.string().min(1),
  version: z.string().min(1),
  platform: z.string().min(1),
  sourceSha256: z.string(),
  installedAt: z.string(),
});
type Marker = z.infer<typeof EngineMarker>;

/** 引擎绑定写回的配置项。路径按配置基准解析，与模型采用一致。 */
const SETTINGS: Record<
  string,
  { key: string; environment: string; fallback?: string }
> = {
  asr_library: { key: "asr_library", environment: "TRANSCRIBE_LIBRARY" },
  asr_bindings: {
    key: "asr_bindings",
    environment: "LIGHTWEAVER_ASR_BINDINGS",
  },
  vad_library: { key: "vad_library", environment: "LIGHTWEAVER_VAD_LIBRARY" },
  visual_server: {
    key: "visual_server",
    environment: "LIGHTWEAVER_VISUAL_SERVER",
  },
  llama_server: { key: "llama_server", environment: "LIGHTWEAVER_LLAMA_SERVER" },
  translation_server: {
    key: "translation_server",
    environment: "LIGHTWEAVER_TRANSLATION_SERVER",
  },
  model_python: {
    key: "model_python",
    environment: "LIGHTWEAVER_MODEL_PYTHON",
    fallback: defaultModelPython(),
  },
  speech_python: {
    key: "speech_python",
    environment: "LIGHTWEAVER_SPEECH_PYTHON",
    fallback: defaultSpeechPython(),
  },
};

function inspectPath(
  file: string,
  kind: "file" | "directory" | "executable",
): { state: ActivePathState; resolvedPath: string } {
  if (!file) return { state: "unset", resolvedPath: "" };
  try {
    const stat = fs.statSync(file);
    if (kind === "directory")
      return { state: stat.isDirectory() ? "present" : "wrong-type", resolvedPath: file };
    if (!stat.isFile()) return { state: "wrong-type", resolvedPath: file };
    if (kind === "executable") fs.accessSync(file, fs.constants.X_OK);
    return { state: "present", resolvedPath: file };
  } catch (error) {
    return {
      state:
        error && typeof error === "object" && "code" in error &&
        (error.code === "ENOENT" || error.code === "ENOTDIR")
          ? "missing"
          : "unavailable",
      resolvedPath: file,
    };
  }
}

function readMarker(directory: string): Marker | undefined {
  try {
    return EngineMarker.parse(
      JSON.parse(fs.readFileSync(path.join(directory, MARKER), "utf8")),
    );
  } catch {
    return undefined;
  }
}

function writeMarker(directory: string, marker: Marker): void {
  fs.writeFileSync(
    path.join(directory, MARKER),
    `${JSON.stringify(EngineMarker.parse(marker), null, 2)}\n`,
    { mode: 0o600 },
  );
}

function resolvePath(root: string, value: string): string {
  return value ? path.resolve(root, value) : "";
}

function isEexist(error: unknown): boolean {
  return (
    !!error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "EEXIST"
  );
}

type CommandResult = { code: number | null; stdout: string; stderr: string };

function runCommand(
  command: string,
  args: string[],
  options: {
    signal?: AbortSignal;
    timeoutMs?: number;
    onLine?: (line: string) => void;
  } = {},
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "",
      stderr = "",
      settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", abort);
      if (error) reject(error);
      else resolve({ code: child.exitCode, stdout, stderr });
    };
    const abort = () => {
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 3000).unref?.();
      finish(new WeaverError("CANCELLED", "引擎安装已取消"));
    };
    const timer = options.timeoutMs
      ? setTimeout(() => {
          child.kill("SIGKILL");
          finish(
            new WeaverError("DEADLINE_EXCEEDED", "引擎命令执行超时", {
              command: path.basename(command),
            }),
          );
        }, options.timeoutMs)
      : undefined;
    if (options.signal?.aborted) {
      abort();
      return;
    }
    options.signal?.addEventListener("abort", abort, { once: true });
    const collect = (target: "stdout" | "stderr") => (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      if (target === "stdout") stdout += text;
      else stderr += text;
      if (!options.onLine) return;
      for (const line of text.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (trimmed) options.onLine(trimmed);
      }
    };
    child.stdout?.on("data", collect("stdout"));
    child.stderr?.on("data", collect("stderr"));
    child.once("error", (error) =>
      finish(
        new WeaverError("ENGINE_INSTALL_FAILED", "无法启动引擎安装命令", {
          command: path.basename(command),
          detail: error.message,
        }),
      ),
    );
    child.once("close", () => finish());
  });
}

export class Engines {
  private readonly locks = new Set<string>();

  constructor(
    private readonly root: string,
    private readonly jobs: Jobs,
    private readonly models: Models,
  ) {
    jobs.register("engine-install", (context) => this.installNode(context));
  }

  catalog() {
    return engineCatalog();
  }

  installRoot(env: NodeJS.ProcessEnv = process.env): z.infer<typeof ModelSettingsField> {
    const field = readConfig({ root: this.root, env }).field({
      key: "engine_install_root",
      environment: "LIGHTWEAVER_ENGINE_ROOT",
    });
    return field.source === "unset" || field.source === "default"
      ? { value: currentRuntime().engineDir, source: "default" }
      : field;
  }

  private rootDirectory(root: string = this.installRoot().value): string {
    return path.resolve(this.root, root);
  }

  private item(id: string): EngineItem {
    const found = engineCatalog().items.find((value) => value.id === id);
    if (!found) throw new WeaverError("INVALID_INPUT", "未知引擎", { id });
    if (!found.available)
      throw new WeaverError(
        "CAPABILITY_UNAVAILABLE",
        found.unavailableReason || "当前平台没有可用引擎产物",
        { id, platform: found.platform },
      );
    return found;
  }

  view(root?: string) {
    const settings = this.models.settings(),
      base = this.rootDirectory(root || this.installRoot().value),
      catalog = engineCatalog();
    return EngineView.parse({
      catalog,
      settings,
      installRoot: this.installRoot(),
      items: catalog.items.map((item) => ({
        id: item.id,
        status: this.status(item, base),
        active: item.bindings.map((binding) => {
          const setting = SETTINGS[binding.setting];
          const value = setting
            ? readConfig({ root: this.root, env: process.env }).field(setting)
            : { value: "", source: "unset" as const };
          const target =
            binding.target === "directory"
              ? resolvePath(this.root, value.value)
              : binding.target === "executable"
                ? value.value
                  ? resolveExecutable(value.value, this.root)
                  : ""
                : resolvePath(this.root, value.value);
          const inspected =
            target || !value.value
              ? inspectPath(target, binding.target)
              : { state: "missing" as const, resolvedPath: "" };
          return {
            setting: binding.setting,
            target: binding.target,
            ...(binding.target === "directory" ? {} : { file: binding.file }),
            value,
            resolvedPath: inspected.resolvedPath,
            state: inspected.state,
            ready: inspected.state === "present",
          };
        }),
      })),
      installs: this.jobs
        .list()
        .filter((run) => run.kind === "engine-install")
        .slice(0, 20),
    });
  }

  private status(item: EngineItem, root: string): z.infer<typeof EngineStatus> {
    const directory = installDirectory(root, item.id),
      marker = readMarker(directory);
    if (item.kind === "python-env") {
      const python = path.join(
        directory,
        item.bindings[0]?.target === "executable" ? item.bindings[0].file : "",
      );
      const pythonState = inspectPath(python, "executable");
      const files: z.input<typeof EngineStatus>["files"] = [];
      if (!fs.existsSync(directory))
        return EngineStatus.parse({
          id: item.id,
          root,
          directory,
          state: "missing",
          version: "",
          files,
        });
      if (!marker)
        return EngineStatus.parse({
          id: item.id,
          root,
          directory,
          state: pythonState.state === "present" ? "unchecked" : "invalid",
          version: "",
          files,
          ...(pythonState.state === "present"
            ? {}
            : { reason: "环境目录缺少可用的 Python 解释器" }),
        });
      if (marker.version !== item.version)
        return EngineStatus.parse({
          id: item.id,
          root,
          directory,
          state: "invalid",
          version: marker.version,
          files,
          reason: "已安装环境与当前 requirements 版本不同，请重新安装",
        });
      return EngineStatus.parse({
        id: item.id,
        root,
        directory,
        state: pythonState.state === "present" ? "installed" : "invalid",
        version: marker.version,
        files,
        ...(pythonState.state === "present"
          ? {}
          : { reason: "环境目录缺少可用的 Python 解释器" }),
      });
    }
    const files: z.input<typeof EngineStatus>["files"] = item.files.map(
      (expected) => {
        let actualSize: number | undefined;
        try {
          const stat = fs.statSync(path.join(directory, expected.path));
          if (stat.isFile()) actualSize = stat.size;
        } catch {
          actualSize = undefined;
        }
        return {
          path: expected.path,
          expectedSize: expected.size,
          actualSize,
          state:
            actualSize === undefined
              ? ("missing" as const)
              : actualSize === expected.size
                ? ("metadata-match" as const)
                : ("invalid" as const),
        };
      },
    );
    const metadataMatch = files.every((value) => value.state === "metadata-match"),
      anyMissing = files.every((value) => value.state === "missing");
    if (!fs.existsSync(directory))
      return EngineStatus.parse({
        id: item.id,
        root,
        directory,
        state: "missing",
        version: "",
        files,
      });
    if (!marker)
      return EngineStatus.parse({
        id: item.id,
        root,
        directory,
        state: metadataMatch ? "unchecked" : "invalid",
        version: "",
        files,
        ...(metadataMatch ? {} : { reason: "目录内容与当前发布清单不同" }),
      });
    if (marker.version !== item.version)
      return EngineStatus.parse({
        id: item.id,
        root,
        directory,
        state: "invalid",
        version: marker.version,
        files,
        reason: "已安装版本与当前发布清单不同，请重新安装",
      });
    return EngineStatus.parse({
      id: item.id,
      root,
      directory,
      state: metadataMatch ? "installed" : anyMissing ? "invalid" : "invalid",
      version: marker.version,
      files,
      ...(metadataMatch ? {} : { reason: "目录内容与当前发布清单不同" }),
    });
  }

  private async hashFiles(
    directory: string,
    files: CatalogFile[],
  ): Promise<{ files: z.infer<typeof ModelFileState>[]; allMissing: boolean; allVerified: boolean }> {
    const results: z.infer<typeof ModelFileState>[] = [];
    for (const expected of files) {
      const file = path.join(directory, expected.path);
      let actualSize: number | undefined,
        actualSha256: z.infer<typeof Digest> | undefined,
        reason: string | undefined;
      try {
        const stat = fs.statSync(file);
        if (!stat.isFile()) reason = "不是普通文件";
        else {
          actualSize = stat.size;
          if (actualSize !== expected.size) reason = "文件大小不匹配";
          else actualSha256 = await fileDigest(file);
          if (actualSha256 && actualSha256 !== expected.sha256)
            reason = "SHA-256 不匹配";
        }
      } catch {
        reason = "文件缺失";
      }
      results.push({
        path: expected.path,
        expectedSize: expected.size,
        actualSize,
        expectedSha256: expected.sha256,
        actualSha256,
        state:
          actualSize === undefined
            ? ("missing" as const)
            : reason
              ? ("invalid" as const)
              : ("verified" as const),
        reason,
      });
    }
    return {
      files: results,
      allMissing: results.every((value) => value.state === "missing"),
      allVerified: results.every((value) => value.state === "verified"),
    };
  }

  private async probeExecutable(
    item: EngineItem,
    directory: string,
    signal?: AbortSignal,
  ): Promise<string | undefined> {
    if (!item.probe) return undefined;
    const binding = item.bindings.find(
      (value) => value.target === "executable" || value.target === "file",
    );
    if (!binding) return undefined;
    const executable = path.join(directory, binding.file);
    if (!fs.existsSync(executable)) return undefined;
    const result = await runCommand(executable, item.probe, {
      signal,
      timeoutMs: 20_000,
    });
    const detail = (result.stdout || result.stderr)
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 2)
      .join(" · ");
    if (result.code !== 0)
      throw new WeaverError("ENGINE_PROBE_FAILED", "引擎可执行文件探测失败", {
        id: item.id,
        detail,
      });
    return detail;
  }

  private pythonSpecs(requirements: string): [string, string][] {
    try {
      return fs
        .readFileSync(requirementsPath(requirements), "utf8")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#") && !line.startsWith("-"))
        .flatMap((line) => {
          const match = /^([A-Za-z0-9][A-Za-z0-9._-]*)==([A-Za-z0-9][A-Za-z0-9._-]*)/.exec(line);
          return match ? [[match[1], match[2]] as [string, string]] : [];
        });
    } catch {
      return [];
    }
  }

  private async probePythonEnvironment(
    item: EngineItem,
    directory: string,
    signal?: AbortSignal,
  ): Promise<{ detail: string; problems: string[] }> {
    const binding = item.bindings[0];
    const python =
      binding && binding.target !== "directory"
        ? path.join(directory, binding.file)
        : path.join(directory, process.platform === "win32" ? "Scripts/python.exe" : "bin/python");
    const requirements =
      item.source.kind === "python-env" ? item.source.requirements : "";
    const specs = this.pythonSpecs(requirements);
    const code = [
      "import importlib.metadata as m, json, sys",
      "specs = json.loads(sys.argv[1])",
      "packages = {}",
      "for name in specs:",
      "    try:",
      "        packages[name] = m.version(name)",
      "    except Exception:",
      "        packages[name] = None",
      "print(json.dumps({'python': sys.version.split()[0], 'packages': packages}))",
    ].join("\n");
    const result = await runCommand(
      python,
      ["-c", code, JSON.stringify(specs.map(([name]) => name))],
      { signal, timeoutMs: 30_000 },
    );
    if (result.code !== 0)
      return {
        detail: "",
        problems: [
          `Python 探测失败：${(result.stderr || result.stdout).trim().split(/\r?\n/).slice(-3).join(" ")}`,
        ],
      };
    let parsed: { python: string; packages: Record<string, string | null> };
    try {
      parsed = z
        .object({
          python: z.string(),
          packages: z.record(z.string(), z.string().nullable()),
        })
        .parse(JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1) || ""));
    } catch {
      return { detail: "", problems: ["Python 探测输出无效"] };
    }
    const problems = specs.flatMap(([name, version]) => {
      const actual = parsed.packages[name];
      if (!actual) return [`缺少 Python 包 ${name}==${version}`];
      return actual === version ? [] : [`Python 包 ${name} 版本为 ${actual}，需要 ${version}`];
    });
    return { detail: `Python ${parsed.python}`, problems };
  }

  async verify(
    id: string,
    root?: string,
  ): Promise<z.infer<typeof EngineVerifyResult>> {
    const item = this.item(id),
      base = this.rootDirectory(root || this.installRoot().value);
    return this.verifyDirectory(item, base, installDirectory(base, item.id));
  }

  private async verifyDirectory(
    item: EngineItem,
    base: string,
    directory: string,
  ): Promise<z.infer<typeof EngineVerifyResult>> {
    const id = item.id,
      marker = readMarker(directory),
      verifiedAt = new Date().toISOString();
    if (item.kind === "python-env") {
      if (!fs.existsSync(directory))
        return EngineVerifyResult.parse({
          id,
          root: base,
          directory,
          state: "missing",
          version: "",
          files: [],
          verifiedAt,
        });
      const emptyFiles: z.infer<typeof ModelFileState>[] = [];
      if (!marker)
        return EngineVerifyResult.parse({
          id,
          root: base,
          directory,
          state: "invalid",
          version: "",
          files: emptyFiles,
          reason: "环境目录不是本应用安装的",
          verifiedAt,
        });
      if (marker.version !== item.version)
        return EngineVerifyResult.parse({
          id,
          root: base,
          directory,
          state: "invalid",
          version: marker.version,
          files: emptyFiles,
          reason: "已安装环境与当前 requirements 版本不同",
          verifiedAt,
        });
      const probe = await this.probePythonEnvironment(item, directory);
      return EngineVerifyResult.parse({
        id,
        root: base,
        directory,
        state: probe.problems.length ? "invalid" : "verified",
        version: marker.version,
        files: emptyFiles,
        ...(probe.detail ? { detail: probe.detail } : {}),
        ...(probe.problems.length ? { reason: probe.problems.join("；") } : {}),
        verifiedAt,
      });
    }
    const hashed = await this.hashFiles(directory, item.files);
    let detail: string | undefined;
    let probeProblem: string | undefined;
    if (hashed.allVerified && marker?.version === item.version) {
      try {
        detail = await this.probeExecutable(item, directory);
      } catch (error) {
        probeProblem =
          error instanceof WeaverError
            ? `${error.message}${
                error.details
                  ? `：${JSON.stringify(error.details).slice(0, 500)}`
                  : ""
              }`
            : String(error);
      }
    }
    const reason = !hashed.allVerified && !hashed.allMissing
      ? hashed.files.find((value) => value.state === "invalid")?.reason ||
        "文件与发布清单不一致"
      : marker === undefined
        ? "目录不是本应用安装的，无法确认版本"
        : marker.version !== item.version
          ? `已安装版本 ${marker.version} 与当前发布 ${item.version} 不同`
          : probeProblem;
    return EngineVerifyResult.parse({
      id,
      root: base,
      directory,
      state: hashed.allMissing
        ? "missing"
        : hashed.allVerified && !probeProblem && marker?.version === item.version
          ? "verified"
          : "invalid",
      version: marker?.version || "",
      files: hashed.files,
      ...(detail ? { detail } : {}),
      ...(reason ? { reason } : {}),
      verifiedAt,
    });
  }

  install(raw: unknown) {
    const input = EngineInstallInput.parse(raw),
      item = this.item(input.id),
      root = this.rootDirectory(input.root),
      prior = this.jobs.prior("engine-install", input.requestId, {
        id: input.id,
        root,
      });
    if (prior) return prior;
    if (this.locks.has(`${root}:${input.id}`))
      throw new WeaverError(
        "ENGINE_BUSY",
        "该引擎已有安装作业进行中",
        { id: input.id },
        [],
        true,
      );
    return this.jobs.submit({
      requestInput: { id: input.id, root },
      kind: "engine-install",
      snapshot: {
        id: item.id,
        version: item.version,
        platform: item.platform,
        root,
        source: item.source,
        files: item.files,
      },
      nodes: [
        {
          key: `install-${item.id}`,
          operation: "engine-install",
          input: { id: item.id, version: item.version, root },
        },
      ],
      requestId: input.requestId,
    });
  }

  async adopt(input: {
    id: string;
    directory?: string;
    expectedRevision: string;
    requestId: string;
  }) {
    const item = this.item(input.id),
      base = this.rootDirectory(),
      directory = input.directory
        ? path.resolve(this.root, input.directory)
        : installDirectory(base, item.id),
      verification = await this.verifyDirectory(item, base, directory);
    if (verification.state !== "verified")
      throw new WeaverError(
        "ENGINE_VERIFY_FAILED",
        "引擎目录未通过完整性校验，未写入配置",
        verification,
      );
    const patch: Record<string, string> = {};
    for (const binding of item.bindings) {
      if (!SETTINGS[binding.setting])
        throw new WeaverError("INVALID_INPUT", "引擎绑定使用未知设置项", {
          id: item.id,
          setting: binding.setting,
        });
      patch[binding.setting] = engineBindingValue(directory, binding);
    }
    const identity = { operation: "engine-adopt", id: item.id, directory };
    return this.models.writeSettingsPatch({
      requestId: input.requestId,
      expectedRevision: input.expectedRevision,
      patch,
      identity,
    });
  }

  private async installNode(context: NodeContext) {
    const input = z
      .object({ id: z.string(), version: z.string(), root: z.string() })
      .parse(context.input);
    const item = this.item(input.id),
      root = path.resolve(input.root),
      directory = installDirectory(root, item.id),
      lock = `${root}:${input.id}`;
    if (input.version !== item.version)
      throw new WeaverError("ENGINE_RELEASE_CHANGED", "引擎发布版本已改变");
    if (this.locks.has(lock))
      throw new WeaverError(
        "ENGINE_BUSY",
        "该引擎已有安装作业进行中",
        { id: item.id },
        [],
        true,
      );
    this.locks.add(lock);
    const diskLock = path.join(root, `.lightweaver-lock-${item.id}`);
    let locked = false;
    try {
      locked = this.acquireDiskLock(diskLock, context.token);
      if (!locked)
        throw new WeaverError(
          "ENGINE_BUSY",
          "该引擎正在被另一个进程安装",
          { id: item.id },
          [],
          true,
        );
      const existing = await this.verify(item.id, root);
      if (existing.state === "verified") return existing;
      fs.mkdirSync(root, { recursive: true });
      const stage = path.join(root, ".lightweaver-staging", context.token);
      await fsp.mkdir(stage, { recursive: true, mode: 0o700 });
      try {
        return item.kind === "python-env"
          ? await this.installPython(context, item, root, directory)
          : await this.installArtifact(context, item, root, directory, stage);
      } finally {
        await fsp.rm(stage, { recursive: true, force: true });
      }
    } finally {
      if (locked) fs.rmSync(diskLock, { recursive: true, force: true });
      this.locks.delete(lock);
    }
  }

  /** 跨进程安装锁；遗留锁按属主进程是否存活回收。 */
  private acquireDiskLock(dir: string, token: string): boolean {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        fs.mkdirSync(dir, { recursive: false, mode: 0o700 });
        fs.writeFileSync(
          path.join(dir, "owner.json"),
          JSON.stringify({ pid: process.pid, token, createdAt: Date.now() }),
          { mode: 0o600 },
        );
        return true;
      } catch (error) {
        if (!isEexist(error)) throw error;
        const stale = this.staleLock(dir);
        if (!stale) return false;
        fs.rmSync(dir, { recursive: true, force: true });
      }
    }
    return false;
  }

  private staleLock(dir: string): boolean {
    try {
      const owner = z
        .object({ pid: z.number(), createdAt: z.number() })
        .parse(
          JSON.parse(fs.readFileSync(path.join(dir, "owner.json"), "utf8")),
        );
      if (Date.now() - owner.createdAt > 6 * 60 * 60 * 1000) return true;
      try {
        process.kill(owner.pid, 0);
        return false;
      } catch (error) {
        return (
          !!error &&
          typeof error === "object" &&
          "code" in error &&
          error.code === "ESRCH"
        );
      }
    } catch {
      return true;
    }
  }

  private async installArtifact(
    context: NodeContext,
    item: EngineItem,
    root: string,
    directory: string,
    stage: string,
  ): Promise<z.infer<typeof EngineVerifyResult>> {
    const work = path.join(stage, "work");
    if (item.source.kind === "archive") {
      const archive = path.join(stage, "artifact");
      await this.download(context, item, item.source, archive);
      context.event("engine-install-progress", {
        engineId: item.id,
        phase: "extract",
        message: "解压引擎归档",
      });
      extractArchive({
        archive,
        format: item.source.format,
        root: work,
      });
      if (item.source.stripPrefix) {
        const prefix = path.join(work, item.source.stripPrefix);
        if (!fs.existsSync(prefix))
          throw new WeaverError(
            "ENGINE_ARCHIVE_INVALID",
            "引擎归档缺少发布清单中的顶层目录",
            { id: item.id, stripPrefix: item.source.stripPrefix },
          );
        for (const entry of fs.readdirSync(prefix))
          fs.renameSync(path.join(prefix, entry), path.join(work, entry));
        fs.rmSync(prefix, { recursive: true, force: true });
      }
      if (item.source.include?.length) {
        const roots = new Set(
          item.source.include.map((prefix) => prefix.replace(/\/+$/, "").split("/")[0]),
        );
        for (const entry of fs.readdirSync(work))
          if (!roots.has(entry))
            fs.rmSync(path.join(work, entry), { recursive: true, force: true });
      }
    } else {
      const target = path.join(work, item.files[0]?.path || "artifact");
      await this.download(context, item, item.source, target);
    }
    context.signal.throwIfAborted();
    context.event("engine-install-progress", {
      engineId: item.id,
      phase: "verify",
      message: "校验引擎文件",
    });
    const hashed = await this.hashFiles(work, item.files);
    if (!hashed.allVerified)
      throw new WeaverError(
        "ENGINE_VERIFY_FAILED",
        "引擎归档解压后未通过完整性校验",
        { id: item.id, files: hashed.files },
      );
    for (const expected of item.files)
      if (expected.executable)
        await fsp.chmod(path.join(work, expected.path), 0o755);
    writeMarker(work, {
      schemaVersion: MARKER_SCHEMA,
      id: item.id,
      version: item.version,
      platform: item.platform,
      sourceSha256: item.source.kind === "python-env" ? "" : item.source.sha256,
      installedAt: new Date().toISOString(),
    });
    context.signal.throwIfAborted();
    context.event("engine-install-progress", {
      engineId: item.id,
      phase: "publish",
      message: "发布引擎目录",
    });
    this.publish(work, directory, context.token);
    return this.verify(item.id, root);
  }

  private publish(work: string, directory: string, token: string): void {
    fs.mkdirSync(path.dirname(directory), { recursive: true });
    if (!fs.existsSync(directory)) {
      fs.renameSync(work, directory);
      return;
    }
    if (!readMarker(directory))
      throw new WeaverError(
        "ENGINE_TARGET_CONFLICT",
        "目标引擎目录已有非本应用安装的内容，未覆盖",
        { directory },
      );
    const backup = `${directory}.old-${token}`;
    fs.rmSync(backup, { recursive: true, force: true });
    fs.renameSync(directory, backup);
    try {
      fs.renameSync(work, directory);
    } catch (error) {
      fs.renameSync(backup, directory);
      throw error;
    }
    fs.rmSync(backup, { recursive: true, force: true });
  }

  private async download(
    context: NodeContext,
    item: EngineItem,
    source: z.infer<typeof EngineCatalogItem>["source"],
    destination: string,
  ): Promise<void> {
    if (source.kind === "python-env") return;
    let reportedAt = 0;
    await downloadArtifact({
      url: source.url,
      size: source.size,
      sha256: source.sha256,
      destination,
      signal: context.signal,
      onProgress: (received, total) => {
        if (Date.now() - reportedAt < 250) return;
        reportedAt = Date.now();
        context.event("engine-install-progress", {
          engineId: item.id,
          phase: "download",
          received,
          total,
        });
      },
    });
  }

  private pythonCandidates(): { command: string; args: string[] }[] {
    const runtime = currentRuntime(),
      candidates: { command: string; args: string[] }[] = [];
    if (runtime.tools.python)
      candidates.push({ command: runtime.tools.python, args: [] });
    if (process.env.LIGHTWEAVER_PYTHON)
      candidates.push({ command: process.env.LIGHTWEAVER_PYTHON, args: [] });
    if (process.platform === "win32")
      candidates.push(
        { command: "py", args: ["-3.12"] },
        { command: "python", args: [] },
        { command: "python3", args: [] },
      );
    else
      candidates.push(
        { command: "python3.12", args: [] },
        { command: "python3", args: [] },
        { command: "python", args: [] },
      );
    return candidates;
  }

  private async pythonLauncher(): Promise<{ command: string; args: string[] }> {
    for (const candidate of this.pythonCandidates()) {
      try {
        const result = await runCommand(candidate.command, [
          ...candidate.args,
          "-c",
          "import sys;print('%d.%d' % sys.version_info[:2])",
        ], { timeoutMs: 15_000 });
        const version = result.stdout.trim();
        if (result.code === 0 && /^\d+\.\d+$/.test(version)) {
          const [major, minor] = version.split(".").map(Number);
          if (major > 3 || (major === 3 && minor >= 10)) return candidate;
        }
      } catch {
        continue;
      }
    }
    throw new WeaverError(
      "CAPABILITY_UNAVAILABLE",
      "找不到可创建 Python 环境的解释器（需要 Python 3.10 以上）",
      null,
      ["在设置页指定可用的 Python，或安装 Python 3.12 后重试。"],
    );
  }

  private async installPython(
    context: NodeContext,
    item: EngineItem,
    root: string,
    directory: string,
  ): Promise<z.infer<typeof EngineVerifyResult>> {
    if (item.source.kind !== "python-env")
      throw new WeaverError("INVALID_INPUT", "不是 Python 环境引擎");
    const requirements = requirementsPath(item.source.requirements);
    if (!fs.existsSync(requirements))
      throw new WeaverError("CONFIG_MISSING", "缺少 Python 依赖清单", {
        file: requirements,
      });
    const exists = fs.existsSync(directory);
    if (exists && !readMarker(directory))
      throw new WeaverError(
        "ENGINE_TARGET_CONFLICT",
        "目标 Python 环境目录不是本应用安装的，未覆盖",
        { directory },
      );
    let created = false;
    try {
      if (!exists) {
        const launcher = await this.pythonLauncher();
        context.event("engine-install-progress", {
          engineId: item.id,
          phase: "venv",
          message: "创建 Python 环境",
        });
        await this.stream(context, item, "venv", launcher.command, [
          ...launcher.args,
          "-m",
          "venv",
          directory,
        ]);
        created = true;
      }
      const python =
        process.platform === "win32"
          ? path.join(directory, "Scripts", "python.exe")
          : path.join(directory, "bin", "python");
      if (!fs.existsSync(python))
        throw new WeaverError("ENGINE_INSTALL_FAILED", "Python 环境缺少解释器", {
          directory,
        });
      context.event("engine-install-progress", {
        engineId: item.id,
        phase: "pip",
        message: `安装 ${item.source.requirements}`,
      });
      await this.stream(context, item, "pip", python, [
        "-m",
        "pip",
        "install",
        "--disable-pip-version-check",
        "--no-input",
        "-r",
        requirements,
      ]);
      context.signal.throwIfAborted();
      const probe = await this.probePythonEnvironment(item, directory, context.signal);
      if (probe.problems.length)
        throw new WeaverError(
          "ENGINE_VERIFY_FAILED",
          "Python 环境安装后校验失败",
          { id: item.id, problems: probe.problems },
        );
      writeMarker(directory, {
        schemaVersion: MARKER_SCHEMA,
        id: item.id,
        version: item.version,
        platform: item.platform,
        sourceSha256: createHash("sha256")
          .update(fs.readFileSync(requirements))
          .digest("hex"),
        installedAt: new Date().toISOString(),
      });
      return this.verify(item.id, root);
    } catch (error) {
      if (created) await fsp.rm(directory, { recursive: true, force: true });
      throw error;
    }
  }

  private async stream(
    context: NodeContext,
    item: EngineItem,
    phase: string,
    command: string,
    args: string[],
  ): Promise<void> {
    let reportedAt = 0;
    const result = await runCommand(command, args, {
      signal: context.signal,
      onLine: (line) => {
        if (Date.now() - reportedAt < 300) return;
        reportedAt = Date.now();
        context.event("engine-install-progress", {
          engineId: item.id,
          phase,
          message: line.slice(0, 500),
        });
      },
    });
    if (result.code !== 0)
      throw new WeaverError(
        "ENGINE_INSTALL_FAILED",
        "Python 环境安装命令失败",
        {
          id: item.id,
          code: result.code,
          detail: (result.stderr || result.stdout).slice(-2000),
        },
        [],
        true,
      );
  }
}
