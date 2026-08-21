import fs from "node:fs";
import path from "node:path";
import { ffmpegLog, requireBin } from "./probe.ts";
import { MATCH_SETTINGS } from "./match-settings.ts";
import { splitRangeByScene, type SceneIndex } from "./match-scene.ts";
import type { Candidate } from "./match-align.ts";

export type VisualCut = {
  sceneId: string;
  sourceRef: string;
  in: number;
  out: number;
  editedStart: number;
  editedEnd: number;
  text: string;
  score: number;
  textScore: number;
  visualScore: number;
  matchMethod: "text" | "visual" | "visual_scene" | "silent_gap";
  sceneSnapped: boolean;
  warnings: string[];
};

export type FrameHash = { t: number; hash: bigint; mean: [number, number, number] };

const WIDTH = 9;
const HEIGHT = 8;
const FRAME_BYTES = WIDTH * HEIGHT * 3;
const HASH_BITS = (WIDTH - 1) * HEIGHT;

export function dHashFromGray(pixels: Uint8Array, width = WIDTH, height = HEIGHT): bigint {
  let hash = 0n;
  let bit = 0n;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width - 1; x++) {
      const left = pixels[y * width + x] ?? 0;
      const right = pixels[y * width + x + 1] ?? 0;
      if (left > right) hash |= 1n << bit;
      bit += 1n;
    }
  }
  return hash;
}

export function hashScore(a: bigint, b: bigint): number {
  let x = a ^ b;
  let dist = 0;
  while (x > 0n) {
    dist += Number(x & 1n);
    x >>= 1n;
  }
  return 1 - dist / HASH_BITS;
}

export function hashToHex(hash: bigint): string {
  return hash.toString(16).padStart(16, "0");
}

export function hashFromHex(hex: string): bigint {
  return BigInt(`0x${hex}`);
}

export function rgbMean(pixels: Uint8Array): [number, number, number] {
  let r = 0;
  let g = 0;
  let b = 0;
  const count = Math.floor(pixels.length / 3);
  for (let i = 0; i < count; i++) {
    r += pixels[i * 3] ?? 0;
    g += pixels[i * 3 + 1] ?? 0;
    b += pixels[i * 3 + 2] ?? 0;
  }
  if (!count) return [0, 0, 0];
  return [r / count, g / count, b / count];
}

export function lumaPlane(pixels: Uint8Array, width = WIDTH, height = HEIGHT): Uint8Array {
  const gray = new Uint8Array(width * height);
  for (let i = 0; i < gray.length; i++) {
    const r = pixels[i * 3] ?? 0;
    const g = pixels[i * 3 + 1] ?? 0;
    const b = pixels[i * 3 + 2] ?? 0;
    gray[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
  }
  return gray;
}

export function colorScore(a: [number, number, number], b: [number, number, number]): number {
  const dist = Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
  return 1 - dist / (255 * 3);
}

export function frameScore(a: FrameHash, b: FrameHash): number {
  return hashScore(a.hash, b.hash) * 0.5 + colorScore(a.mean, b.mean) * 0.5;
}

type HashCache = { interval: number; frames: { t: number; hash: string; mean: [number, number, number] }[] };

export function extractFrameHashes(
  file: string,
  cacheDir: string,
  interval = MATCH_SETTINGS.frameInterval,
): FrameHash[] {
  const cachePath = path.join(cacheDir, "dhash.json");
  if (fs.existsSync(cachePath)) {
    const cached = JSON.parse(fs.readFileSync(cachePath, "utf8")) as HashCache;
    if (cached.interval === interval && Array.isArray(cached.frames)) {
      return cached.frames.map((frame) => ({
        t: frame.t,
        hash: hashFromHex(frame.hash),
        mean: frame.mean ?? [0, 0, 0],
      }));
    }
  }
  requireBin("ffmpeg", "视觉对齐需要本机安装 ffmpeg。");
  fs.mkdirSync(cacheDir, { recursive: true });
  const rawPath = path.join(cacheDir, "frames.rgb");
  const top = MATCH_SETTINGS.cropTop;
  const bottom = MATCH_SETTINGS.cropBottom;
  const side = MATCH_SETTINGS.cropSide;
  ffmpegLog([
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    file,
    "-vf",
    `fps=${1 / interval},crop=iw*(1-${2 * side}):ih*(1-${top + bottom}):iw*${side}:ih*${top},scale=${WIDTH}:${HEIGHT},format=rgb24`,
    "-f",
    "rawvideo",
    rawPath,
  ]);
  if (!fs.existsSync(rawPath) || fs.statSync(rawPath).size === 0) throw new Error(`抽帧失败：${file}`);
  const raw = fs.readFileSync(rawPath);
  const frames: FrameHash[] = [];
  for (let offset = 0, index = 0; offset + FRAME_BYTES <= raw.length; offset += FRAME_BYTES, index++) {
    const pixels = raw.subarray(offset, offset + FRAME_BYTES);
    frames.push({
      t: index * interval,
      hash: dHashFromGray(lumaPlane(pixels)),
      mean: rgbMean(pixels),
    });
  }
  if (!frames.length) throw new Error(`抽帧为空：${file}`);
  const cache: HashCache = {
    interval,
    frames: frames.map((frame) => ({ t: frame.t, hash: hashToHex(frame.hash), mean: frame.mean })),
  };
  fs.writeFileSync(cachePath, `${JSON.stringify(cache, null, 2)}\n`);
  return frames;
}

function nearestHash(frames: FrameHash[], time: number): FrameHash | undefined {
  if (!frames.length) return undefined;
  return frames.reduce((best, frame) => (Math.abs(frame.t - time) < Math.abs(best.t - time) ? frame : best));
}

export function scoreWindow(
  edited: FrameHash[],
  source: FrameHash[],
  editedStart: number,
  editedEnd: number,
  sourceStart: number,
  sourceEnd: number,
  sampleCount = MATCH_SETTINGS.visualSampleCount,
): number {
  const editedDur = Math.max(0.001, editedEnd - editedStart);
  const sourceDur = Math.max(0.001, sourceEnd - sourceStart);
  let sum = 0;
  let count = 0;
  for (let i = 0; i < sampleCount; i++) {
    const frac = sampleCount === 1 ? 0.5 : i / (sampleCount - 1);
    const editedT = editedStart + editedDur * frac;
    const sourceT = sourceStart + sourceDur * frac;
    const a = nearestHash(edited, editedT);
    const b = nearestHash(source, sourceT);
    if (!a || !b) continue;
    sum += frameScore(a, b);
    count++;
  }
  return count ? sum / count : 0;
}

export function findBestVisualWindow(
  edited: FrameHash[],
  source: FrameHash[],
  editedStart: number,
  editedEnd: number,
  searchStart: number,
  searchEnd: number,
  step = MATCH_SETTINGS.frameInterval,
  expected?: { start: number; end: number },
): { start: number; end: number; score: number } | undefined {
  const duration = Math.max(0.001, editedEnd - editedStart);
  const startMin = searchStart;
  const startMax = Math.max(startMin, searchEnd - duration);
  let best: { start: number; end: number; score: number } | undefined;
  for (let start = startMin; start <= startMax + 1e-9; start += Math.max(0.1, step)) {
    const end = start + duration;
    let score = scoreWindow(edited, source, editedStart, editedEnd, start, end);
    if (expected) {
      const midDelta = Math.abs((start + end) / 2 - (expected.start + expected.end) / 2);
      const penalty = MATCH_SETTINGS.continuityPenalty * Math.min(1, midDelta / duration);
      score = Math.max(0, score - penalty);
    }
    if (!best || score > best.score) best = { start, end, score };
  }
  return best;
}

export function combineScores(textScore: number, visualScore: number): number {
  if (visualScore <= 0) return textScore;
  return textScore * MATCH_SETTINGS.textWeight + visualScore * MATCH_SETTINGS.visualWeight;
}

export function rankCandidates(
  candidates: Candidate[],
  edited: FrameHash[],
  sourceHashes: Map<string, FrameHash[]>,
  editedStart: number,
  editedEnd: number,
): (Candidate & { visualScore: number; combinedScore: number })[] {
  return candidates
    .map((candidate) => {
      const visualScore = scoreWindow(
        edited,
        sourceHashes.get(candidate.sourceRef) ?? [],
        editedStart,
        editedEnd,
        candidate.tStart,
        candidate.tEnd,
      );
      return { ...candidate, visualScore, combinedScore: combineScores(candidate.score, visualScore) };
    })
    .sort((a, b) => b.combinedScore - a.combinedScore || b.visualScore - a.visualScore || b.score - a.score);
}

export function silentRanges(
  cuts: { editedStart: number; editedEnd: number }[],
  editedDuration: number,
  minGap = MATCH_SETTINGS.silentMinGap,
): [number, number][] {
  const ordered = [...cuts].sort((a, b) => a.editedStart - b.editedStart);
  const ranges: [number, number][] = [];
  let cursor = 0;
  for (const cut of ordered) {
    if (cut.editedStart - cursor >= minGap) ranges.push([cursor, cut.editedStart]);
    cursor = Math.max(cursor, cut.editedEnd);
  }
  if (editedDuration - cursor >= minGap) ranges.push([cursor, editedDuration]);
  return ranges;
}

export function fillSilentGaps(
  cuts: VisualCut[],
  editedDuration: number,
  editedHashes: FrameHash[],
  sourceHashes: Map<string, FrameHash[]>,
): VisualCut[] {
  const extras: VisualCut[] = [];
  for (const [editedStart, editedEnd] of silentRanges(cuts, editedDuration)) {
    const ordered = [...cuts].sort((a, b) => a.editedStart - b.editedStart);
    const prev = [...ordered].reverse().find((cut) => cut.editedEnd <= editedStart);
    const next = ordered.find((cut) => cut.editedStart >= editedEnd);
    const sourceRef = prev?.sourceRef ?? next?.sourceRef;
    if (!sourceRef) continue;
    const hashes = sourceHashes.get(sourceRef) ?? [];
    if (!hashes.length) continue;
    const searchStart = Math.max(0, (prev?.out ?? hashes[0]!.t) - 2);
    const lastT = hashes[hashes.length - 1]!.t;
    const searchEnd = Math.min(lastT + MATCH_SETTINGS.frameInterval, (next?.in ?? lastT) + 2);
    const expected =
      prev && next && prev.sourceRef === next.sourceRef
        ? { start: prev.out, end: next.in }
        : prev
          ? { start: prev.out, end: prev.out + (editedEnd - editedStart) }
          : undefined;
    const match = findBestVisualWindow(
      editedHashes,
      hashes,
      editedStart,
      editedEnd,
      searchStart,
      searchEnd,
      MATCH_SETTINGS.frameInterval,
      expected,
    );
    if (!match || match.score < MATCH_SETTINGS.visualMinScore) continue;
    extras.push({
      sceneId: "gap",
      sourceRef,
      in: match.start,
      out: match.end,
      editedStart,
      editedEnd,
      text: "",
      score: match.score,
      textScore: 0,
      visualScore: match.score,
      matchMethod: "silent_gap",
      sceneSnapped: false,
      warnings: [],
    });
  }
  return [...cuts, ...extras].sort((a, b) => a.editedStart - b.editedStart || a.editedEnd - b.editedEnd);
}

export function cutsFromVisualScenes(
  editedScene: SceneIndex,
  editedHashes: FrameHash[],
  sourceHashes: Map<string, FrameHash[]>,
): VisualCut[] {
  const ranges = splitRangeByScene(0, editedScene.duration, editedScene, 0.4);
  const cuts: VisualCut[] = [];
  for (const [editedStart, editedEnd] of ranges) {
    let best: { sourceRef: string; start: number; end: number; score: number } | undefined;
    for (const [sourceRef, hashes] of sourceHashes) {
      if (!hashes.length) continue;
      const last = hashes[hashes.length - 1]!.t + MATCH_SETTINGS.frameInterval;
      const found = findBestVisualWindow(editedHashes, hashes, editedStart, editedEnd, 0, last);
      if (found && (!best || found.score > best.score)) best = { sourceRef, ...found };
    }
    if (!best || best.score < MATCH_SETTINGS.visualMinScore) continue;
    cuts.push({
      sceneId: "vis",
      sourceRef: best.sourceRef,
      in: best.start,
      out: best.end,
      editedStart,
      editedEnd,
      text: "",
      score: best.score,
      textScore: 0,
      visualScore: best.score,
      matchMethod: "visual",
      sceneSnapped: false,
      warnings: [],
    });
  }
  return cuts;
}


