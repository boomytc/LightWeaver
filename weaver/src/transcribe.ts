import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { findAsset, resolveAssetFile, upsertAsset } from "./assets.ts";
import { runAsr, type AsrResult, type TranscribeFn } from "./asr.ts";
import { loadProject } from "./project.ts";
import { weaverRoot } from "./paths.ts";
import type { ProjectRecord } from "./schema.ts";

export type TranscriptWord = { token: string; start: number; end: number };
export type TranscriptSentence = { text: string; start: number; end: number; words: TranscriptWord[] };
export type TranscriptResult = {
  source_path: string;
  duration: number;
  full_text: string;
  language: string;
  sentences: TranscriptSentence[];
};

export type TranscribeOptions = {
  projectId: string;
  ref?: string;
  root?: string;
};

export function transcriptFromAsr(sourcePath: string, asr: AsrResult): TranscriptResult {
  const duration = asr.seconds > 0 ? asr.seconds : 0;
  const text = asr.text.trim();
  return {
    source_path: sourcePath,
    duration,
    full_text: text,
    language: asr.language,
    sentences: text ? [{ text, start: 0, end: duration, words: [] }] : [],
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

  const audio = audioForAsr(resolved.absPath);
  try {
    const raw = transcribe({ audio, root });
    const asr: AsrResult = {
      text: raw.text,
      language: "language" in raw ? String(raw.language ?? "") : "",
      seconds: "seconds" in raw ? Number(raw.seconds) || 0 : 0,
    };
    const transcript = transcriptFromAsr(resolved.absPath, asr);
    const videoId = findAsset(project, ref, root)?.id ?? "origin";
    const rel = path.posix.join("assets/transcripts", `${videoId}.json`);
    const abs = path.join(project.root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, `${JSON.stringify(transcript, null, 2)}\n`);
    upsertAsset(project, { id: `transcript.${videoId}`, kind: "transcript", file: rel, scene: videoId });
    return { projectId: project.id, file: rel, transcript };
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
