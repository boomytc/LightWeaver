import fs from "node:fs";
import fsp from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import {
  z,
  DownloadInput,
  Id,
  ModelSettingsPatch,
  ModelSettingsView,
  ModelStatus,
  ModelsView,
  VerifyResult,
} from "../contracts/index.ts";
import { WeaverError } from "../contracts/errors.ts";
import {
  configRevision,
  localConfigPath,
  readConfig,
  modelbestBackend,
  patchLocalConfig,
  replayConfigRequest,
} from "../config.ts";
import { Jobs, type NodeContext } from "../jobs/index.ts";
import {
  defaultModelPython,
  resolveExecutable,
} from "../adapters/executable.ts";
import { currentRuntime } from "../runtime.ts";
import { fileDigest } from "../adapters/toolchain.ts";
import {
  catalog,
  downloadUrl,
  localModels,
  modelBindingValue,
  MODELBEST_TTS_MODEL,
  MODELBEST_VLM_MODEL,
  type DownloadableLocalModel,
} from "./catalog.ts";

type Setting = Parameters<ReturnType<typeof readConfig>["field"]>[0];
type CatalogFile = DownloadableLocalModel["catalog"]["files"][number];

const SETTINGS: Record<string, Setting> = {
  modelbestBaseUrl: { key: "modelbest_base_url", environment: "MODELBEST_BASE_URL" },
  downloadRoot: {
    key: "model_download_root",
    environment: "LIGHTWEAVER_MODEL_DOWNLOAD_ROOT",
  },
  vlmProvider: {
    key: "vlm_provider",
    environment: "LIGHTWEAVER_VLM_PROVIDER",
  },
  vlmModel: {
    key: "vlm_model",
    environment: "LIGHTWEAVER_VLM_MODEL",
  },
  ttsModel: {
    key: "tts_model",
    environment: "LIGHTWEAVER_TTS_MODEL",
  },
  modelPython: {
    key: "model_python",
    environment: "LIGHTWEAVER_MODEL_PYTHON",
    fallback: defaultModelPython(),
  },
  llamaServer: {
    key: "llama_server",
    environment: "LIGHTWEAVER_LLAMA_SERVER",
  },
  asrModel: { key: "asr_model", environment: "LIGHTWEAVER_ASR_MODEL" },
  asrLibrary: { key: "asr_library", environment: "TRANSCRIBE_LIBRARY" },
  asrBindings: {
    key: "asr_bindings",
    environment: "LIGHTWEAVER_ASR_BINDINGS",
  },
  vadLibrary: { key: "vad_library", environment: "LIGHTWEAVER_VAD_LIBRARY" },
  visualModel: { key: "visual_model", environment: "LIGHTWEAVER_VISUAL_MODEL" },
  visualMmproj: {
    key: "visual_mmproj",
    environment: "LIGHTWEAVER_VISUAL_MMPROJ",
  },
  visualServer: {
    key: "visual_server",
    environment: "LIGHTWEAVER_VISUAL_SERVER",
  },
  alignmentModel: {
    key: "alignment_model",
    environment: "LIGHTWEAVER_ALIGNMENT_MODEL",
  },
  alignmentBackend: {
    key: "alignment_backend",
    environment: "LIGHTWEAVER_ALIGNMENT_BACKEND",
  },
  alignmentDevice: {
    key: "alignment_device",
    environment: "LIGHTWEAVER_ALIGNMENT_DEVICE",
  },
};

function field(
  root: string,
  setting: Setting,
  env: NodeJS.ProcessEnv,
): z.infer<typeof ModelSettingsView>["values"][string] {
  return readConfig({ root, env }).field(setting);
}

function resolvePath(root: string, value: string): string {
  return value ? path.resolve(root, value) : "";
}

function checkPath(
  file: string,
  kind: "file" | "directory" | "executable",
): boolean {
  if (!file) return false;
  try {
    const stat = fs.statSync(file);
    if (kind === "directory") return stat.isDirectory();
    if (!stat.isFile()) return false;
    if (kind === "executable") fs.accessSync(file, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function safeRelative(value: string): void {
  if (
    path.isAbsolute(value) ||
    value.split(/[\\/]/).includes("..") ||
    /[\u0000-\u001f\u007f]/.test(value)
  )
    throw new WeaverError("INVALID_INPUT", "模型目录包含不安全路径", {
      path: value,
    });
}

function isEexist(error: unknown): boolean {
  return (
    !!error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "EEXIST"
  );
}

export class Models {
  constructor(
    private readonly root: string,
    private readonly jobs: Jobs,
  ) {
    jobs.register("model-download", (context) => this.downloadNode(context));
  }

  private model(id: string): DownloadableLocalModel {
    const found = localModels().find((item) => item.catalog.id === id);
    if (!found)
      throw new WeaverError("INVALID_INPUT", "未知本地模型", { id });
    if (!found.catalog.available)
      throw new WeaverError(
        "CAPABILITY_UNAVAILABLE",
        found.catalog.unavailableReason || "当前平台没有可用模型文件",
        { id, platform: found.catalog.platform },
      );
    return found;
  }

  settings(env: NodeJS.ProcessEnv = process.env) {
    const content = fs.existsSync(localConfigPath(this.root))
      ? fs.readFileSync(localConfigPath(this.root), "utf8")
      : "";
    return this.settingsFromContent(content, env);
  }

  private settingsFromContent(content: string, env: NodeJS.ProcessEnv) {
    const config = readConfig({ root: this.root, env, localContent: content });
    const values = Object.fromEntries(
      Object.entries(SETTINGS).map(([name, setting]) => [
        name,
        config.field(setting),
      ]),
    );
    if (values.downloadRoot.source === "unset")
      values.downloadRoot = {
        value: currentRuntime().modelDir,
        source: "default",
      };
    const key = config.field({
      key: "modelbest_api_key",
      environment: "MODELBEST_API_KEY",
    });
    return ModelSettingsView.parse({
      configPath: localConfigPath(this.root),
      revision: configRevision(content),
      downloadRoot: values.downloadRoot,
      values,
      apiKeys: {
        modelbest: {
          configured: key.source !== "unset",
          source: key.source,
        },
      },
    });
  }

  catalog() {
    const configured = modelbestBackend(this.root);
    return catalog(configured.key.length > 0, configured.base);
  }

  view(downloadRoot?: string) {
    const settings = this.settings(),
      base = downloadRoot || settings.downloadRoot.value,
      items = localModels();
    return ModelsView.parse({
      catalog: this.catalog(),
      settings,
      local: items.map((item) => ({
        id: item.catalog.id,
        status: this.metadataStatus(item, base),
        activeBindings: item.catalog.bindings.map((binding) => ({
          setting: binding.setting,
          ...field(this.root, SETTINGS[this.settingName(binding.setting)], process.env),
        })),
        runtime: item.catalog.runtimeRequirements.map((requirement) => {
          const setting = SETTINGS[this.settingName(requirement.setting)];
          const value = setting
            ? field(this.root, setting, process.env).value
            : "";
          return {
            setting: requirement.setting,
            label: requirement.label,
            documentationUrl: requirement.documentationUrl,
            ready: checkPath(
              requirement.kind === "executable"
                ? resolveExecutable(value, this.root)
                : resolvePath(this.root, value),
              requirement.kind,
            ),
          };
        }),
      })),
      downloads: this.jobs
        .list()
        .filter((run) => run.kind === "model-download")
        .slice(0, 20),
    });
  }

  save(input: { payload: unknown; requestId: string }) {
    Id.parse(input.requestId);
    const request = ModelSettingsPatch.parse(input.payload),
      patch: Record<string, string | undefined> = {};
    if (request.modelbestApiKey?.trim())
      patch.modelbest_api_key = request.modelbestApiKey.trim();
    if (request.clearModelbestApiKey) patch.modelbest_api_key = "";
    if (request.downloadRoot !== undefined)
      patch.model_download_root = request.downloadRoot.trim();
    for (const [name, value] of Object.entries(request)) {
      if (
        name === "expectedRevision" ||
        name === "modelbestApiKey" ||
        name === "clearModelbestApiKey" ||
        value === undefined
      )
        continue;
      const setting = SETTINGS[name];
      if (setting && typeof value === "string") patch[setting.key] = value.trim();
    }
    return this.writeSettings({
      root: this.root,
      requestId: input.requestId,
      expectedRevision: request.expectedRevision,
      patch,
    });
  }

  adoptProvider(input: {
    id: string;
    expectedRevision: string;
    requestId: string;
  }) {
    if (input.id !== "modelbest")
      throw new WeaverError("INVALID_INPUT", "未知供应商预设", {
        id: input.id,
      });
    return this.writeSettings({
      root: this.root,
      requestId: input.requestId,
      expectedRevision: input.expectedRevision,
      patch: {
        vlm_provider: "modelbest-vlm",
        vlm_model: MODELBEST_VLM_MODEL,
        tts_model: MODELBEST_TTS_MODEL,
      },
    });
  }

  download(raw: unknown) {
    const input = DownloadInput.parse(raw),
      item = this.model(input.id),
      root = resolvePath(this.root, input.root),
      prior = this.jobs.prior(
        "model-download",
        input.requestId,
        { id: input.id, root },
      );
    if (prior) return prior;
    return this.jobs.submit({
      requestInput: { id: input.id, root },
      kind: "model-download",
      snapshot: {
        id: item.catalog.id,
        revision: item.catalog.revision,
        root,
        files: item.catalog.files,
      },
      nodes: [
        {
          key: `download-${item.catalog.id}`,
          operation: "model-download",
          input: {
            id: item.catalog.id,
            revision: item.catalog.revision,
            root,
          },
        },
      ],
      requestId: input.requestId,
    });
  }

  async verify(id: string, root: string) {
    const item = this.model(id),
      resolved = resolvePath(this.root, root),
      directory = this.directory(resolved, item);
    return this.verifyDirectory(item, resolved, directory);
  }

  adopt(input: {
    id: string;
    directory: string;
    expectedRevision: string;
    requestId: string;
  }) {
    Id.parse(input.requestId);
    const resolved = resolvePath(this.root, input.directory);
    const identity = { operation: "model-adopt", id: input.id, directory: resolved };
    const prior = replayConfigRequest({ ...input, root: this.root, identity, resultSchema: ModelSettingsView });
    if (prior) return Promise.resolve(prior);
    const item = this.model(input.id);
    let isFile = false;
    try {
      isFile = fs.statSync(resolved).isFile();
    } catch {
      isFile = false;
    }
    if (isFile && item.catalog.files.length !== 1)
      throw new WeaverError(
        "INVALID_INPUT",
        "多文件模型必须采用完整目录",
        { id: input.id },
      );
    const verification = isFile
      ? this.verifySingleFile(item, resolved)
      : this.verifyDirectory(item, path.dirname(resolved), resolved);
    return verification.then(
      async (verified) => {
        if (verified.state !== "verified")
          throw new WeaverError(
            "MODEL_VERIFY_FAILED",
            "已有模型目录未通过大小与 SHA-256 校验",
            verified,
          );
        const patch: Record<string, string> = {};
        for (const binding of item.catalog.bindings) {
          if (isFile) {
            if (binding.target !== "file")
              throw new WeaverError(
                "INVALID_INPUT",
                "单文件模型包含不兼容的目录绑定",
                { id: input.id, setting: binding.setting },
              );
            patch[binding.setting] = resolved;
            continue;
          }
          safeRelative(binding.target === "file" ? binding.file : "");
          patch[binding.setting] = modelBindingValue(item, resolved, binding);
        }
        return this.writeSettings({
          root: this.root,
          requestId: input.requestId,
          expectedRevision: input.expectedRevision,
          patch,
          identity,
        });
      },
    );
  }

  private writeSettings(input: {
    root: string;
    requestId: string;
    expectedRevision: string;
    patch: Record<string, string | undefined>;
    identity?: unknown;
  }) {
    return patchLocalConfig({
      ...input,
      resultSchema: ModelSettingsView,
      buildResult: (content) => this.settingsFromContent(content, process.env),
    });
  }

  private directory(root: string, item: DownloadableLocalModel): string {
    return path.join(root, item.catalog.id, item.catalog.revision);
  }

  private metadataStatus(
    item: DownloadableLocalModel,
    root: string,
  ): z.infer<typeof ModelStatus> {
    const base = resolvePath(this.root, root),
      directory = this.directory(base, item);
    const files = item.catalog.files.map((file) => {
      safeRelative(file.path);
      let actualSize: number | undefined;
      try {
        const stat = fs.statSync(path.join(directory, file.path));
        if (stat.isFile()) actualSize = stat.size;
      } catch {
        actualSize = undefined;
      }
      return {
        path: file.path,
        expectedSize: file.size,
        actualSize,
        state:
          actualSize === undefined
            ? ("missing" as const)
            : actualSize === file.size
              ? ("metadata-match" as const)
              : ("invalid" as const),
      };
    });
    const state = files.every((file) => file.state === "missing")
      ? "missing"
      : files.every((file) => file.state === "metadata-match")
        ? "unchecked"
        : "invalid";
    return ModelStatus.parse({ id: item.catalog.id, root: base, directory, state, files });
  }

  private async verifyDirectory(
    item: DownloadableLocalModel,
    root: string,
    directory: string,
  ): Promise<z.infer<typeof VerifyResult>> {
    const files = [];
    for (const expected of item.catalog.files) {
      safeRelative(expected.path);
      const file = path.join(directory, expected.path);
      let actualSize: number | undefined,
        actualSha256: string | undefined,
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
      const state = actualSize === undefined
        ? ("missing" as const)
        : reason
          ? ("invalid" as const)
          : ("verified" as const);
      files.push({
        path: expected.path,
        expectedSize: expected.size,
        actualSize,
        expectedSha256: expected.sha256,
        actualSha256,
        state,
        reason,
      });
    }
    const state = files.every((file) => file.state === "missing")
      ? "missing"
      : files.every((file) => file.state === "verified")
        ? "verified"
        : "invalid";
    return VerifyResult.parse({
      id: item.catalog.id,
      root,
      state,
      files,
      verifiedAt: new Date().toISOString(),
    });
  }

  private async verifySingleFile(
    item: DownloadableLocalModel,
    file: string,
  ): Promise<z.infer<typeof VerifyResult>> {
    const expected = item.catalog.files[0];
    if (!expected)
      throw new WeaverError("INVALID_INPUT", "模型没有可校验文件", {
        id: item.catalog.id,
      });
    const stat = fs.statSync(file),
      actualSha256 =
        stat.size === expected.size ? await fileDigest(file) : undefined,
      reason =
        stat.size !== expected.size
          ? "文件大小不匹配"
          : actualSha256 !== expected.sha256
            ? "SHA-256 不匹配"
            : undefined;
    return VerifyResult.parse({
      id: item.catalog.id,
      root: path.dirname(file),
      state: reason ? "invalid" : "verified",
      files: [
        {
          path: expected.path,
          expectedSize: expected.size,
          actualSize: stat.size,
          expectedSha256: expected.sha256,
          actualSha256,
          state: reason ? "invalid" : "verified",
          reason,
        },
      ],
      verifiedAt: new Date().toISOString(),
    });
  }

  private async downloadNode(context: NodeContext) {
    const input = z
        .object({ id: z.string(), revision: z.string(), root: z.string() })
        .parse(context.input),
      item = this.model(input.id);
    if (input.revision !== item.catalog.revision)
      throw new WeaverError("MODEL_RELEASE_CHANGED", "模型发布版本已改变");
    const root = resolvePath(this.root, input.root),
      directory = this.directory(root, item),
      stage = path.join(root, ".lightweaver-staging", context.token);
    await fsp.mkdir(stage, { recursive: true, mode: 0o700 });
    try {
      const existing = await this.verifyDirectory(item, root, directory);
      if (existing.state === "verified") return existing;
      for (const [index, expected] of item.catalog.files.entries()) {
        context.signal.throwIfAborted();
        safeRelative(expected.path);
        const final = path.join(directory, expected.path),
          staged = path.join(stage, expected.path);
        if (await this.matches(final, expected)) {
          context.event("model-download-progress", {
            modelId: item.catalog.id,
            file: expected.path,
            completedFiles: index + 1,
            totalFiles: item.catalog.files.length,
            reused: true,
          });
          continue;
        }
        await this.downloadFile(
          item,
          expected,
          staged,
          index,
          context,
        );
        context.signal.throwIfAborted();
        await fsp.mkdir(path.dirname(final), { recursive: true });
        try {
          fs.linkSync(staged, final);
        } catch (error) {
          if (!isEexist(error))
            throw new WeaverError(
              "MODEL_PUBLISH_FAILED",
              "无法发布已校验的模型文件",
              { file: expected.path },
            );
          if (!(await this.matches(final, expected)))
            throw new WeaverError(
              "MODEL_TARGET_CONFLICT",
              "目标位置已有不同内容的模型文件，未覆盖",
              { file: final },
            );
        }
        if (expected.executable) await fsp.chmod(final, 0o755);
        context.event("model-download-progress", {
          modelId: item.catalog.id,
          file: expected.path,
          completedFiles: index + 1,
          totalFiles: item.catalog.files.length,
          reused: false,
        });
      }
      const result = await this.verifyDirectory(item, root, directory);
      if (result.state !== "verified")
        throw new WeaverError(
          "MODEL_VERIFY_FAILED",
          "模型下载完成后未通过完整性校验",
          result,
        );
      return result;
    } finally {
      await fsp.rm(stage, { recursive: true, force: true });
    }
  }

  private async matches(
    file: string,
    expected: CatalogFile,
  ): Promise<boolean> {
    try {
      const stat = fs.statSync(file);
      if (!stat.isFile() || stat.size !== expected.size) return false;
      return (await fileDigest(file)) === expected.sha256;
    } catch {
      return false;
    }
  }

  private async downloadFile(
    item: DownloadableLocalModel,
    expected: CatalogFile,
    destination: string,
    fileIndex: number,
    context: NodeContext,
  ): Promise<void> {
    const url = downloadUrl(item, expected);
    let response: Response;
    try {
      response = await fetch(url, { signal: context.signal, redirect: "follow" });
    } catch {
      if (context.signal.aborted)
        throw new WeaverError("CANCELLED", "模型下载已取消");
      throw new WeaverError("NETWORK_ERROR", "模型下载请求失败", null, [], true);
    }
    if (!response.ok || !response.body) {
      await response.body?.cancel().catch(() => undefined);
      throw new WeaverError(
        "NETWORK_ERROR",
        `模型下载返回 HTTP ${response.status}`,
        { status: response.status },
        [],
        response.status === 429 || response.status >= 500,
      );
    }
    const declared = Number(response.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > 0 && declared !== expected.size) {
      await response.body.cancel().catch(() => undefined);
      throw new WeaverError("MODEL_SIZE_MISMATCH", "下载响应大小与发布清单不一致", {
        expected: expected.size,
        actual: declared,
      });
    }
    const reader = response.body.getReader(),
      hash = createHash("sha256");
    let handle: FileHandle | undefined,
      received = 0,
      reportedAt = 0;
    try {
      await fsp.mkdir(path.dirname(destination), {
        recursive: true,
        mode: 0o700,
      });
      handle = await fsp.open(destination, "wx", 0o600);
      while (true) {
        context.signal.throwIfAborted();
        const chunk = await reader.read();
        if (chunk.done) break;
        received += chunk.value.byteLength;
        if (received > expected.size)
          throw new WeaverError("MODEL_SIZE_MISMATCH", "下载内容超过发布大小", {
            expected: expected.size,
            actual: received,
          });
        hash.update(chunk.value);
        await handle.write(chunk.value);
        if (Date.now() - reportedAt >= 1000) {
          reportedAt = Date.now();
          context.event("model-download-progress", {
            modelId: item.catalog.id,
            file: expected.path,
            fileIndex: fileIndex + 1,
            totalFiles: item.catalog.files.length,
            received,
            total: expected.size,
          });
        }
      }
      await handle.sync();
    } catch (error) {
      if (context.signal.aborted)
        throw new WeaverError("CANCELLED", "模型下载已取消");
      throw error;
    } finally {
      await handle?.close().catch(() => undefined);
      await reader.cancel().catch(() => undefined);
      reader.releaseLock();
    }
    const actualSha256 = hash.digest("hex");
    if (received !== expected.size || actualSha256 !== expected.sha256)
      throw new WeaverError("MODEL_VERIFY_FAILED", "下载文件完整性校验失败", {
        file: expected.path,
        expectedSize: expected.size,
        actualSize: received,
        expectedSha256: expected.sha256,
        actualSha256,
      });
    if (expected.executable) await fsp.chmod(destination, 0o755);
  }

  private settingName(setting: string): string {
    const entry = Object.entries(SETTINGS).find(
      ([, value]) => value.key === setting,
    );
    return entry?.[0] || "";
  }
}
