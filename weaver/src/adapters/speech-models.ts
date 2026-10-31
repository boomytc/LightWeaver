import fs from "node:fs";
import path from "node:path";
import { z, ProviderDescriptor } from "../contracts/index.ts";
import { WeaverError } from "../contracts/errors.ts";
import { localConfigValue } from "../config.ts";
import { resourcePath, resolveConfiguredPath } from "../runtime.ts";
import { processRun } from "../media/process.ts";
import { defaultSpeechPython, resolveExecutable } from "./executable.ts";
import { localModelDigest } from "./toolchain.ts";

export const LOCAL_TTS_PROVIDER = "local-voxcpm2";
export const TRANSLATION_PROVIDER = "hy-mt2";

const SpeechProvider = z.enum([LOCAL_TTS_PROVIDER, TRANSLATION_PROVIDER]);
type SpeechProvider = z.infer<typeof SpeechProvider>;
export type SpeechDescriptor = z.infer<typeof ProviderDescriptor>;

const SynthesizeInput = z
  .strictObject({
    text: z.string().trim().min(1),
    reference: z.string().min(1).optional(),
    referenceText: z.string().optional(),
    style: z.string().optional(),
    dest: z.string().min(1),
    workDir: z.string().min(1),
    signal: z.instanceof(AbortSignal),
    binding: z.string().min(1).optional(),
  })
  .refine(
    (value) => !!value.reference || !value.referenceText?.trim(),
    "referenceText 必须与 reference 一起使用",
  );

const TranslationItem = z.strictObject({
  id: z.string().min(1),
  text: z.string().trim().min(1),
});

const TranslateInput = z
  .strictObject({
    texts: z.array(TranslationItem).min(1),
    targetLocale: z.string().regex(/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/),
    workDir: z.string().min(1),
    signal: z.instanceof(AbortSignal),
    binding: z.string().min(1).optional(),
  })
  .refine(
    (value) => new Set(value.texts.map((item) => item.id)).size === value.texts.length,
    "字幕标识必须唯一",
  );

const SynthesizeResult = z.strictObject({
  provider: z.literal(LOCAL_TTS_PROVIDER),
  model: z.string().min(1),
  dest: z.string().min(1),
  bytes: z.number().int().positive(),
  sampleRate: z.number().int().positive(),
});
const Conditioning = z.discriminatedUnion("mode", [
  z.strictObject({mode: z.literal("design")}),
  z.strictObject({mode: z.literal("controlled-clone"), reference: z.string().min(1)}),
  z.strictObject({mode: z.literal("continuation-clone"), reference: z.string().min(1), referenceText: z.string().min(1)}),
]);

const TranslateResult = z.strictObject({
  items: z.array(TranslationItem),
});

const OwnBinding = z.strictObject({
  format: z.literal("lightweaver-speech-model-v1"),
  id: SpeechProvider,
  model: z.string(),
  version: z.string(),
  endpoint: z.string(),
  files: z.array(
    z.strictObject({
      path: z.string(),
      digest: z.string(),
    }),
  ),
  runtime: z.unknown(),
});

const ProcessError = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});

export class SpeechModels {
  constructor(private readonly root: string) {}

  private value(env: string, key: string, fallback = "") {
    return (
      process.env[env]?.trim() || localConfigValue(key, this.root) || fallback
    );
  }

  private localPath(value: string) {
    return value ? resolveConfiguredPath(value) : "";
  }

  private script(name: "speech_models.py" | "subtitle_models.py") {
    return resourcePath("weaver", "scripts", name);
  }

  private isLocalVoxcpmModel(model: string) {
    try {
      const config: unknown = JSON.parse(
        fs.readFileSync(path.join(model, "config.json"), "utf8"),
      );
      return (
        typeof config === "object" &&
        config !== null &&
        "architecture" in config &&
        config.architecture === "voxcpm2" &&
        ["model.safetensors", "audiovae.pth", "tokenizer.json"].every((name) =>
          fs.statSync(path.join(model, name)).isFile(),
        )
      );
    } catch {
      return false;
    }
  }

  private isGguf(model: string) {
    try {
      const header = Buffer.alloc(4);
      const fd = fs.openSync(model, "r");
      try {
        fs.readSync(fd, header, 0, header.length, 0);
      } finally {
        fs.closeSync(fd);
      }
      return header.toString("ascii") === "GGUF";
    } catch {
      return false;
    }
  }

  private provider(id: string): SpeechProvider {
    const parsed = SpeechProvider.safeParse(id);
    if (parsed.success) return parsed.data;
    throw new WeaverError("CAPABILITY_UNAVAILABLE", "未注册本地语音模型", {
      id,
    });
  }

  private environment(): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      PYTHONPATH: "",
      PYTHONNOUSERSITE: "1",
      PYTHONDONTWRITEBYTECODE: "1",
      HF_HUB_OFFLINE: "1",
      TRANSFORMERS_OFFLINE: "1",
      HF_HUB_DISABLE_TELEMETRY: "1",
    };
    delete env.PYTHONHOME;
    for (const key of Object.keys(env))
      if (/^(?:ALL|HTTP|HTTPS|NO)_PROXY$/i.test(key)) delete env[key];
    return env;
  }

  settings() {
    return {
      localTtsModel: this.localPath(
        this.value("LIGHTWEAVER_LOCAL_TTS_MODEL", "local_tts_model"),
      ),
      speechPython: resolveExecutable(
        this.value(
          "LIGHTWEAVER_SPEECH_PYTHON",
          "speech_python",
          defaultSpeechPython(),
        ),
        this.root,
      ),
      translationModel: this.localPath(
        this.value("LIGHTWEAVER_TRANSLATION_MODEL", "translation_model"),
      ),
      translationServer: resolveExecutable(
        this.value(
          "LIGHTWEAVER_TRANSLATION_SERVER",
          "translation_server",
          "llama-server",
        ),
        this.root,
      ),
      python3: resolveExecutable("python3", this.root),
    };
  }

  descriptors(): SpeechDescriptor[] {
    const settings = this.settings();
    const localReady =
      !!settings.speechPython &&
      this.isLocalVoxcpmModel(settings.localTtsModel);
    const translationReady =
      !!settings.python3 &&
      !!settings.translationServer &&
      this.isGguf(settings.translationModel);
    return z.array(ProviderDescriptor).parse([
      {
        id: LOCAL_TTS_PROVIDER,
        name: "本地 VoxCPM2",
        capabilities: ["tts", "voice-design"],
        model: settings.localTtsModel,
        version: "local-voxcpm2-v2",
        endpoint: "local-process",
        ready: localReady,
        remote: false,
        idempotency: true,
        cancellation: "process-tree",
        hint: "配置 local_tts_model、speech_python，并在独立环境安装 weaver/requirements.speech.txt",
      },
      {
        id: TRANSLATION_PROVIDER,
        name: "Hy-MT2 字幕翻译",
        capabilities: ["translation"],
        model: settings.translationModel,
        version: "hy-mt2-chat-v1",
        endpoint: "local-process",
        ready: translationReady,
        remote: false,
        idempotency: false,
        cancellation: "process-tree",
        hint: "配置 translation_model 与 translation_server（默认 llama-server）",
      },
    ]);
  }

  files(id: string): string[] {
    const provider = this.provider(id);
    const settings = this.settings();
    if (provider === LOCAL_TTS_PROVIDER)
      return [
        this.script("speech_models.py"),
        resourcePath("weaver", "src", "adapters", "speech-models.ts"),
        resourcePath("weaver", "requirements.speech.txt"),
        settings.speechPython,
      ];
    return [
      this.script("subtitle_models.py"),
      resourcePath("weaver", "src", "adapters", "speech-models.ts"),
      settings.python3,
      settings.translationServer,
    ];
  }

  async versions(id: string): Promise<unknown> {
    const provider = this.provider(id);
    const settings = this.settings();
    if (provider === LOCAL_TTS_PROVIDER) {
      if (!settings.speechPython)
        return {
          available: false,
          missing: ["speech_python"],
        };
      return this.runJson(
        settings.speechPython,
        [
          this.script("speech_models.py"),
          "inspect",
          settings.localTtsModel,
        ],
        { cwd: this.root, timeoutMs: 10000 },
      );
    }
    if (!settings.python3)
      return {
        available: false,
        missing: ["python3"],
      };
    return this.runJson(
      settings.python3,
      [
        this.script("subtitle_models.py"),
        "inspect",
        settings.translationModel,
        settings.translationServer,
      ],
      { cwd: this.root, timeoutMs: 10000 },
    );
  }

  async freeze(id: string): Promise<string> {
    const provider = this.provider(id);
    this.require(provider);
    const descriptor = this.descriptors().find((item) => item.id === provider);
    if (!descriptor)
      throw new WeaverError("CAPABILITY_UNAVAILABLE", "本地语音描述符缺失");
    const runtime = await this.versions(provider);
    if (!z.object({available: z.boolean()}).parse(runtime).available)
      throw new WeaverError("CONFIG_MISSING", "本地语音运行时依赖不完整", {provider, runtime});
    const packagePaths = provider === LOCAL_TTS_PROVIDER
      ? z.object({packagePaths: z.array(z.string().min(1)).min(1)}).parse(runtime).packagePaths : [];
    const files = [];
    for (const file of [descriptor.model, ...this.files(provider), ...packagePaths])
      files.push({ path: file, digest: await localModelDigest(file) });
    const binding = OwnBinding.parse({
      format: "lightweaver-speech-model-v1",
      id: provider,
      model: descriptor.model,
      version: descriptor.version,
      endpoint: descriptor.endpoint,
      files,
      runtime,
    });
    return JSON.stringify(binding);
  }

  async assertBinding(id: string, binding?: string): Promise<void> {
    if (!binding) return;
    const provider = this.provider(id);
    let raw: unknown;
    try {
      raw = JSON.parse(binding);
    } catch {
      throw new WeaverError(
        "PROVIDER_CHANGED",
        "本地语音 binding 不是 SpeechModels 自有格式",
      );
    }
    const parsed = OwnBinding.safeParse(raw);
    if (!parsed.success || parsed.data.id !== provider)
      throw new WeaverError(
        "PROVIDER_CHANGED",
        "本地语音 binding 不是当前 provider 的自有格式",
        { id: provider },
      );
    if (JSON.stringify(parsed.data) !== (await this.freeze(provider)))
      throw new WeaverError(
        "PROVIDER_CHANGED",
        "本地语音模型、配置或运行时已改变",
        { id: provider },
      );
  }

  require(id: string): void {
    const provider = this.provider(id);
    const settings = this.settings();
    const missing =
      provider === LOCAL_TTS_PROVIDER
        ? [
            ...(!settings.speechPython ? ["speech_python"] : []),
            ...(!settings.localTtsModel ? ["local_tts_model"] : []),
            ...(settings.localTtsModel &&
            !this.isLocalVoxcpmModel(settings.localTtsModel)
              ? ["local_tts_model:VoxCPM2"]
              : []),
          ]
        : [
            ...(!settings.python3 ? ["python3"] : []),
            ...(!settings.translationModel ? ["translation_model"] : []),
            ...(settings.translationModel &&
            !this.isGguf(settings.translationModel)
              ? ["translation_model:GGUF"]
              : []),
            ...(!settings.translationServer ? ["translation_server"] : []),
          ];
    if (!missing.length) return;
    throw new WeaverError(
      "CONFIG_MISSING",
      provider === LOCAL_TTS_PROVIDER
        ? "本地 VoxCPM2 尚未配置"
        : "Hy-MT2 字幕翻译尚未配置",
      { provider, missing },
      provider === LOCAL_TTS_PROVIDER
        ? [
            "创建独立环境：uv venv --python 3.12 weaver/.speech-venv",
            `安装语音依赖：uv pip install --python ${defaultSpeechPython()} -r weaver/requirements.speech.txt`,
            "配置 local_tts_model 与 speech_python",
          ]
        : [
            "配置 translation_model（Hy-MT2 GGUF）",
            "配置 translation_server（默认从 PATH 查找 llama-server）",
          ],
    );
  }

  async synthesize(input: z.infer<typeof SynthesizeInput>): Promise<void> {
    const parsed = SynthesizeInput.parse(input);
    parsed.signal.throwIfAborted();
    this.require(LOCAL_TTS_PROVIDER);
    await this.assertBinding(LOCAL_TTS_PROVIDER, parsed.binding);

    const workDir = path.resolve(this.root, parsed.workDir);
    const dest = path.resolve(workDir, parsed.dest);
    const reference = parsed.reference
      ? path.resolve(workDir, parsed.reference)
      : "";
    if (reference) {
      const stat = fs.statSync(reference);
      if (!stat.isFile() || stat.size < 1 || stat.size > 5 * 1024 * 1024)
        throw new WeaverError(
          "INVALID_INPUT",
          "VoxCPM2 参考音频必须是 1 字节到 5 MiB 的文件",
        );
    }
    fs.mkdirSync(workDir, { recursive: true });
    const settings = this.settings();
    const job = path.join(workDir, "speech-job.json");
    const conditioning = Conditioning.parse(!reference ? {mode: "design"} :
      parsed.style?.trim() || !parsed.referenceText?.trim()
        ? {mode: "controlled-clone", reference}
        : {mode: "continuation-clone", reference, referenceText: parsed.referenceText.trim()});
    fs.writeFileSync(
      job,
      JSON.stringify({
        kind: "synthesize",
        model: settings.localTtsModel,
        text: parsed.text,
        ...conditioning,
        style: parsed.style?.trim() || undefined,
        dest,
      }),
      { mode: 0o600 },
    );
    const output = await this.runJson(
      settings.speechPython,
      [this.script("speech_models.py"), "synthesize", job],
      {
        cwd: workDir,
        signal: parsed.signal,
        timeoutMs: 900000,
      },
    );
    const result = SynthesizeResult.parse(output);
    if (
      result.model !== settings.localTtsModel ||
      path.resolve(result.dest) !== dest
    )
      throw new WeaverError(
        "PROVIDER_FORMAT",
        "VoxCPM2 返回了非本次作业的模型或目标文件",
      );
    const stat = fs.statSync(dest);
    if (!stat.isFile() || stat.size !== result.bytes || stat.size < 44)
      throw new WeaverError("PROVIDER_FORMAT", "VoxCPM2 WAV 文件不完整");
    const header = Buffer.alloc(12);
    const fd = fs.openSync(dest, "r");
    try {
      fs.readSync(fd, header, 0, header.length, 0);
    } finally {
      fs.closeSync(fd);
    }
    if (
      header.toString("ascii", 0, 4) !== "RIFF" ||
      header.toString("ascii", 8, 12) !== "WAVE"
    )
      throw new WeaverError("PROVIDER_FORMAT", "VoxCPM2 输出不是 WAV");
    await this.assertBinding(LOCAL_TTS_PROVIDER, parsed.binding);
  }

  async translate(
    input: z.infer<typeof TranslateInput>,
  ): Promise<z.infer<typeof TranslateResult>> {
    const parsed = TranslateInput.parse(input);
    parsed.signal.throwIfAborted();
    this.require(TRANSLATION_PROVIDER);
    await this.assertBinding(TRANSLATION_PROVIDER, parsed.binding);

    const workDir = path.resolve(this.root, parsed.workDir);
    fs.mkdirSync(workDir, { recursive: true });
    const settings = this.settings();
    const job = path.join(workDir, "translation-job.json");
    fs.writeFileSync(
      job,
      JSON.stringify({
        kind: "translate",
        model: settings.translationModel,
        server: settings.translationServer,
        targetLocale: parsed.targetLocale,
        texts: parsed.texts,
      }),
      { mode: 0o600 },
    );
    const result = TranslateResult.parse(
      await this.runJson(
        settings.python3,
        [this.script("subtitle_models.py"), "translate", job],
        {
          cwd: workDir,
          signal: parsed.signal,
          timeoutMs: 900000,
        },
      ),
    );
    if (
      result.items.length !== parsed.texts.length ||
      result.items.some(
        (item, index) =>
          item.id !== parsed.texts[index]?.id ||
          !item.text.trim(),
      )
    )
      throw new WeaverError(
        "PROVIDER_FORMAT",
        "Hy-MT2 返回的字幕标识、数量或顺序与输入不一致",
      );
    await this.assertBinding(TRANSLATION_PROVIDER, parsed.binding);
    return result;
  }

  private async runJson(
    command: string,
    args: string[],
    options: {
      cwd: string;
      signal?: AbortSignal;
      timeoutMs: number;
    },
  ): Promise<unknown> {
    if (!command)
      throw new WeaverError("CONFIG_MISSING", "本地语音运行时未配置");
    const result = await processRun(command, args, {
      ...options,
      env: {...this.environment(), NUMBA_CACHE_DIR: path.join(options.cwd, ".numba-cache")},
    });
    const line = result.stdout
      .trim()
      .split("\n")
      .reverse()
      .find((item) => item.startsWith("{") || item.startsWith("["));
    if (!line)
      throw new WeaverError("PROVIDER_FORMAT", "本地语音适配器没有输出 JSON");
    let output: unknown;
    try {
      output = JSON.parse(line);
    } catch {
      throw new WeaverError("PROVIDER_FORMAT", "本地语音适配器输出 JSON 无效");
    }
    const error = ProcessError.safeParse(output);
    if (error.success)
      throw new WeaverError(error.data.error.code, error.data.error.message);
    return output;
  }
}
