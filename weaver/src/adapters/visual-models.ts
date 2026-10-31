import fs from "node:fs";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { z, Digest, ProviderDescriptor } from "../contracts/index.ts";
import { WeaverError } from "../contracts/errors.ts";
import { localConfigValue } from "../config.ts";
import { processRun } from "../media/process.ts";
import { fileDigest } from "./toolchain.ts";

export const VISUAL_PROVIDER = "embeddinggemma-visual";
const VISUAL_ADAPTER = "embeddinggemma-visual-v1";

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

const VisualBinding = z.strictObject({
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
});

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
    return value ? path.resolve(this.root, value) : "";
  }

  private executable(value: string): string {
    const candidates = value.includes(path.sep)
      ? [this.localPath(value)]
      : (process.env.PATH || "")
          .split(path.delimiter)
          .map((directory) => path.join(directory, value));
    return (
      candidates.find((candidate) => {
        try {
          fs.accessSync(candidate, fs.constants.X_OK);
          return fs.statSync(candidate).isFile();
        } catch {
          return false;
        }
      }) || ""
    );
  }

  settings() {
    return {
      model: this.localPath(
        this.value("LIGHTWEAVER_VISUAL_MODEL", "visual_model"),
      ),
      mmproj: this.localPath(
        this.value("LIGHTWEAVER_VISUAL_MMPROJ", "visual_mmproj"),
      ),
      server: this.executable(
        this.value("LIGHTWEAVER_VISUAL_SERVER", "visual_server"),
      ),
      python: this.executable(
        this.value(
          "LIGHTWEAVER_MODEL_PYTHON",
          "model_python",
          "weaver/.venv/bin/python",
        ),
      ),
      script: path.join(this.root, "weaver/scripts/visual_models.py"),
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
    return z.array(ProviderDescriptor).parse([
      {
        id: VISUAL_PROVIDER,
        name: "EmbeddingGemma 2 视觉检索",
        capabilities: ["embedding"],
        model: [settings.model, settings.mmproj].filter(Boolean).join(" + "),
        version: JSON.stringify({
          adapter: VISUAL_ADAPTER,
          pooling: "mean",
          protocol: "openai-embeddings-v1",
          script: settings.script,
          python: settings.python,
          server: settings.server,
        }),
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
      },
    ]);
  }

  private checkReady(): void {
    const descriptor = this.descriptors().find(
      (provider) => provider.id === VISUAL_PROVIDER,
    );
    if (!descriptor?.ready)
      throw new WeaverError(
        "CONFIG_MISSING",
        "EmbeddingGemma 视觉检索尚未配置",
        { provider: VISUAL_PROVIDER },
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

  private async currentBinding(): Promise<Binding> {
    this.checkReady();
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
    return VisualBinding.parse({
      id: VISUAL_PROVIDER,
      model: settings.model,
      mmproj: settings.mmproj,
      version: VISUAL_ADAPTER,
      endpoint: "local-process",
      files: { model, mmproj, script, server, python },
      runtime,
    });
  }

  async freeze(): Promise<string> {
    return JSON.stringify(await this.currentBinding());
  }

  async require(binding?: string): Promise<void> {
    const current = await this.currentBinding();
    if (!binding) return;
    let frozen: Binding;
    try {
      frozen = VisualBinding.parse(JSON.parse(binding));
    } catch {
      throw new WeaverError(
        "PROVIDER_CHANGED",
        "视觉模型绑定无效或版本不兼容，请重新提交作业",
        { provider: VISUAL_PROVIDER },
      );
    }
    if (!isDeepStrictEqual(frozen, current))
      throw new WeaverError(
        "PROVIDER_CHANGED",
        "视觉模型、运行时或服务二进制已改变，请重新提交作业",
        { provider: VISUAL_PROVIDER },
      );
  }

  async embed(input: {
    inputs: VisualInputValue[];
    workDir: string;
    signal: AbortSignal;
    binding: string;
  }): Promise<Result> {
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
    await this.require(input.binding);
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
    await this.require(input.binding);
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
}
