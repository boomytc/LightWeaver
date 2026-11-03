import fs from "node:fs";
import path from "node:path";
import { z, ProviderDescriptor } from "../contracts/index.ts";
import { WeaverError } from "../contracts/errors.ts";
import { readConfig } from "../config.ts";
import { resourcePath, resolveConfiguredPath } from "../runtime.ts";
import { processRun } from "../media/process.ts";
import { resolveExecutable } from "./executable.ts";
import { runtimeBinding } from "../engines/runtime.ts";

export const ALIGNMENT_PROVIDER = "qwen3-forced-aligner";
export const RERANK_PROVIDER = "qwen3-reranker";
const alignmentLanguages: Record<string, string> = {
  zh: "Chinese",
  yue: "Cantonese",
  en: "English",
  de: "German",
  es: "Spanish",
  fr: "French",
  it: "Italian",
  pt: "Portuguese",
  ru: "Russian",
  ko: "Korean",
  ja: "Japanese",
};
export function alignmentLanguage(locale: string) {
  const language = alignmentLanguages[locale.toLowerCase().split("-")[0]];
  if (!language)
    throw new WeaverError(
      "ALIGNMENT_LANGUAGE_UNSUPPORTED",
      `Qwen3 强制对齐不支持语种 ${locale}`,
    );
  return language;
}
export const EmbeddingInput = z.object({
  role: z.enum(["query", "document"]),
  text: z.string().trim().min(1),
});
const TimedText = z
  .object({
    text: z.string().min(1),
    start: z.number().finite().nonnegative(),
    end: z.number().finite().positive(),
  })
  .refine((s) => s.end > s.start, "对齐区间必须为正");
const TimedWord = z
  .object({
    text: z.string().min(1),
    start: z.number().finite().nonnegative(),
    end: z.number().finite().nonnegative(),
  })
  .refine((s) => s.end >= s.start, "词时间顺序无效");
export const AlignmentResult = z.object({
  backend: z.literal("qwen3-torch"),
  version: z.string(),
  model: z.string(),
  words: z.array(TimedWord).min(1),
  segments: z.array(TimedText).min(1),
});
export const EmbeddingResult = z.object({
  model: z.string(),
  vectors: z.array(z.array(z.number().finite()).min(1)),
});
export const RerankResult = z.object({
  model: z.string(),
  scores: z.array(z.number().finite()),
});
type ModelInvocation =
  | { kind: "inspect"; backend: "torch" | "gguf" }
  | {
      kind: "align" | "rerank";
      job: unknown;
      workDir: string;
      signal: AbortSignal;
    };

export class LocalModels {
  constructor(private readonly root: string) {}
  private value(env: string, key: string) {
    return readConfig({ root: this.root }).field({ key, environment: env }).value;
  }
  private localPath(value: string) {
    return value ? resolveConfiguredPath(value) : "";
  }
  settings() {
    return {
      python: runtimeBinding("python").value,
      server: runtimeBinding("llama_server").value,
      ffmpeg: resolveExecutable("ffmpeg", this.root),
      alignmentDevice: z
        .string()
        .regex(/^(cpu|cuda(?::\d+)?)$/)
        .parse(
          process.env.LIGHTWEAVER_ALIGNMENT_DEVICE?.trim() || "cpu",
        ),
      alignmentModel: this.localPath(
        this.value("LIGHTWEAVER_ALIGNMENT_MODEL", "alignment_model"),
      ),
      rerankerModel: this.localPath(
        this.value("LIGHTWEAVER_RERANKER_MODEL", "reranker_model"),
      ),
    };
  }
  descriptors() {
    const s = this.settings();
    const exists = (p: string, directory: boolean) => {
      try {
        return directory
          ? fs.statSync(p).isDirectory()
          : fs.statSync(p).isFile();
      } catch {
        return false;
      }
    };
    return z.array(ProviderDescriptor).parse(
      [
        {
          id: ALIGNMENT_PROVIDER,
          name: "Qwen3 强制对齐",
          capabilities: ["alignment"],
          model: s.alignmentModel,
          version: JSON.stringify({
            adapter: "qwen3-align-torch-v2",
            backend: "torch",
            device: s.alignmentDevice,
            python: s.python,
            ffmpeg: s.ffmpeg,
          }),
          ready: !!s.python && !!s.ffmpeg && exists(s.alignmentModel, true),
          hint: "在模型页下载并启用 Qwen3 ForcedAligner，自动准备 Torch 环境",
        },
        {
          id: RERANK_PROVIDER,
          name: "Qwen3 候选重排",
          capabilities: ["rerank"],
          model: s.rerankerModel,
          version: JSON.stringify({
            adapter: "qwen3-rerank-v1",
            pooling: "rank",
            server: s.server,
            python: s.python,
          }),
          ready: !!s.python && !!s.server && exists(s.rerankerModel, false),
          hint: "配置 reranker_model（Qwen3 Reranker GGUF），安装运行组件后可启用重排",
        },
      ].map((p) => ({
        ...p,
        endpoint: "local-process",
        remote: false,
        idempotency: true,
        cancellation: "process-tree",
      })),
    );
  }
  files(id: string) {
    const s = this.settings();
    if (![ALIGNMENT_PROVIDER, RERANK_PROVIDER].includes(id))
      return [];
    return [
      resourcePath("weaver", "scripts", "models.py"),
      resourcePath("weaver", "src", "adapters", "local-models.ts"),
      s.python,
      ...(id === ALIGNMENT_PROVIDER ? [s.ffmpeg] : [s.server]),
    ];
  }
  async versions(id: string) {
    if (!this.files(id).length || !this.settings().python) return {};
    return this.run({
      kind: "inspect",
      backend: id === ALIGNMENT_PROVIDER ? "torch" : "gguf",
    });
  }
  async run(invocation: ModelInvocation): Promise<unknown> {
    const { kind } = invocation;
    const python = this.settings().python;
    if (!python)
      throw new WeaverError(
        "CONFIG_MISSING",
        "模型运行组件尚未安装",
        null,
        [
          "在设置的诊断与修复中准备模型运行组件",
        ],
      );
    const input =
      invocation.kind === "inspect"
        ? invocation.backend
        : path.join(invocation.workDir, `${kind}-job.json`);
    if (invocation.kind !== "inspect")
      fs.writeFileSync(input, JSON.stringify(invocation.job));
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      PYTHONPATH: "",
      PYTHONNOUSERSITE: "1",
      HF_HUB_OFFLINE: "1",
      TRANSFORMERS_OFFLINE: "1",
      PYTHONDONTWRITEBYTECODE: "1",
    };
    delete env.PYTHONHOME;
    const result = await processRun(
      python,
      [resourcePath("weaver", "scripts", "models.py"), kind, input],
      {
        cwd: invocation.kind === "inspect" ? this.root : invocation.workDir,
        signal: invocation.kind === "inspect" ? undefined : invocation.signal,
        env,
        timeoutMs: kind === "inspect" ? 10000 : 900000,
      },
    );
    let value: unknown;
    try {
      value = JSON.parse(result.stdout.trim().split("\n").at(-1) || "");
    } catch {
      throw new WeaverError("PROVIDER_FORMAT", "本地模型没有返回有效 JSON");
    }
    const error = z
      .object({ error: z.object({ code: z.string(), message: z.string() }) })
      .safeParse(value);
    if (error.success)
      throw new WeaverError(error.data.error.code, error.data.error.message);
    return value;
  }
}
