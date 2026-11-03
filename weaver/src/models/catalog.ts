import path from "node:path";
import {
  z,
  LocalModelCatalogItem,
  ModelCatalog,
} from "../contracts/index.ts";

type FileSpec = z.input<typeof LocalModelCatalogItem>["files"][number];
type BindingSpec = z.input<typeof LocalModelCatalogItem>["bindings"][number];
type RuntimeSpec =
  z.input<typeof LocalModelCatalogItem>["runtimeRequirements"][number];

const SHA256 = z.string().regex(/^[a-f0-9]{64}$/);

function file(
  path: string,
  size: number,
  sha256: string,
  executable = false,
): FileSpec {
  return {
    path,
    size,
    sha256: SHA256.parse(sha256),
    executable,
  };
}

export type DownloadSource =
  | { kind: "huggingface"; repository: string; revision: string }
  | { kind: "raw-github"; repository: string; revision: string };

export type DownloadableLocalModel = {
  catalog: z.input<typeof LocalModelCatalogItem>;
  source: DownloadSource;
};

const ALIGNMENT_REVISION = "c7cbfc2048c462b0d63a45797104fc9db3ad62b7";
const EMBEDDING_REVISION = "031f0d4b35536f69ab3509d4893c923264fcf253";
const ASR_REVISION = "7e7c69a577fa2725dfedbe34b5e999336e30a19b";
const LLAMA_SERVER_DOC = "https://github.com/ggml-org/llama.cpp";
const TRANSCRIBE_DOC = "https://github.com/ggml-org/transcribe.cpp";
export const MODELBEST_VLM_MODEL = "MiniCPM-V-4.7-35B-A3B";
export const MODELBEST_TTS_MODEL = "VoxCPM2";

const runtimePython: RuntimeSpec = {
  setting: "python",
  label: "Python 运行环境",
  kind: "executable",
};

const alignmentModel: DownloadableLocalModel = {
  source: {
    kind: "huggingface",
    repository: "Qwen/Qwen3-ForcedAligner-0.6B",
    revision: ALIGNMENT_REVISION,
  },
  catalog: {
    id: "qwen3-forced-aligner",
    name: "Qwen3 ForcedAligner 0.6B",
    capability: "alignment",
    version: ALIGNMENT_REVISION,
    repository: "Qwen/Qwen3-ForcedAligner-0.6B",
    revision: ALIGNMENT_REVISION,
    platform: "all",
    available: true,
    files: [
      file(
        "model.safetensors",
        1835544544,
        "47831d0e82f96b20e9034dba01a075ee06436654719f6a68289e49f1b65ce0e7",
      ),
      file(
        "chat_template.json",
        1161,
        "75a8cfca24f00de72d796fbfed6858fc9614ef3dabd8696684cc3bc03a9c58ff",
      ),
      file(
        "config.json",
        5982,
        "d616c65d46c4b90bdc651b0a0963ea932732241140f337f9bb6b0335a9c8ef09",
      ),
      file(
        "generation_config.json",
        115,
        "948d089b23bca1d214e768d59c4438365665f52ec6d33678f4062206b3fbbb8c",
      ),
      file(
        "merges.txt",
        1671853,
        "8831e4f1a044471340f7c0a83d7bd71306a5b867e95fd870f74d0c5308a904d5",
      ),
      file(
        "preprocessor_config.json",
        330,
        "45e120a4eda2c20c5d7f2ea9354e63536bf35e27aa573fb7cdf78017b378770d",
      ),
      file(
        "tokenizer_config.json",
        12666,
        "3ab80063f8511deb9566e6ad438d17b7a6277fcffd52d92854112f19d36bd81c",
      ),
      file(
        "vocab.json",
        2776833,
        "ca10d7e9fb3ed18575dd1e277a2579c16d108e32f27439684afa0e10b1440910",
      ),
    ],
    bindings: [
      { setting: "alignment_model", target: "directory" },
    ],
    runtimeRequirements: [runtimePython],
  },
};

const embeddingModel: DownloadableLocalModel = {
  source: {
    kind: "huggingface",
    repository: "unsloth/embeddinggemma-2-GGUF",
    revision: EMBEDDING_REVISION,
  },
  catalog: {
    id: "embeddinggemma-2",
    name: "EmbeddingGemma 2",
    capability: "embedding",
    version: EMBEDDING_REVISION,
    repository: "unsloth/embeddinggemma-2-GGUF",
    revision: EMBEDDING_REVISION,
    platform: "all",
    available: true,
    license: "Apache-2.0",
    files: [
      file(
        "embeddinggemma-2-Q8_0.gguf",
        309855520,
        "6f1bd4ac6c5df7444f9cca7ca36cafe6cfa34cd6f49fefb1e0b4be8143aed8bc",
      ),
      file(
        "mmproj-F16.gguf",
        980895232,
        "74bf65c860d292a1eebafd7ca85b44532a2528f03017f9204fe1695916d2c66f",
      ),
    ],
    bindings: [
      {
        setting: "visual_model",
        target: "file",
        file: "embeddinggemma-2-Q8_0.gguf",
      },
      {
        setting: "visual_mmproj",
        target: "file",
        file: "mmproj-F16.gguf",
      },
    ],
    runtimeRequirements: [
      {
        setting: "llama_server",
        label: "支持 EmbeddingGemma 的 llama-server",
        kind: "executable",
        documentationUrl: LLAMA_SERVER_DOC,
      },
      runtimePython,
    ],
  },
};

const asrModel: DownloadableLocalModel = {
  source: {
    kind: "huggingface",
    repository: "handy-computer/qwen3-asr-0.6b-gguf",
    revision: ASR_REVISION,
  },
  catalog: {
    id: "qwen3-asr",
    name: "Qwen3-ASR 0.6B Q8_0",
    capability: "asr",
    version: ASR_REVISION,
    repository: "handy-computer/qwen3-asr-0.6b-gguf",
    revision: ASR_REVISION,
    platform: "all",
    available: true,
    files: [
      file(
        "Qwen3-ASR-0.6B-Q8_0.gguf",
        850423456,
        "f081b2d5e23bd669d92cc331d722a8a0681943b8e6f34b48996fd5c319b5acd8",
      ),
    ],
    bindings: [
      {
        setting: "asr_model",
        target: "file",
        file: "Qwen3-ASR-0.6B-Q8_0.gguf",
      },
    ],
    runtimeRequirements: [
      runtimePython,
      {
        setting: "asr_library",
        label: "transcribe native library",
        kind: "file",
        documentationUrl: TRANSCRIBE_DOC,
      },
      {
        setting: "asr_bindings",
        label: "transcribe Python bindings",
        kind: "directory",
        documentationUrl: TRANSCRIBE_DOC,
      },
      {
        setting: "vad_library",
        label: "TEN VAD native library",
        kind: "file",
        documentationUrl: "https://github.com/TEN-framework/ten-vad",
      },
    ],
  },
};

/** 一键配置可选“同时下载权重”的本地模型。 */
export const LOCAL_SETUP_MODEL_IDS = [
  "qwen3-asr",
  "embeddinggemma-2",
  "qwen3-forced-aligner",
] as const;

export function localModels(): DownloadableLocalModel[] {
  return [asrModel, embeddingModel, alignmentModel];
}

export function catalog(apiKeyConfigured: boolean, baseUrl: string) {
  return ModelCatalog.parse({
    schemaVersion: 1,
    providers: [
      {
        id: "modelbest",
        name: "ModelBest",
        baseUrl,
        apiKeyEnv: "MODELBEST_API_KEY",
        apiKeyConfigured,
        keyUrl: "https://platform.modelbest.cn/",
        docsUrl: "https://platform.modelbest.cn/console/docs",
        models: [
          {
            id: MODELBEST_VLM_MODEL,
            name: MODELBEST_VLM_MODEL,
            capabilities: ["画面观察"],
          },
          {
            id: MODELBEST_TTS_MODEL,
            name: MODELBEST_TTS_MODEL,
            capabilities: ["语音合成", "音色设计"],
          },
        ],
      },
    ],
    localModels: localModels().map((item) => item.catalog),
  });
}

export function downloadUrl(model: DownloadableLocalModel, file: FileSpec): string {
  const path = file.path
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  return model.source.kind === "huggingface"
    ? `https://huggingface.co/${model.source.repository}/resolve/${model.source.revision}/${path}`
    : `https://raw.githubusercontent.com/${model.source.repository}/${model.source.revision}/${path}`;
}

export function modelBindingValue(
  directory: string,
  binding: BindingSpec,
): string {
  switch (binding.target) {
    case "directory":
      return directory;
    case "file":
      return path.join(directory, binding.file);
    case "literal":
      return binding.value;
  }
}
