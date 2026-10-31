import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z, VlmProvider, ProviderDescriptor } from "../contracts/index.ts";
import { WeaverError } from "../contracts/errors.ts";
import {
  localConfigValue,
  modelbestBackend,
  deepseekBackend,
} from "../config.ts";
import { processRun } from "../media/process.ts";
import { Store } from "../store/index.ts";
import { localModelDigest } from "./toolchain.ts";
import { readSpeechWav } from "./speech.ts";

export const workspaceRoot = fileURLToPath(
  new URL("../../../", import.meta.url),
);
const scripts = fileURLToPath(new URL("../../scripts/", import.meta.url));
const cfg = (env: string, key: string) =>
  process.env[env]?.trim() || localConfigValue(key, workspaceRoot);
export const AsrResult = z.object({
  text: z.string(),
  language: z.string(),
  seconds: z.number().nonnegative(),
  timingQuality: z.enum(["native", "estimated"]).default("estimated"),
  vad: z
    .object({
      backend: z.literal("ten-vad"),
      version: z.string(),
      ranges: z.array(
        z.object({
          start: z.number().nonnegative(),
          end: z.number().nonnegative(),
        }),
      ),
    })
    .optional(),
  sentences: z
    .array(
      z.object({
        text: z.string(),
        start: z.number(),
        end: z.number(),
        words: z
          .array(
            z.object({ token: z.string(), start: z.number(), end: z.number() }),
          )
          .optional(),
      }),
    )
    .optional(),
});
export const AlignmentResult = z.object({
  backend: z.literal("whisperx"),
  version: z.string(),
  model: z.string(),
  segments: z.array(
    z.object({
      text: z.string(),
      start: z.number().nonnegative(),
      end: z.number().nonnegative(),
    }),
  ),
});
export const EmbeddingResult = z.object({
  model: z.string(),
  revision: z.string(),
  vectors: z.array(z.array(z.number().finite()).min(1)),
});

export class Providers {
  constructor(private readonly store: Store) {}
  descriptors() {
    const modelbest = modelbestBackend(workspaceRoot),
      deepseek = deepseekBackend(workspaceRoot);
    return z.array(ProviderDescriptor).parse([
      {
        id: "modelbest-voxcpm2",
        name: "ModelBest 语音协议",
        capabilities: ["tts", "voice-design"],
        model: cfg("LIGHTWEAVER_TTS_MODEL", "tts_model") || "VoxCPM2",
        version: "speech-sse-wav-v2",
        endpoint: modelbest.base,
        ready: !!modelbest.key,
        remote: true,
        idempotency: false,
        cancellation: "local-abort-remote-unknown",
        hint: "配置 MODELBEST_API_KEY 或 config.local.yaml 的 modelbest_api_key",
      },
      {
        id: "modelbest-vlm",
        name: "ModelBest 画面观察",
        capabilities: ["describe"],
        model:
          cfg("LIGHTWEAVER_VLM_MODEL", "vlm_model") || "MiniCPM-V-4.7-35B-A3B",
        version: "chat-no-thinking-v2",
        endpoint: modelbest.base,
        ready: !!modelbest.key,
        remote: true,
        idempotency: false,
        cancellation: "local-abort-remote-unknown",
        hint: "配置 ModelBest 密钥与 LIGHTWEAVER_VLM_MODEL",
      },
      {
        id: "deepseek-vlm",
        name: "DeepSeek 画面观察",
        capabilities: ["describe"],
        model:
          cfg("LIGHTWEAVER_DEEPSEEK_MODEL", "deepseek_model") ||
          "deepseek-flash",
        version: "chat-thinking-disabled-v1",
        endpoint: deepseek.base,
        ready: !!deepseek.key,
        remote: true,
        idempotency: false,
        cancellation: "local-abort-remote-unknown",
        hint: "配置 DEEPSEEK_API_KEY，可选 DEEPSEEK_BASE_URL",
      },
      {
        id: "qwen3-asr",
        name: "本地 TEN VAD + Qwen3-ASR",
        capabilities: ["asr"],
        model: path.basename(cfg("LIGHTWEAVER_ASR_MODEL", "asr_model")),
        version: "ten-vad-qwen-gguf-v2",
        endpoint: "local-process",
        ready: [
          cfg("LIGHTWEAVER_ASR_MODEL", "asr_model"),
          cfg("TRANSCRIBE_LIBRARY", "asr_library"),
          cfg("LIGHTWEAVER_ASR_BINDINGS", "asr_bindings"),
          cfg("LIGHTWEAVER_VAD_LIBRARY", "vad_library"),
        ].every((v) => v && fs.existsSync(v)),
        remote: false,
        idempotency: true,
        cancellation: "process-tree",
        hint: "配置 LIGHTWEAVER_ASR_MODEL、TRANSCRIBE_LIBRARY、LIGHTWEAVER_ASR_BINDINGS、LIGHTWEAVER_VAD_LIBRARY",
      },
      {
        id: "whisperx",
        name: "WhisperX 强制对齐",
        capabilities: ["alignment"],
        model: cfg("LIGHTWEAVER_ALIGNMENT_MODEL", "alignment_model"),
        version: "whisperx-3.8.4-adapter-1",
        endpoint: "local-process",
        ready: !!cfg("LIGHTWEAVER_ALIGNMENT_MODEL", "alignment_model"),
        remote: false,
        idempotency: true,
        cancellation: "process-tree",
        hint: "安装模型依赖，配置 LIGHTWEAVER_ALIGNMENT_MODEL 为语言匹配的 wav2vec2 模型路径或 ID",
      },
      {
        id: "transformers-embedding",
        name: "本地文本向量",
        capabilities: ["embedding"],
        model: cfg("LIGHTWEAVER_EMBEDDING_MODEL", "embedding_model"),
        version:
          cfg("LIGHTWEAVER_EMBEDDING_REVISION", "embedding_revision") ||
          "local",
        endpoint: "local-process",
        ready: !!cfg("LIGHTWEAVER_EMBEDDING_MODEL", "embedding_model"),
        remote: false,
        idempotency: true,
        cancellation: "process-tree",
        hint: "配置 LIGHTWEAVER_EMBEDDING_MODEL 及固定 LIGHTWEAVER_EMBEDDING_REVISION",
      },
    ]);
  }
  selectedVlm(value?: string) {
    return VlmProvider.parse(
      value ||
        cfg("LIGHTWEAVER_VLM_PROVIDER", "vlm_provider") ||
        "modelbest-vlm",
    );
  }
  binding(id: string): string {
    const p = this.descriptors().find((p) => p.id === id);
    if (!p)
      throw new WeaverError("CAPABILITY_UNAVAILABLE", "未注册 provider", {
        id,
      });
    return JSON.stringify({
      id: p.id,
      model: p.model,
      version: p.version,
      endpoint: p.endpoint,
    });
  }
  async freeze(ids: string[]): Promise<Record<string, string>> {
    const result: Record<string, string> = {};
    for (const id of [...new Set(ids)]) {
      const base = z
        .object({
          id: z.string(),
          model: z.string(),
          version: z.string(),
          endpoint: z.string(),
        })
        .parse(JSON.parse(this.binding(id)));
      const local =
        id === "qwen3-asr"
          ? [
              cfg("LIGHTWEAVER_ASR_MODEL", "asr_model"),
              cfg("TRANSCRIBE_LIBRARY", "asr_library"),
              cfg("LIGHTWEAVER_ASR_BINDINGS", "asr_bindings"),
              cfg("LIGHTWEAVER_VAD_LIBRARY", "vad_library"),
              path.join(scripts, "asr.py"),
            ]
          : [base.model];
      const files: string[] = [];
      for (const file of local)
        if (file && fs.existsSync(file))
          files.push(await localModelDigest(file));
      result[id] = JSON.stringify({ ...base, files });
    }
    return result;
  }
  require(id: string, binding?: string): void {
    const p = this.descriptors().find((p) => p.id === id);
    if (!p?.ready)
      throw new WeaverError(
        "CONFIG_MISSING",
        `${p?.name || id} 尚未配置`,
        { provider: id },
        [p?.hint || "检查 provider 配置"],
      );
    if (binding) {
      const old = z
        .object({
          id: z.string(),
          model: z.string(),
          version: z.string(),
          endpoint: z.string(),
        })
        .parse(JSON.parse(binding));
      if (JSON.stringify(old) !== this.binding(id))
        throw new WeaverError(
          "PROVIDER_CHANGED",
          "provider 绑定已改变，请重新构建",
          { id },
        );
    }
  }
  private async request(
    provider: "modelbest" | "deepseek",
    endpoint: string,
    payload: unknown,
    signal: AbortSignal,
  ): Promise<Response> {
    const { key, base } =
      provider === "deepseek"
        ? deepseekBackend(workspaceRoot)
        : modelbestBackend(workspaceRoot);
    let response: Response;
    try {
      response = await fetch(`${base}/${endpoint}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.any([signal, AbortSignal.timeout(180000)]),
      });
    } catch (error) {
      if (signal.aborted)
        throw new WeaverError("CANCELLED", "请求已取消，远端结果未知");
      throw new WeaverError(
        "NETWORK_ERROR",
        "模型请求失败，远端是否执行未知",
        { remoteOutcome: "unknown" },
        [],
        true,
      );
    }
    if (!response.ok) {
      const retryable =
          response.status === 429 || [502, 503, 504].includes(response.status),
        retryAfter = response.headers.get("retry-after");
      const parsedRetryAfter = retryAfter
        ? /^\d+$/.test(retryAfter)
          ? Number(retryAfter) * 1000
          : Math.max(0, Date.parse(retryAfter) - Date.now())
        : 1000;
      const retryAfterMs = Number.isFinite(parsedRetryAfter)
        ? Math.min(60000, Math.max(0, parsedRetryAfter))
        : 1000;
      // 不把响应正文（可能回显请求或凭据）写日志。
      throw new WeaverError(
        response.status === 401 || response.status === 403
          ? "PROVIDER_AUTH"
          : response.status === 429
            ? "RATE_LIMITED"
            : "PROVIDER_ERROR",
        `模型服务返回 HTTP ${response.status}`,
        { status: response.status, retryAfterMs, remoteOutcome: "rejected" },
        [],
        retryable,
      );
    }
    return response;
  }
  async tts(input: {
    text: string;
    reference?: string;
    referenceText?: string;
    style?: string;
    binding?: string;
    dest: string;
    workDir: string;
    signal: AbortSignal;
  }): Promise<void> {
    this.require("modelbest-voxcpm2", input.binding);
    let ref: string | undefined;
    if (input.reference) {
      ref = path.join(input.workDir, "voice-reference.wav");
      await processRun(
        "ffmpeg",
        [
          "-v",
          "error",
          "-y",
          "-i",
          this.store.blobPath(input.reference),
          "-ac",
          "1",
          "-ar",
          "24000",
          ref,
        ],
        { signal: input.signal },
      );
      if (fs.statSync(ref).size > 5 * 1024 * 1024)
        throw new WeaverError("INVALID_INPUT", "克隆源超过 5 MiB");
      if (!input.referenceText?.trim())
        throw new WeaverError("INVALID_INPUT", "克隆音色需要参考文本");
    }
    const response = await this.request(
      "modelbest",
      "audio/speech",
      {
        model: this.descriptors().find((p) => p.id === "modelbest-voxcpm2")
          ?.model,
        input: input.style ? `(${input.style})${input.text}` : input.text,
        voice: "default",
        response_format: "wav",
        do_normalize: true,
        ...(ref
          ? {
              ref_audio: `data:audio/wav;base64,${fs.readFileSync(ref).toString("base64")}`,
              ref_text: input.referenceText,
              denoise: true,
            }
          : {}),
      },
      input.signal,
    );
    fs.writeFileSync(input.dest, await readSpeechWav(response));
  }
  async asr(input: {
    audio: string;
    locale: string;
    binding?: string;
    workDir: string;
    signal: AbortSignal;
  }): Promise<z.infer<typeof AsrResult>> {
    this.require("qwen3-asr", input.binding);
    if (
      input.binding &&
      (await this.freeze(["qwen3-asr"]))["qwen3-asr"] !== input.binding
    )
      throw new WeaverError(
        "PROVIDER_CHANGED",
        "本地 ASR 模型或绑定字节已改变",
      );
    const jobFile = path.join(input.workDir, "asr-job.json");
    fs.writeFileSync(
      jobFile,
      JSON.stringify({
        kind: "transcribe",
        audio: input.audio,
        language: input.locale,
        model: cfg("LIGHTWEAVER_ASR_MODEL", "asr_model"),
        library: cfg("TRANSCRIBE_LIBRARY", "asr_library"),
        bindings: cfg("LIGHTWEAVER_ASR_BINDINGS", "asr_bindings"),
        backend: "auto",
        vadLibrary: cfg("LIGHTWEAVER_VAD_LIBRARY", "vad_library"),
      }),
    );
    const out = await processRun(
      "python3",
      [path.join(scripts, "asr.py"), "--job", jobFile],
      { signal: input.signal },
    );
    if (/OutputTruncated/.test(out.stderr))
      throw new WeaverError("ASR_TRUNCATED", "ASR 输出截断，需要缩小窗口");
    return AsrResult.parse(parseLastJson(out.stdout));
  }
  async describe(input: {
    frames: string[];
    prompt: string;
    provider: z.infer<typeof VlmProvider>;
    binding?: string;
    signal: AbortSignal;
  }): Promise<{ observation: string }> {
    this.require(input.provider, input.binding);
    const model = this.descriptors().find(
      (p) => p.id === input.provider,
    )?.model;
    const response = await this.request(
      input.provider === "deepseek-vlm" ? "deepseek" : "modelbest",
      "chat/completions",
      {
        model,
        ...(input.provider === "deepseek-vlm"
          ? { thinking: { type: "disabled" } }
          : { chat_template_kwargs: { enable_thinking: false } }),
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: input.prompt },
              ...input.frames.map((file) => ({
                type: "image_url",
                image_url: {
                  url: `data:image/jpeg;base64,${fs.readFileSync(file).toString("base64")}`,
                },
              })),
            ],
          },
        ],
        temperature: 0.2,
        max_tokens: 1024,
      },
      input.signal,
    );
    const out = z
      .object({
        choices: z
          .array(
            z.object({ message: z.object({ content: z.string().min(1) }) }),
          )
          .min(1),
      })
      .parse(await response.json());
    return { observation: out.choices[0].message.content };
  }
  async align(input: {
    audio: string;
    text: string;
    locale: string;
    duration: number;
    binding?: string;
    workDir: string;
    signal: AbortSignal;
  }): Promise<z.infer<typeof AlignmentResult>> {
    this.require("whisperx", input.binding);
    if (
      input.binding &&
      (await this.freeze(["whisperx"])).whisperx !== input.binding
    )
      throw new WeaverError("PROVIDER_CHANGED", "对齐模型字节已改变");
    return AlignmentResult.parse(
      await this.python(
        "align",
        {
          audio: input.audio,
          text: input.text,
          locale: input.locale.split("-")[0],
          duration: input.duration,
          model: cfg("LIGHTWEAVER_ALIGNMENT_MODEL", "alignment_model"),
        },
        input.workDir,
        input.signal,
      ),
    );
  }
  async embed(
    texts: string[],
    workDir: string,
    signal: AbortSignal,
    binding?: string,
  ): Promise<z.infer<typeof EmbeddingResult>> {
    this.require("transformers-embedding", binding);
    if (
      binding &&
      (await this.freeze(["transformers-embedding"]))[
        "transformers-embedding"
      ] !== binding
    )
      throw new WeaverError("PROVIDER_CHANGED", "向量模型字节已改变");
    const result = EmbeddingResult.parse(
      await this.python(
        "embed",
        {
          texts,
          model: cfg("LIGHTWEAVER_EMBEDDING_MODEL", "embedding_model"),
          revision:
            cfg("LIGHTWEAVER_EMBEDDING_REVISION", "embedding_revision") || null,
        },
        workDir,
        signal,
      ),
    );
    if (
      result.vectors.length !== texts.length ||
      result.vectors.some((v) => v.length !== result.vectors[0]?.length)
    )
      throw new WeaverError("PROVIDER_FORMAT", "embedding 维度或数量错误");
    return result;
  }
  private async python(
    kind: string,
    job: unknown,
    workDir: string,
    signal: AbortSignal,
  ): Promise<unknown> {
    const file = path.join(workDir, `${kind}-job.json`);
    fs.writeFileSync(file, JSON.stringify(job));
    return parseLastJson(
      (
        await processRun(
          "python3",
          [path.join(scripts, "models.py"), kind, file],
          { signal },
        )
      ).stdout,
    );
  }
  async doctor() {
    const checks = await Promise.all(
      ["ffmpeg", "ffprobe", "python3"].map(async (tool) => {
        try {
          const r = await processRun(
            tool,
            [tool === "python3" ? "--version" : "-version"],
            { timeoutMs: 5000 },
          );
          return { tool, ok: true, version: r.stdout.split("\n")[0] };
        } catch {
          return { tool, ok: false, version: "" };
        }
      }),
    );
    let modules: Record<string, boolean> = {};
    try {
      modules = z
        .record(z.string(), z.boolean())
        .parse(
          JSON.parse(
            (
              await processRun(
                "python3",
                [
                  "-c",
                  "import importlib.util,json;print(json.dumps({x:bool(importlib.util.find_spec(x)) for x in ['whisperx','torch','transformers','opentimelineio']}))",
                ],
                { timeoutMs: 5000 },
              )
            ).stdout,
          ),
        );
    } catch {
      /* python 诊断已报告 */
    }
    let jianying: unknown = { installed: false };
    try {
      jianying = parseLastJson(
        (
          await processRun(
            "python3",
            [
              "-c",
              "import plistlib,json;d=plistlib.load(open('/Applications/VideoFusion-macOS.app/Contents/Info.plist','rb'));print(json.dumps({'bundleId':d['CFBundleIdentifier'],'version':d['CFBundleShortVersionString'],'installed':d['CFBundleIdentifier']=='com.lemon.lvpro'}))",
            ],
            { timeoutMs: 5000 },
          )
        ).stdout,
      );
    } catch {
      /* 目标应用缺失 */
    }
    return {
      node: process.version,
      sqlite: z
        .object({ version: z.string() })
        .parse(
          this.store.db.prepare("SELECT sqlite_version() AS version").get(),
        ).version,
      checks,
      providers: this.descriptors().map((p) => ({
        ...p,
        ready:
          p.ready &&
          (p.id === "whisperx"
            ? !!modules.whisperx
            : p.id === "transformers-embedding"
              ? !!modules.torch && !!modules.transformers
              : true),
      })),
      modules,
      jianying,
    };
  }
}
export function parseLastJson(stdout: string): unknown {
  const line = stdout
    .trim()
    .split("\n")
    .reverse()
    .find((line) => line.startsWith("{") || line.startsWith("["));
  if (!line) throw new WeaverError("PROVIDER_FORMAT", "适配器没有输出 JSON");
  try {
    return JSON.parse(line);
  } catch {
    throw new WeaverError("PROVIDER_FORMAT", "适配器输出 JSON 无效");
  }
}

export type AsrResult = z.infer<typeof AsrResult>;
export type AsrSentence = NonNullable<AsrResult["sentences"]>[number];
export type AsrWord = NonNullable<AsrSentence["words"]>[number];
