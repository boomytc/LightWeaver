import fs from "node:fs";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { z, Digest, ProviderDescriptor } from "../contracts/index.ts";
import { WeaverError } from "../contracts/errors.ts";
import { localConfigValue } from "../config.ts";
import { resourcePath, resolveConfiguredPath } from "../runtime.ts";
import { processRun } from "../media/process.ts";
import { defaultModelPython, resolveExecutable } from "./executable.ts";
import { fileDigest } from "./toolchain.ts";

export const VISUAL_PROVIDER = "embeddinggemma-visual";
export const TEXT_EMBEDDING_PROVIDER = "embeddinggemma-text";
const VISUAL_ADAPTER = "embeddinggemma-visual-v1";
const TEXT_ADAPTER = "embeddinggemma-text-v1";
export const TEXT_QUERY_PREFIX = "task: search result | query: ";
export const TEXT_DOCUMENT_PREFIX = "title: none | text: ";

export const VisualInput = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("text"),
    text: z.string().trim().min(1),
  }),
  z.strictObject({
    kind: z.literal("image"),
    file: z.string().min(1),
  }),
]);

export const VisualResult = z.strictObject({
  model: z.string().min(1),
  vectors: z.array(z.array(z.number().finite()).min(1)).min(1),
});
export type VisualInputValue = z.infer<typeof VisualInput>;

const VisualRuntime = z.strictObject({
  python: z.string().min(1),
  serverProtocol: z.literal("openai-embeddings-v1"),
  pooling: z.literal("mean"),
  context: z.literal(8192),
  batch: z.literal(8192),
  ubatch: z.literal(8192),
  parallel: z.literal(1),
  gpuLayers: z.literal(99),
  warmup: z.literal(false),
});

const VisualBinding = z.discriminatedUnion("id", [
  z.strictObject({
  id: z.literal(VISUAL_PROVIDER),
  model: z.string().min(1),
  mmproj: z.string().min(1),
  version: z.literal(VISUAL_ADAPTER),
  endpoint: z.literal("local-process"),
  files: z.strictObject({
    model: Digest,
    mmproj: Digest,
    script: Digest,
    server: Digest,
    python: Digest,
  }),
  runtime: VisualRuntime,
  }),
  z.strictObject({
    id: z.literal(TEXT_EMBEDDING_PROVIDER),
    model: z.string().min(1),
    mmproj: z.string().min(1),
    version: z.literal(TEXT_ADAPTER),
    endpoint: z.literal("local-process"),
    files: z.strictObject({
      model: Digest,
      mmproj: Digest,
      script: Digest,
      server: Digest,
      python: Digest,
    }),
    runtime: VisualRuntime,
    prefixes: z.strictObject({
      query: z.literal(TEXT_QUERY_PREFIX),
      document: z.literal(TEXT_DOCUMENT_PREFIX),
    }),
  }),
]);

type Result = z.infer<typeof VisualResult>;
type Binding = z.infer<typeof VisualBinding>;

export class VisualModels {
  constructor(private readonly root: string) {}

  private value(environment: string, key: string, fallback = ""): string {
    return (
      process.env[environment]?.trim() ||
      localConfigValue(key, this.root) ||
      fallback
    );
  }

  private localPath(value: string): string {
    return value ? resolveConfiguredPath(value) : "";
  }

  settings() {
    return {
      model: this.localPath(
        this.value("LIGHTWEAVER_VISUAL_MODEL", "visual_model"),
      ),
      mmproj: this.localPath(
        this.value("LIGHTWEAVER_VISUAL_MMPROJ", "visual_mmproj"),
      ),
      server: resolveExecutable(
        this.value("LIGHTWEAVER_VISUAL_SERVER", "visual_server"),
        this.root,
      ),
      python: resolveExecutable(
        this.value(
          "LIGHTWEAVER_MODEL_PYTHON",
          "model_python",
          defaultModelPython(),
        ),
        this.root,
      ),
      script: resourcePath("weaver", "scripts", "visual_models.py"),
    };
  }

  descriptors() {
    const settings = this.settings();
    const exists = (file: string) => {
      try {
        return fs.statSync(file).isFile();
      } catch {
        return false;
      }
    };
    const common = {
      capabilities: ["embedding"],
      model: [settings.model, settings.mmproj].filter(Boolean).join(" + "),
      endpoint: "local-process",
      ready: [
        settings.python,
        settings.server,
        settings.script,
        settings.model,
        settings.mmproj,
      ].every(exists),
      remote: false,
      idempotency: true,
      cancellation: "process-tree",
      hint:
        "配置 visual_model、visual_mmproj、visual_server；模型 Python 使用 model_python",
    };
    return z.array(ProviderDescriptor).parse([
      {
        id: VISUAL_PROVIDER,
        name: "EmbeddingGemma 2 视觉检索",
        ...common,
        version: JSON.stringify({
          adapter: VISUAL_ADAPTER,
          pooling: "mean",
          protocol: "openai-embeddings-v1",
          script: settings.script,
          python: settings.python,
          server: settings.server,
        }),
      },
      {
        id: TEXT_EMBEDDING_PROVIDER,
        name: "EmbeddingGemma 2 文本语义检索",
        ...common,
        version: JSON.stringify({
          adapter: TEXT_ADAPTER,
          pooling: "mean",
          queryPrefix: TEXT_QUERY_PREFIX,
          documentPrefix: TEXT_DOCUMENT_PREFIX,
          protocol: "openai-embeddings-v1",
          script: settings.script,
          python: settings.python,
          server: settings.server,
        }),
      },
    ]);
  }

  private checkReady(provider: typeof VISUAL_PROVIDER | typeof TEXT_EMBEDDING_PROVIDER): void {
    const descriptor = this.descriptors().find(
      (candidate) => candidate.id === provider,
    );
    if (!descriptor?.ready)
      throw new WeaverError(
        "CONFIG_MISSING",
        "EmbeddingGemma 视觉检索尚未配置",
        { provider },
        [
          descriptor?.hint ||
            "配置 visual_model、visual_mmproj、visual_server 和 model_python",
        ],
      );
  }

  private environment(): NodeJS.ProcessEnv {
    const environment: NodeJS.ProcessEnv = {
      ...process.env,
      PYTHONPATH: "",
      PYTHONNOUSERSITE: "1",
      PYTHONDONTWRITEBYTECODE: "1",
      HF_HUB_OFFLINE: "1",
      TRANSFORMERS_OFFLINE: "1",
      NO_PROXY: "127.0.0.1,localhost",
    };
    for (const key of Object.keys(environment)) {
      const upper = key.toUpperCase();
      if (
        upper.startsWith("LLAMA_") ||
        (upper.endsWith("_PROXY") && key !== "NO_PROXY")
      )
        delete environment[key];
    }
    delete environment.PYTHONHOME;
    return environment;
  }

  private async invoke(
    kind: "inspect" | "embed",
    input?: unknown,
    options: { workDir?: string; signal?: AbortSignal } = {},
  ): Promise<unknown> {
    const settings = this.settings();
    if (!settings.python)
      throw new WeaverError(
        "CONFIG_MISSING",
        "未配置 LightWeaver 模型 Python 环境",
        null,
        [
          "uv venv --python 3.12 weaver/.venv，然后安装 weaver/requirements.models.txt",
        ],
      );
    const args = [settings.script, kind];
    if (kind === "embed") {
      if (!options.workDir)
        throw new WeaverError("INVALID_INPUT", "视觉嵌入缺少作业目录");
      fs.mkdirSync(options.workDir, { recursive: true });
      const file = path.join(options.workDir, "visual-embed-job.json");
      fs.writeFileSync(file, JSON.stringify(input));
      args.push(file);
    }
    const process = await processRun(settings.python, args, {
      cwd: kind === "inspect" ? this.root : options.workDir,
      signal: options.signal,
      env: this.environment(),
      timeoutMs: kind === "inspect" ? 10000 : 900000,
    });
    let value: unknown;
    try {
      value = JSON.parse(process.stdout.trim().split("\n").at(-1) || "");
    } catch {
      throw new WeaverError("PROVIDER_FORMAT", "视觉模型没有返回有效 JSON", {
        diagnostic: process.stderr.slice(-4000),
      });
    }
    const failure = z
      .object({
        error: z.object({
          code: z.string().min(1),
          message: z.string().min(1),
        }),
      })
      .safeParse(value);
    if (failure.success)
      throw new WeaverError(
        failure.data.error.code,
        failure.data.error.message,
      );
    return value;
  }

  private async currentBinding(
    provider: typeof VISUAL_PROVIDER | typeof TEXT_EMBEDDING_PROVIDER,
  ): Promise<Binding> {
    this.checkReady(provider);
    const settings = this.settings();
    const [model, mmproj, script, server, python, runtime] =
      await Promise.all([
        fileDigest(settings.model),
        fileDigest(settings.mmproj),
        fileDigest(settings.script),
        fileDigest(settings.server),
        fileDigest(settings.python),
        this.invoke("inspect"),
      ]);
    const common = {
      model: settings.model,
      mmproj: settings.mmproj,
      endpoint: "local-process",
      files: { model, mmproj, script, server, python },
      runtime,
    };
    return VisualBinding.parse(
      provider === VISUAL_PROVIDER
        ? { ...common, id: VISUAL_PROVIDER, version: VISUAL_ADAPTER }
        : {
            ...common,
            id: TEXT_EMBEDDING_PROVIDER,
            version: TEXT_ADAPTER,
            prefixes: {
              query: TEXT_QUERY_PREFIX,
              document: TEXT_DOCUMENT_PREFIX,
            },
          },
    );
  }

  async freeze(
    provider: typeof VISUAL_PROVIDER | typeof TEXT_EMBEDDING_PROVIDER =
      VISUAL_PROVIDER,
  ): Promise<string> {
    return JSON.stringify(await this.currentBinding(provider));
  }

  async require(
    binding?: string,
    provider: typeof VISUAL_PROVIDER | typeof TEXT_EMBEDDING_PROVIDER =
      VISUAL_PROVIDER,
  ): Promise<void> {
    const current = await this.currentBinding(provider);
    if (!binding) return;
    let frozen: Binding;
    try {
      frozen = VisualBinding.parse(JSON.parse(binding));
    } catch {
      throw new WeaverError(
        "PROVIDER_CHANGED",
        "视觉模型绑定无效或版本不兼容，请重新提交作业",
        { provider },
      );
    }
    if (!isDeepStrictEqual(frozen, current))
      throw new WeaverError(
        "PROVIDER_CHANGED",
        "视觉模型、运行时或服务二进制已改变，请重新提交作业",
        { provider },
      );
  }

  async embed(input: {
    inputs: VisualInputValue[];
    workDir: string;
    signal: AbortSignal;
    binding: string;
    provider?: typeof VISUAL_PROVIDER | typeof TEXT_EMBEDDING_PROVIDER;
  }): Promise<Result> {
    const provider = input.provider || VISUAL_PROVIDER;
    const inputs = z.array(VisualInput).min(1).parse(input.inputs).map(
      (item): VisualInputValue => {
        if (item.kind === "text") return item;
        const file = path.resolve(input.workDir, item.file);
        let stat: fs.Stats;
        try {
          stat = fs.statSync(file);
        } catch {
          throw new WeaverError("INVALID_INPUT", "视觉图像不存在", { file });
        }
        if (!stat.isFile())
          throw new WeaverError("INVALID_INPUT", "视觉图像必须是普通文件", {
            file,
          });
        return { kind: "image", file };
      },
    );
    await this.require(input.binding, provider);
    const settings = this.settings();
    const result = VisualResult.parse(
      await this.invoke(
        "embed",
        {
          inputs,
          model: settings.model,
          mmproj: settings.mmproj,
          server: settings.server,
        },
        { workDir: input.workDir, signal: input.signal },
      ),
    );
    await this.require(input.binding, provider);
    if (result.model !== settings.model)
      throw new WeaverError(
        "PROVIDER_FORMAT",
        "视觉模型返回值与冻结配置不一致",
        { expected: settings.model, actual: result.model },
      );
    const dimension = result.vectors[0]?.length;
    if (
      result.vectors.length !== inputs.length ||
      !dimension ||
      result.vectors.some(
        (vector) =>
          vector.length !== dimension ||
          Math.abs(
            vector.reduce((sum, value) => sum + value * value, 0) - 1,
          ) > 0.001,
      )
    )
      throw new WeaverError(
        "PROVIDER_FORMAT",
        "视觉 embedding 数量、维度或归一化错误",
      );
    return result;
  }

  async embedText(input: {
    inputs: { role: "query" | "document"; text: string }[];
    workDir: string;
    signal: AbortSignal;
    binding: string;
  }): Promise<Result> {
    const inputs = input.inputs.map<VisualInputValue>((item) => ({
      kind: "text",
      text:
        item.role === "query"
          ? `${TEXT_QUERY_PREFIX}${item.text}`
          : `${TEXT_DOCUMENT_PREFIX}${item.text}`,
    }));
    return this.embed({
      inputs,
      workDir: input.workDir,
      signal: input.signal,
      binding: input.binding,
      provider: TEXT_EMBEDDING_PROVIDER,
    });
  }
}
