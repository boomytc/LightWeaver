import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { findAsset, resolveAssetFile, upsertAsset } from "./assets.ts";
import { runAsr, type AsrResult } from "./asr.ts";
import { loadProject } from "./project.ts";
import { weaverRoot } from "./paths.ts";
import { execFileSync } from "node:child_process";
import { stampTranscript, transcriptIsStamped, type TranscriptDoc, type TranscriptSentence } from "./sentences.ts";
import type { ProjectRecord } from "./schema.ts";

export type TranscriptResult = TranscriptDoc;

export type TranscribeOptions = {
  projectId: string;
  ref?: string;
  root?: string;
};

export function transcriptRel(videoId: string): string {
  return path.posix.join("assets/transcripts", `${videoId}.json`);
}

export function readTranscript(abs: string): TranscriptResult | null {
  if (!fs.existsSync(abs)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(abs, "utf8")) as TranscriptResult;
    if (!raw || typeof raw.full_text !== "string" || !Array.isArray(raw.sentences)) return null;
    return raw;
  } catch {
    return null;
  }
}

export function asrSentences(asr: AsrResult): TranscriptSentence[] | undefined {
  if (!asr.sentences?.length) return undefined;
  return asr.sentences.map((item) => ({
    text: String(item.text ?? "").trim(),
    start: Number(item.start) || 0,
    end: Number(item.end) || 0,
    words: (item.words ?? []).map((word) => ({
      token: String(word.token ?? ""),
      start: Number(word.start) || 0,
      end: Number(word.end) || 0,
    })),
  }));
}

export function transcriptFromAsr(sourcePath: string, asr: AsrResult): TranscriptResult {
  const duration = asr.seconds > 0 ? asr.seconds : 0;
  const text = asr.text.trim();
  const sentences = asrSentences(asr);
  return {
    source_path: sourcePath,
    duration,
    full_text: text,
    language: asr.language,
    sentences: sentences?.length ? sentences : text ? [{ text, start: 0, end: duration, words: [] }] : [],
  };
}

export function runTranscribe(
  options: TranscribeOptions,
  transcribe: (opts: { audio: string; root?: string }) => AsrResult | Pick<AsrResult, "text"> = runAsr,
): { projectId: string; file: string; transcript: TranscriptResult } {
  const root = options.root ?? weaverRoot();
  const project = loadProject(options.projectId, root);
  const ref = options.ref ?? firstVideoRef(project);
  if (!ref) throw new Error("没有可转写的源视频。先登记 asset:video.*");
  const resolved = resolveAssetFile(project, ref, undefined, root);
  if (!resolved || !fs.existsSync(resolved.absPath)) throw new Error(`找不到源视频 ${ref}`);

  const videoId = findAsset(project, ref, root)?.id ?? "origin";
  const rel = transcriptRel(videoId);
  const abs = path.join(project.root, rel);
  const cached = readTranscript(abs);
  if (cached && transcriptIsStamped(cached)) {
    upsertAsset(project, { id: `transcript.${videoId}`, kind: "transcript", file: rel, scene: videoId });
    return { projectId: project.id, file: rel, transcript: cached };
  }

  const audio = audioForAsr(resolved.absPath);
  try {
    const raw = transcribe({ audio, root });
    const asr: AsrResult = {
      text: raw.text,
      language: "language" in raw ? String(raw.language ?? "") : "",
      seconds: "seconds" in raw ? Number(raw.seconds) || 0 : 0,
      sentences: "sentences" in raw ? raw.sentences : undefined,
    };
    const stamped = stampTranscript(transcriptFromAsr(resolved.absPath, asr), { media: resolved.absPath });
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, `${JSON.stringify(stamped, null, 2)}\n`);
    upsertAsset(project, { id: `transcript.${videoId}`, kind: "transcript", file: rel, scene: videoId });
    return { projectId: project.id, file: rel, transcript: stamped };
  } finally {
    if (audio !== resolved.absPath) fs.rmSync(audio, { force: true });
  }
}

function firstVideoRef(project: ProjectRecord): string | undefined {
  const asset = project.assets.find((item) => item.kind === "video");
  return asset ? `asset:${asset.id}` : undefined;
}

function audioForAsr(media: string): string {
  if (/\.wav$/i.test(media)) return media;
  const tmp = path.join(os.tmpdir(), `weaver-asr-${process.pid}-${Date.now()}.wav`);
  try {
    execFileSync("ffmpeg", ["-y", "-i", media, "-vn", "-ac", "1", "-ar", "16000", tmp], { stdio: "ignore" });
  } catch (error) {
    const err = error as { stderr?: string; message: string };
    throw new Error(`无法从源视频抽出音频：${err.stderr || err.message}`);
  }
  return tmp;
}
