import fs from "node:fs";
import path from "node:path";
import { findAsset, resolveAssetFile, upsertAsset } from "./assets.ts";
import {
  buildSequences,
  descriptionIsReady,
  pickFrameTimes,
  sequenceNeedsVision,
  type DescriptionDoc,
  type SequenceObservation,
} from "./describe-group.ts";
import { extractJpeg, jpegRel } from "./describe-frames.ts";
import { describePrompt, runVlm, type VlmResult } from "./vlm.ts";
import { extractFrameHashes, type FrameHash } from "./match-visual.ts";
import { detectScenes, type SceneIndex } from "./match-scene.ts";
import { hasAudioStream, probeDuration } from "./probe.ts";
import { loadProject } from "./project.ts";
import { weaverRoot } from "./paths.ts";
import { filmTask, type ProjectRecord } from "./schema.ts";
import { readTranscript, runTranscribe, transcriptRel, type TranscriptResult } from "./transcribe.ts";

export type { DescriptionDoc, SequenceObservation, ShotObservation, SequenceLine } from "./describe-group.ts";

export type DescribeOptions = {
  projectId: string;
  ref?: string;
  root?: string;
  force?: boolean;
  visual?: boolean;
};

export type DescribeDeps = {
  transcribe?: (opts: { projectId: string; ref: string; root: string }) => { transcript: TranscriptResult };
  hasAudio?: (file: string) => boolean;
  scenes?: (file: string) => SceneIndex;
  duration?: (file: string) => number;
  hashes?: (file: string) => FrameHash[];
  jpeg?: (file: string, t: number, dest: string) => void;
  vlm?: (input: { frames: { t: number; path: string }[]; prompt: string; prev?: string }) => VlmResult;
};

export type DescribeResult = {
  projectId: string;
  file: string;
  visualCalls: number;
  description: DescriptionDoc;
};

export function descriptionRel(videoId: string): string {
  return path.posix.join("assets/descriptions", `${videoId}.json`);
}

export function readDescription(abs: string): DescriptionDoc | null {
  if (!fs.existsSync(abs)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(abs, "utf8")) as DescriptionDoc;
    if (!raw || !Array.isArray(raw.sequences)) return null;
    return raw;
  } catch {
    return null;
  }
}

export function runDescribe(options: DescribeOptions, deps: DescribeDeps = {}): DescribeResult {
  const root = options.root ?? weaverRoot();
  const project = loadProject(options.projectId, root);
  if (filmTask(project.film) !== "footage-narration") {
    throw new Error("describe 只用于 footage-narration");
  }
  const ref = options.ref ?? firstVideoRef(project);
  if (!ref) throw new Error("没有可描述的源视频。先登记 asset:video.*");
  const resolved = resolveAssetFile(project, ref, undefined, root);
  if (!resolved || !fs.existsSync(resolved.absPath)) throw new Error(`找不到源视频 ${ref}`);
  const videoId = findAsset(project, ref, root)?.id ?? "origin";
  const rel = descriptionRel(videoId);
  const abs = path.join(project.root, rel);
  if (!options.force) {
    const cached = readDescription(abs);
    if (descriptionIsReady(cached)) {
      upsertAsset(project, { id: `description.${videoId}`, kind: "description", file: rel, scene: videoId });
      return { projectId: project.id, file: rel, visualCalls: 0, description: cached! };
    }
  }

  const duration = (deps.duration ?? probeDuration)(resolved.absPath);
  const scenes = deps.scenes?.(resolved.absPath) ?? detectScenes(resolved.absPath, duration);
  const hashDir = path.join(project.root, "assets/match/frames", videoId);
  const hashes = deps.hashes?.(resolved.absPath) ?? extractFrameHashes(resolved.absPath, hashDir);
  const transcript = loadTranscript(project, ref, resolved.absPath, root, deps);
  const sequences = buildSequences(scenes.duration ? scenes : { ...scenes, duration }, hashes, transcriptLines(transcript), {
    visual: options.visual,
  });
  if (!sequences.length) throw new Error("没有可用的场。检查源视频是否可读。");

  let visualCalls = 0;
  let prev = "";
  const jpeg = deps.jpeg ?? extractJpeg;
  const vlm = deps.vlm;
  for (const sequence of sequences) {
    if (!sequenceNeedsVision(sequence)) {
      if (sequence.shots.some((shot) => shot.skip === "same-as-prev") && prev) {
        sequence.observation = prev;
      }
      continue;
    }
    const times = pickFrameTimes(sequence);
    const frames = times.map((t) => {
      const dest = path.join(project.root, jpegRel(videoId, t));
      jpeg(resolved.absPath, t, dest);
      return { t, path: dest };
    });
    if (!frames.length) continue;
    const prompt = describePrompt(frames, prev);
    const result = vlm
      ? vlm({ frames, prompt, prev })
      : runVlm({ frames, prompt, root });
    visualCalls += 1;
    sequence.observation = result.observation.trim();
    prev = sequence.observation;
  }

  const description: DescriptionDoc = {
    source_path: resolved.relPath,
    duration,
    summary: "",
    sequences,
  };
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, `${JSON.stringify(description, null, 2)}\n`);
  upsertAsset(project, { id: `description.${videoId}`, kind: "description", file: rel, scene: videoId });
  return { projectId: project.id, file: rel, visualCalls, description };
}

function firstVideoRef(project: ProjectRecord): string | undefined {
  const asset = project.assets.find((item) => item.kind === "video");
  return asset ? `asset:${asset.id}` : undefined;
}

function transcriptLines(transcript: TranscriptResult | null): { text: string; start: number; end: number }[] {
  if (!transcript) return [];
  return transcript.sentences
    .filter((item) => item.text.trim())
    .map((item) => ({ text: item.text.trim(), start: item.start, end: item.end }));
}

function loadTranscript(
  project: ProjectRecord,
  ref: string,
  media: string,
  root: string,
  deps: DescribeDeps,
): TranscriptResult | null {
  const videoId = findAsset(project, ref, root)?.id ?? "origin";
  const cached = readTranscript(path.join(project.root, transcriptRel(videoId)));
  if (cached) return cached;
  const hasAudio = deps.hasAudio ?? hasAudioStream;
  if (!hasAudio(media)) return null;
  if (deps.transcribe) return deps.transcribe({ projectId: project.id, ref, root }).transcript;
  try {
    return runTranscribe({ projectId: project.id, ref, root }).transcript;
  } catch (error) {
    throw new Error(`有音轨但转写失败：${error instanceof Error ? error.message : String(error)}`);
  }
}
