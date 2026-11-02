import fs from "node:fs";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { z, Digest, Id, Locale, ProviderDescriptor } from "../contracts/index.ts";
import { WeaverError } from "../contracts/errors.ts";
import { readConfig } from "../config.ts";
import { resourcePath, resolveConfiguredPath } from "../runtime.ts";
import { processRun } from "../media/process.ts";
import { probe } from "../media/probe.ts";
import { digest } from "../store/index.ts";
import { defaultModelPython, resolveExecutable } from "./executable.ts";
import { fileDigest, localModelDigest } from "./toolchain.ts";

export const SPEAKER_PROVIDER = "moss-speakers";
export const SPEAKER_MAX_WINDOW_SECONDS = 40;
const SPEAKER_ADAPTER = "moss-transcribe-diarize-cpp-v1";
const SpeakerBackend = z.enum([
  "auto",
  "cpu",
  "metal",
  "vulkan",
  "cpu_accel",
  "cuda",
]);
type SpeakerSettings = {
  model: string;
  python: string;
  library: string;
  bindings: string;
  vadLibrary: string;
  ffmpeg: string;
  script: string;
  backend: z.infer<typeof SpeakerBackend>;
};

const SpeakerSegment = z
  .strictObject({
    text: z.string().refine((value) => value.trim().length > 0, "语音文本为空"),
    start: z.number().finite().nonnegative(),
    end: z.number().finite().positive(),
    speakerId: Id,
  })
  .refine((segment) => segment.end > segment.start, "说话人分段时码无效");

export const SpeakerTranscript = z.strictObject({
  segments: z.array(SpeakerSegment).min(1),
});
export type SpeakerTranscriptValue = z.infer<typeof SpeakerTranscript>;

const SpeakerRuntime = z.strictObject({
  nativeVersion: z.string().min(1),
  nativeCommit: z.string(),
  library: z.string().min(1),
  python: z.string().min(1),
  contract: z.literal("moss-diarize-on-segment-timestamps-v1"),
});
type SpeakerRuntimeValue = z.infer<typeof SpeakerRuntime>;

const SpeakerBinding = z.strictObject({
  format: z.literal("lightweaver-speaker-model-v1"),
  id: z.literal(SPEAKER_PROVIDER),
  version: z.literal(SPEAKER_ADAPTER),
  model: z.string().min(1),
  backend: SpeakerBackend,
  endpoint: z.literal("local-process"),
  files: z.strictObject({
    model: Digest,
    script: Digest,
    python: Digest,
    library: Digest,
    nativeLibraries: Digest,
    bindings: Digest,
    vadLibrary: Digest,
    ffmpeg: Digest,
  }),
  runtime: SpeakerRuntime,
});
type SpeakerBindingValue = z.infer<typeof SpeakerBinding>;

const TranscribeInput = z.strictObject({
  audio: z.string().min(1),
  locale: Locale,
  workDir: z.string().min(1),
  signal: z.instanceof(AbortSignal),
  binding: z.string().min(1).optional(),
});

const ProcessError = z.object({
  error: z.object({
    code: z.string().min(1),
    message: z.string().min(1),
  }),
});

export function speakerLanguage(locale: string): "zh" | "en" {
  const language = Locale.parse(locale).toLowerCase().split("-")[0];
  if (language === "zh" || language === "en") return language;
  throw new WeaverError(
    "INVALID_INPUT",
    "说话人分段仅支持中文或英文",
    { locale, supported: ["zh", "en"] },
  );
}

export class SpeakerModels {
  constructor(private readonly root: string) {}

  private value(environment: string, key: string, fallback = ""): string {
    return readConfig({ root: this.root }).field({ key, environment, fallback }).value;
  }

  private localPath(value: string): string {
    return value ? resolveConfiguredPath(value) : "";
  }

  private isGguf(file: string): boolean {
    try {
      const header = Buffer.alloc(4);
      const descriptor = fs.openSync(file, "r");
      try {
        fs.readSync(descriptor, header, 0, header.length, 0);
      } finally {
        fs.closeSync(descriptor);
      }
      return header.toString("ascii") === "GGUF";
    } catch {
      return false;
    }
  }

  settings(): SpeakerSettings {
    return {
      model: this.localPath(
        this.value(
          "LIGHTWEAVER_DIARIZATION_MODEL",
          "diarization_model",
        ),
      ),
      python: resolveExecutable(
        this.value(
          "LIGHTWEAVER_MODEL_PYTHON",
          "model_python",
          defaultModelPython(),
        ),
        this.root,
      ),
      library: this.localPath(
        this.value("TRANSCRIBE_LIBRARY", "asr_library"),
      ),
      bindings: this.localPath(
        this.value(
          "LIGHTWEAVER_ASR_BINDINGS",
          "asr_bindings",
        ),
      ),
      vadLibrary: this.localPath(
        this.value("LIGHTWEAVER_VAD_LIBRARY", "vad_library"),
      ),
      ffmpeg: resolveExecutable("ffmpeg", this.root),
      script: resourcePath("weaver", "scripts", "speakers.py"),
      backend: SpeakerBackend.parse(
        this.value(
          "LIGHTWEAVER_DIARIZATION_BACKEND",
          "diarization_backend",
        ),
      ),
    };
  }

  descriptors() {
    const settings = this.settings();
    const isFile = (file: string) => {
      try {
        return fs.statSync(file).isFile();
      } catch {
        return false;
      }
    };
    const isDirectory = (directory: string) => {
      try {
        return fs.statSync(directory).isDirectory();
      } catch {
        return false;
      }
    };
    return z.array(ProviderDescriptor).parse([
      {
        id: SPEAKER_PROVIDER,
        name: "MOSS 临时说话人分段",
        capabilities: ["diarization"],
        model: settings.model,
        version: SPEAKER_ADAPTER,
        endpoint: "local-process",
        ready:
          isFile(settings.python) &&
          isFile(settings.ffmpeg) &&
          isFile(settings.script) &&
          isDirectory(settings.bindings) &&
          isFile(settings.library) &&
          isFile(settings.vadLibrary) &&
          this.isGguf(settings.model),
        remote: false,
        idempotency: true,
        cancellation: "process-tree",
        hint:
          "配置 diarization_model、model_python、asr_library、asr_bindings 与 vad_library；标签仅在同一窗口内有效",
      },
    ]);
  }

  private checkReady(): void {
    const descriptor = this.descriptors().find(
      (provider) => provider.id === SPEAKER_PROVIDER,
    );
    if (descriptor?.ready) return;
    throw new WeaverError(
      "CONFIG_MISSING",
      "MOSS 说话人分段模型或运行时尚未配置",
      { provider: SPEAKER_PROVIDER, model: this.settings().model },
      [
        descriptor?.hint ||
          "配置 diarization_model、model_python、asr_library、asr_bindings 与 vad_library",
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
      HF_HUB_DISABLE_TELEMETRY: "1",
    };
    for (const key of Object.keys(environment)) {
      const upper = key.toUpperCase();
      if (
        upper.startsWith("PYTHON") ||
        upper.startsWith("TRANSCRIBE_") ||
        upper.endsWith("_PROXY")
      )
        delete environment[key];
    }
    environment.PYTHONPATH = "";
    environment.PYTHONNOUSERSITE = "1";
    environment.PYTHONDONTWRITEBYTECODE = "1";
    environment.HF_HUB_OFFLINE = "1";
    environment.TRANSFORMERS_OFFLINE = "1";
    environment.HF_HUB_DISABLE_TELEMETRY = "1";
    return environment;
  }

  private async runJson(
    args: string[],
    options: {
      cwd: string;
      signal?: AbortSignal;
      timeoutMs: number;
    },
    python = this.settings().python,
  ): Promise<unknown> {
    if (!python)
      throw new WeaverError(
        "CONFIG_MISSING",
        "未配置 LightWeaver 模型 Python 环境",
      );
    const result = await processRun(python, args, {
      ...options,
      env: this.environment(),
    });
    const line = result.stdout
      .trim()
      .split("\n")
      .reverse()
      .find((item) => item.startsWith("{") || item.startsWith("["));
    if (!line)
      throw new WeaverError(
        "PROVIDER_FORMAT",
        "MOSS 说话人适配器没有输出 JSON",
      );
    let output: unknown;
    try {
      output = JSON.parse(line);
    } catch {
      throw new WeaverError(
        "PROVIDER_FORMAT",
        "MOSS 说话人适配器输出 JSON 无效",
      );
    }
    const error = ProcessError.safeParse(output);
    if (error.success)
      throw new WeaverError(error.data.error.code, error.data.error.message);
    return output;
  }

  private async inspect(settings: SpeakerSettings): Promise<SpeakerRuntimeValue> {
    return SpeakerRuntime.parse(
      await this.runJson(
        [
          settings.script,
          "inspect",
          settings.library,
          settings.bindings,
        ],
        { cwd: this.root, timeoutMs: 10000 },
        settings.python,
      ),
    );
  }

  private async nativeLibraries(library: string): Promise<z.infer<typeof Digest>> {
    const directory = path.dirname(library);
    const files = fs
      .readdirSync(directory)
      .filter((name) => /\.(?:dylib|so|dll)$/i.test(name))
      .sort((left, right) => left.localeCompare(right));
    if (!files.length)
      throw new WeaverError(
        "CONFIG_MISSING",
        "transcribe 原生库目录没有共享库",
        { directory },
      );
    return digest(
      await Promise.all(
        files.map(async (name) => ({
          name,
          digest: await fileDigest(path.join(directory, name)),
        })),
      ),
    );
  }

  private async currentBinding(): Promise<SpeakerBindingValue> {
    this.checkReady();
    const settings = this.settings();
    const [
      model,
      script,
      python,
      library,
      nativeLibraries,
      bindings,
      vadLibrary,
      ffmpeg,
      runtime,
    ] = await Promise.all([
      fileDigest(settings.model),
      fileDigest(settings.script),
      fileDigest(settings.python),
      fileDigest(settings.library),
      this.nativeLibraries(settings.library),
      localModelDigest(settings.bindings),
      fileDigest(settings.vadLibrary),
      fileDigest(settings.ffmpeg),
      this.inspect(settings),
    ]);
    return SpeakerBinding.parse({
      format: "lightweaver-speaker-model-v1",
      id: SPEAKER_PROVIDER,
      version: SPEAKER_ADAPTER,
      model: settings.model,
      backend: settings.backend,
      endpoint: "local-process",
      files: {
        model,
        script,
        python,
        library,
        nativeLibraries,
        bindings,
        vadLibrary,
        ffmpeg,
      },
      runtime,
    });
  }

  async freeze(): Promise<string> {
    return JSON.stringify(await this.currentBinding());
  }

  async require(binding?: string): Promise<void> {
    this.checkReady();
    if (!binding) return;
    let frozen: SpeakerBindingValue;
    try {
      frozen = SpeakerBinding.parse(JSON.parse(binding));
    } catch {
      throw new WeaverError(
        "PROVIDER_CHANGED",
        "说话人模型绑定无效或版本不兼容，请重新提交作业",
        { provider: SPEAKER_PROVIDER },
      );
    }
    if (!isDeepStrictEqual(frozen, await this.currentBinding()))
      throw new WeaverError(
        "PROVIDER_CHANGED",
        "说话人模型、原生运行时或绑定文件已改变，请重新提交作业",
        { provider: SPEAKER_PROVIDER },
      );
  }

  async transcribe(input: {
    audio: string;
    locale: string;
    workDir: string;
    signal: AbortSignal;
    binding?: string;
  }): Promise<SpeakerTranscriptValue> {
    const parsed = TranscribeInput.parse(input);
    parsed.signal.throwIfAborted();
    this.checkReady();
    await this.require(parsed.binding);
    const audio = path.resolve(parsed.audio);
    const workDir = path.resolve(parsed.workDir);
    const stat = fs.statSync(audio);
    if (!stat.isFile() || stat.size <= 0)
      throw new WeaverError(
        "INVALID_INPUT",
        "说话人模型音频必须是普通文件",
        { audio },
      );
    fs.mkdirSync(workDir, { recursive: true });
    const fact = await probe(audio, parsed.signal);
    if (!fact.audio)
      throw new WeaverError("INVALID_MEDIA", "说话人模型音频没有音轨");
    const duration = fact.durationUs / 1e6;
    if (
      !Number.isFinite(duration) ||
      duration <= 0 ||
      duration > SPEAKER_MAX_WINDOW_SECONDS
    )
      throw new WeaverError(
        "INPUT_TOO_LONG",
        `说话人模型窗口必须在 ${SPEAKER_MAX_WINDOW_SECONDS} 秒以内`,
        { duration, maximum: SPEAKER_MAX_WINDOW_SECONDS },
      );

    const settings = this.settings();
    const job = path.join(workDir, "speaker-transcribe-job.json");
    fs.writeFileSync(
      job,
      JSON.stringify({
        kind: "transcribe",
        audio,
        model: settings.model,
        library: settings.library,
        bindings: settings.bindings,
        vadLibrary: settings.vadLibrary,
        ffmpeg: settings.ffmpeg,
        language: speakerLanguage(parsed.locale),
        backend: settings.backend,
        maximumSeconds: SPEAKER_MAX_WINDOW_SECONDS,
      }),
      { mode: 0o600 },
    );
    const result = SpeakerTranscript.parse(
      await this.runJson([settings.script, "transcribe", job], {
        cwd: workDir,
        signal: parsed.signal,
        timeoutMs: 900000,
      }, settings.python),
    );
    parsed.signal.throwIfAborted();
    if (
      result.segments.some(
        (segment) =>
          segment.start < 0 ||
          segment.end > duration ||
          segment.end <= segment.start,
      )
    )
      throw new WeaverError(
        "PROVIDER_FORMAT",
        "MOSS 返回的说话人时码超出输入窗口",
        { duration },
      );
    await this.require(parsed.binding);
    return result;
  }
}
