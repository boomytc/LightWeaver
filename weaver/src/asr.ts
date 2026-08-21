import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { localConfigValue } from "./config.ts";
import { voiceCandidateRoot, weaverRoot, weaverScriptsRoot } from "./paths.ts";

export type AsrWord = { token: string; start: number; end: number };
export type AsrSentence = { text: string; start: number; end: number; words?: AsrWord[] };

export type AsrResult = {
  text: string;
  language: string;
  seconds: number;
  sentences?: AsrSentence[];
};

export type AsrRuntime = {
  ready: boolean;
  model?: string;
  library?: string;
  bindings?: string;
  hint?: string;
};

export type AsrOptions = {
  audio: string;
  language?: string;
  root?: string;
};

export type TranscribeFn = (options: AsrOptions) => Pick<AsrResult, "text">;

export function parseAsrResult(output: string): AsrResult {
  const lines = output.split(/\r?\n/).map((row) => row.trim());
  let line = "";
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i]?.startsWith("{")) {
      line = lines[i] ?? "";
      break;
    }
  }
  if (!line) throw new Error(`转写没有 JSON 输出：${output.slice(-400)}`);
  try {
    const parsed = JSON.parse(line) as {
      text?: unknown;
      language?: unknown;
      seconds?: unknown;
      sentences?: unknown;
    };
    return {
      text: String(parsed.text ?? "").trim(),
      language: String(parsed.language ?? "").trim(),
      seconds: Number(parsed.seconds) || 0,
      sentences: parseAsrSentences(parsed.sentences),
    };
  } catch {
    throw new Error(`转写输出无法解析：${line.slice(0, 240)}`);
  }
}

export function asrRuntime(
  root = weaverRoot(),
  env: NodeJS.ProcessEnv = process.env,
): AsrRuntime {
  const model = firstFile([
    env.LIGHTWEAVER_ASR_MODEL,
    localConfigValue("asr_model", root),
  ]);
  const library = firstFile([
    env.TRANSCRIBE_LIBRARY,
    localConfigValue("asr_library", root),
  ]);
  const bindings = firstDir([
    env.LIGHTWEAVER_ASR_BINDINGS,
    localConfigValue("asr_bindings", root),
  ]);
  if (model && library && bindings) {
    return { ready: true, model, library, bindings };
  }
  const missing = [
    !model ? "Qwen3-ASR GGUF（asr_model / LIGHTWEAVER_ASR_MODEL）" : "",
    !library ? "libtranscribe（asr_library / TRANSCRIBE_LIBRARY）" : "",
    !bindings ? "transcribe_cpp 绑定（asr_bindings / LIGHTWEAVER_ASR_BINDINGS）" : "",
  ].filter(Boolean);
  return {
    ready: false,
    model,
    library,
    bindings,
    hint: `转写未就绪：缺 ${missing.join("、")}。在 config.local.yaml 或环境变量里显式给出 asr_model / asr_library / asr_bindings。`,
  };
}

export function runAsr(options: AsrOptions): AsrResult {
  const root = options.root ?? weaverRoot();
  const audio = path.resolve(options.audio);
  if (!fs.existsSync(audio) || !fs.statSync(audio).isFile()) {
    throw new Error(`找不到音频 ${options.audio}`);
  }
  const python = path.join(weaverScriptsRoot(), "asr.py");
  if (!fs.existsSync(python)) throw new Error(`找不到 ${python}`);
  const runtime = asrRuntime(root);
  if (!runtime.ready) throw new Error(runtime.hint ?? "转写未就绪");
  const folder = voiceCandidateRoot(root);
  fs.mkdirSync(folder, { recursive: true });
  const jobFile = path.join(folder, `asr-${Date.now()}-${process.pid}.job.json`);
  fs.writeFileSync(
    jobFile,
    `${JSON.stringify(
      {
        kind: "transcribe",
        audio,
        language: options.language ?? "",
        model: runtime.model,
        library: runtime.library,
        bindings: runtime.bindings,
        backend: "auto",
        configDirs: [root],
      },
      null,
      2,
    )}\n`,
  );
  try {
    const output = execFileSync("python3", [python, "--job", jobFile], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 16 * 1024 * 1024,
    });
    const parsed = parseAsrResult(output);
    if (!parsed.text) throw new Error("转写没有得到文本，请手写这句再说的话");
    return parsed;
  } catch (error) {
    const err = error as { stderr?: string; stdout?: string; message: string };
    throw new Error([err.stderr, err.stdout, err.message].filter(Boolean).join("\n"));
  } finally {
    fs.rmSync(jobFile, { force: true });
  }
}

export function ensureVoiceSaid(
  audio: string,
  said: string | undefined,
  root = weaverRoot(),
  transcribe: TranscribeFn = runAsr,
): string {
  const given = (said ?? "").trim();
  if (given) return given;
  const text = transcribe({ audio, root }).text.trim();
  if (!text) throw new Error("转写没有得到文本，请手写这句再说的话");
  return text;
}

export function wavFileSeconds(file: string): number {
  try {
    const out = execFileSync(
      "ffprobe",
      ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", file],
      { encoding: "utf8" },
    );
    const n = Number(out.trim());
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

function parseAsrSentences(raw: unknown): AsrSentence[] | undefined {
  if (!Array.isArray(raw) || !raw.length) return undefined;
  const sentences: AsrSentence[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const words = Array.isArray(row.words)
      ? row.words.flatMap((word) => {
          if (!word || typeof word !== "object") return [];
          const token = String((word as { token?: unknown }).token ?? "");
          if (!token) return [];
          return [
            {
              token,
              start: Number((word as { start?: unknown }).start) || 0,
              end: Number((word as { end?: unknown }).end) || 0,
            },
          ];
        })
      : [];
    sentences.push({
      text: String(row.text ?? "").trim(),
      start: Number(row.start) || 0,
      end: Number(row.end) || 0,
      words,
    });
  }
  return sentences.length ? sentences : undefined;
}

function firstFile(candidates: Array<string | undefined>): string | undefined {
  for (const raw of candidates) {
    const value = (raw ?? "").trim();
    if (!value) continue;
    if (fs.existsSync(value) && fs.statSync(value).isFile()) return value;
  }
  return undefined;
}

function firstDir(candidates: Array<string | undefined>): string | undefined {
  for (const raw of candidates) {
    const value = (raw ?? "").trim();
    if (!value) continue;
    if (fs.existsSync(path.join(value, "transcribe_cpp"))) return value;
  }
  return undefined;
}
