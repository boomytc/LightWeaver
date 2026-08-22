import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { localConfigValue } from "./config.ts";
import { voiceCandidateRoot, weaverRoot, weaverScriptsRoot } from "./paths.ts";
import { ASR_SETTINGS } from "./asr-settings.ts";
import {
  isTruncated,
  stitchAsrResults,
  windowsFor,
  type AsrWindow,
  type AsrWindowResult,
} from "./asr-chunk.ts";

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

export type AsrEngineOutput = AsrResult & { truncated?: boolean; log?: string };

export type AsrEngine = (audio: string) => AsrEngineOutput;

export type AsrDeps = {
  engine?: AsrEngine;
  duration?: (file: string) => number;
  slice?: (file: string, start: number, duration: number, dest: string) => void;
};

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

export function asrAudio(media: string): { audio: string; tmp?: string } {
  const abs = path.resolve(media);
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
    throw new Error(`找不到音频 ${media}`);
  }
  if (/\.wav$/i.test(abs)) return { audio: abs };
  const tmp = path.join(os.tmpdir(), `weaver-asr-${process.pid}-${Date.now()}.wav`);
  try {
    execFileSync("ffmpeg", ["-y", "-i", abs, "-vn", "-ac", "1", "-ar", "16000", tmp], { stdio: "ignore" });
  } catch (error) {
    const err = error as { stderr?: string; message: string };
    throw new Error(`无法抽出音频：${err.stderr || err.message}`);
  }
  return { audio: tmp, tmp };
}

export function runAsr(options: AsrOptions, deps: AsrDeps = {}): AsrResult {
  const root = options.root ?? weaverRoot();
  const prepared = asrAudio(options.audio);
  try {
    const duration = (deps.duration ?? wavFileSeconds)(prepared.audio);
    const engine = deps.engine ?? ((audio: string) => invokeAsrJob(audio, options, root));
    if (!(duration > ASR_SETTINGS.chunkSeconds)) {
      const one = engine(prepared.audio);
      if (!one.text.trim()) throw new Error("转写没有得到文本，请手写这句再说的话");
      if (isTruncated(one, duration, false)) throw new Error("转写被截断");
      return { text: one.text.trim(), language: one.language, seconds: duration || one.seconds, sentences: one.sentences };
    }
    const slice = deps.slice ?? sliceAudio;
    const parts = windowsFor(duration).map((window) =>
      transcribeWindow(prepared.audio, window, { engine, slice, language: options.language, root }, 0),
    );
    const stitched = stitchAsrResults(parts);
    if (!stitched.text.trim()) throw new Error("转写没有得到文本，请手写这句再说的话");
    return { ...stitched, seconds: duration };
  } finally {
    if (prepared.tmp) fs.rmSync(prepared.tmp, { force: true });
  }
}

function transcribeWindow(
  source: string,
  window: AsrWindow,
  ctx: { engine: AsrEngine; slice: NonNullable<AsrDeps["slice"]>; language?: string; root: string },
  depth: number,
): AsrWindowResult {
  const dest = path.join(os.tmpdir(), `weaver-asr-w-${process.pid}-${Math.round(window.start * 1000)}-${Math.round(window.end * 1000)}.wav`);
  try {
    ctx.slice(source, window.start, window.end - window.start, dest);
    const raw = ctx.engine(dest);
    const span = window.end - window.start;
    if (isTruncated(raw, span) && depth === 0) {
      const mid = (window.start + window.end) / 2;
      const left = transcribeWindow(source, { start: window.start, end: mid }, ctx, 1);
      const right = transcribeWindow(source, { start: mid, end: window.end }, ctx, 1);
      return { start: window.start, end: window.end, result: stitchAsrResults([left, right]) };
    }
    if (isTruncated(raw, span) || !raw.text.trim()) {
      throw new Error(`转写被截断（${window.start.toFixed(1)}–${window.end.toFixed(1)}s）`);
    }
    return { start: window.start, end: window.end, result: raw };
  } finally {
    fs.rmSync(dest, { force: true });
  }
}

function sliceAudio(file: string, start: number, duration: number, dest: string): void {
  try {
    execFileSync(
      "ffmpeg",
      ["-y", "-ss", String(start), "-t", String(duration), "-i", file, "-ac", "1", "-ar", "16000", dest],
      { stdio: "ignore" },
    );
  } catch (error) {
    const err = error as { stderr?: string; message: string };
    throw new Error(`无法切开音频：${err.stderr || err.message}`);
  }
}

function invokeAsrJob(audio: string, options: AsrOptions, root: string): AsrEngineOutput {
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
    const spawned = spawnSync("python3", [python, "--job", jobFile], {
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
    });
    const log = `${spawned.stderr ?? ""}\n${spawned.stdout ?? ""}`;
    const truncated = /OutputTruncated/i.test(log);
    if (spawned.status !== 0 && !truncated) {
      throw new Error([spawned.stderr, spawned.stdout, spawned.error?.message].filter(Boolean).join("\n"));
    }
    try {
      const parsed = parseAsrResult(spawned.stdout ?? "");
      return { ...parsed, truncated, log };
    } catch (error) {
      if (truncated) return { text: "", language: "", seconds: 0, truncated: true, log };
      throw error;
    }
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
