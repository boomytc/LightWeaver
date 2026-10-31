import fs from "node:fs";
import path from "node:path";
import { findAsset, resolveAssetFile, upsertAsset } from "./assets.ts";
import {
  buildSequences,
  describeWindowMatches,
  descriptionIsReady,
  isSameAsPrevObservation,
  mergeByObservation,
  pickFrameTimes,
  readDescription,
  resolveDescribeWindow,
  sequencesInWindow,
  sequenceNeedsVision,
  summaryFromSequences,
  type DescriptionDoc,
} from "./describe-group.ts";
import { extractJpeg, jpegRel } from "./describe-frames.ts";
import { DESCRIBE_SETTINGS } from "./describe-settings.ts";
import { describePrompt, runVlm } from "./vlm.ts";
import { extractFrameHashes } from "./match-visual.ts";
import { detectScenes } from "./match-scene.ts";
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
  from?: number;
  to?: number;
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

export function runDescribe(options: DescribeOptions): DescribeResult {
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
  if (!options.force && options.from == null && options.to == null) {
    const cached = readDescription(abs);
    if (descriptionIsReady(cached) && !cached!.window) {
      upsertAsset(project, { id: `description.${videoId}`, kind: "description", file: rel, scene: videoId });
      return { projectId: project.id, file: rel, visualCalls: 0, description: cached! };
    }
  }

  const duration = probeDuration(resolved.absPath);
  const window = resolveDescribeWindow(options.from, options.to, duration);
  if (!options.force) {
    const cached = readDescription(abs);
    if (descriptionIsReady(cached) && describeWindowMatches(cached!, window)) {
      upsertAsset(project, { id: `description.${videoId}`, kind: "description", file: rel, scene: videoId });
      return { projectId: project.id, file: rel, visualCalls: 0, description: cached! };
    }
  }

  const scenes = detectScenes(resolved.absPath, duration, DESCRIBE_SETTINGS.sceneThreshold);
  const hashDir = path.join(project.root, "assets/match/frames", videoId);
  const hashes = extractFrameHashes(resolved.absPath, hashDir);
  const transcript = loadTranscript(project, ref, resolved.absPath, root);
  const sequences = sequencesInWindow(
    buildSequences(scenes.duration ? scenes : { ...scenes, duration }, hashes, transcriptLines(transcript), {
      visual: options.visual,
      window,
    }),
    window,
  );
  if (!sequences.length) throw new Error("没有可用的场。检查源视频是否可读。");

  let visualCalls = 0;
  let prev = "";
  for (const sequence of sequences) {
    if (!sequenceNeedsVision(sequence)) continue;
    const times = pickFrameTimes(sequence);
    const frames = times.map((t) => {
      const dest = path.join(project.root, jpegRel(videoId, t));
      extractJpeg(resolved.absPath, t, dest);
      return { t, path: dest };
    });
    if (!frames.length) continue;
    const prompt = describePrompt(frames, prev);
    try {
      const result = runVlm({ frames, prompt, root });
      visualCalls += 1;
      const observation = result.observation.trim();
      if (!prev && isSameAsPrevObservation(observation)) {
        console.error(`画面描述跳过 ${sequence.id}：第一场不能写「同前」`);
        continue;
      }
      sequence.observation = observation;
      prev = sequence.observation;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/content_policy_violation/.test(message)) throw error;
      console.error(`画面描述跳过 ${sequence.id}：内容策略`);
    }
  }

  const merged = mergeByObservation(sequences);
  const description: DescriptionDoc = {
    source_path: resolved.relPath,
    duration,
    summary: summaryFromSequences(merged),
    sequences: merged,
    ...(window ? { window } : {}),
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
): TranscriptResult | null {
  const videoId = findAsset(project, ref, root)?.id ?? "origin";
  const cached = readTranscript(path.join(project.root, transcriptRel(videoId)));
  if (cached) return cached;
  if (!hasAudioStream(media)) return null;
  try {
    return runTranscribe({ projectId: project.id, ref, root }).transcript;
  } catch (error) {
    throw new Error(`有音轨但转写失败：${error instanceof Error ? error.message : String(error)}`);
  }
}
