import { ffmpegLog, probeDuration, requireBin } from "./probe.ts";
import { MATCH_SETTINGS } from "./match-settings.ts";

export type SceneBoundary = { time: number; score: number };

export type SceneIndex = {
  duration: number;
  boundaries: SceneBoundary[];
};

const PTS = /pts_time:([0-9]+(?:\.[0-9]+)?)/;
const SCORE = /lavfi\.scene_score=([0-9]+(?:\.[0-9]+)?)/;

export function parseSceneLog(output: string, minGap = MATCH_SETTINGS.sceneMinGap): SceneBoundary[] {
  const boundaries: SceneBoundary[] = [];
  let pending: number | null = null;
  for (const line of output.split(/\r?\n/)) {
    const time = PTS.exec(line);
    if (time) pending = Number(time[1]);
    const score = SCORE.exec(line);
    if (score && pending != null) {
      const value = Number(score[1]);
      const last = boundaries.at(-1);
      if (last && pending - last.time < minGap) {
        if (value > last.score) boundaries[boundaries.length - 1] = { time: pending, score: value };
      } else {
        boundaries.push({ time: pending, score: value });
      }
      pending = null;
    }
  }
  return boundaries;
}

export function detectScenes(file: string, duration?: number): SceneIndex {
  let total = duration && duration > 0 ? duration : 0;
  try {
    if (!(total > 0)) total = probeDuration(file);
    requireBin("ffmpeg");
    const log = ffmpegLog([
      "-hide_banner",
      "-nostats",
      "-i",
      file,
      "-vf",
      `select='gt(scene,${MATCH_SETTINGS.sceneThreshold})',metadata=print`,
      "-an",
      "-f",
      "null",
      "-",
    ]);
    return { duration: total, boundaries: parseSceneLog(log) };
  } catch {
    return { duration: total, boundaries: [] };
  }
}

export function snapToSceneBoundary(
  time: number,
  index: SceneIndex | undefined,
  window = MATCH_SETTINGS.snapWindow,
): { time: number; snapped: boolean } {
  if (!index) return { time, snapped: false };
  const points = [0, index.duration, ...index.boundaries.map((item) => item.time)]
    .map((point) => Math.max(0, Math.min(index.duration, point)))
    .sort((a, b) => a - b);
  const nearest = points.reduce((best, point) => (Math.abs(point - time) < Math.abs(best - time) ? point : best), points[0] ?? time);
  if (Math.abs(nearest - time) <= window) return { time: nearest, snapped: true };
  return { time, snapped: false };
}

export function splitRangeByScene(
  start: number,
  end: number,
  index: SceneIndex | undefined,
  minPiece = MATCH_SETTINGS.minPiece,
): [number, number][] {
  const from = Math.max(0, start);
  const to = Math.max(from, end);
  if (!index || to - from <= minPiece) return [[from, to]];
  const inner = index.boundaries
    .map((item) => item.time)
    .filter((time) => time >= from + minPiece && time <= to - minPiece)
    .sort((a, b) => a - b);
  if (!inner.length) return [[from, to]];
  const points = [from, ...inner, to];
  const ranges: [number, number][] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const left = points[i]!;
    const right = points[i + 1]!;
    if (right - left >= minPiece) ranges.push([left, right]);
  }
  return ranges.length ? ranges : [[from, to]];
}

export type TimedCut = {
  sourceRef: string;
  in: number;
  out: number;
  editedStart: number;
  editedEnd: number;
  originalIn: number;
  originalOut: number;
  sceneSnapped: boolean;
  warnings: string[];
  text: string;
  score: number;
  textScore: number;
  visualScore: number;
  matchMethod: "text" | "visual" | "visual_scene" | "silent_gap";
};

export function splitAndSnapCuts(
  cuts: TimedCut[],
  editedScene: SceneIndex | undefined,
  sourceScenes: Map<string, SceneIndex>,
): TimedCut[] {
  const next: TimedCut[] = [];
  for (const cut of cuts) {
    const pieces = splitRangeByScene(cut.editedStart, cut.editedEnd, editedScene);
    const sentenceDur = Math.max(0.001, cut.editedEnd - cut.editedStart);
    const sourceDur = Math.max(0.001, cut.out - cut.in);
    for (const [editedStart, editedEnd] of pieces) {
      const relStart = Math.max(0, (editedStart - cut.editedStart) / sentenceDur);
      const relEnd = Math.min(1, (editedEnd - cut.editedStart) / sentenceDur);
      const originalIn = cut.in + sourceDur * relStart;
      const originalOut = cut.in + sourceDur * relEnd;
      const sourceScene = sourceScenes.get(cut.sourceRef);
      const snappedIn = snapToSceneBoundary(originalIn, sourceScene);
      const snappedOut = snapToSceneBoundary(originalOut, sourceScene);
      const valid = snappedOut.time > snappedIn.time;
      next.push({
        ...cut,
        editedStart,
        editedEnd,
        in: valid ? snappedIn.time : originalIn,
        out: valid ? snappedOut.time : originalOut,
        originalIn,
        originalOut,
        sceneSnapped: valid && (snappedIn.snapped || snappedOut.snapped || cut.sceneSnapped),
        warnings: [...cut.warnings],
      });
    }
  }
  return next;
}

export function applyPadding(cuts: TimedCut[], sourceDurations: Map<string, number>): TimedCut[] {
  const ordered = [...cuts].sort((a, b) => a.editedStart - b.editedStart || a.editedEnd - b.editedEnd);
  const before = MATCH_SETTINGS.paddingBefore;
  const after = MATCH_SETTINGS.paddingAfter;
  return ordered.map((cut, index) => {
    const extendBefore =
      index === 0 ? before : Math.min(before, Math.max(0, cut.editedStart - ordered[index - 1]!.editedEnd) / 2);
    const extendAfter =
      index === ordered.length - 1
        ? after
        : Math.min(after, Math.max(0, ordered[index + 1]!.editedStart - cut.editedEnd) / 2);
    const duration = sourceDurations.get(cut.sourceRef);
    const nextIn = Math.max(0, cut.in - extendBefore);
    const nextOut = duration != null ? Math.min(duration, cut.out + extendAfter) : cut.out + extendAfter;
    return { ...cut, in: nextIn, out: Math.max(nextIn, nextOut) };
  });
}

export function stabilizeCuts(cuts: TimedCut[]): TimedCut[] {
  const ordered = [...cuts].sort((a, b) => a.editedStart - b.editedStart || a.editedEnd - b.editedEnd);
  for (let i = 0; i < ordered.length - 1; i++) {
    const prev = ordered[i]!;
    const next = ordered[i + 1]!;
    if (prev.sourceRef !== next.sourceRef) continue;
    const sourceGap = next.in - prev.out;
    const editedGap = Math.max(0, next.editedStart - prev.editedEnd);
    if (sourceGap < -0.08) {
      warn(prev, "repeat_risk");
      warn(next, "repeat_risk");
    }
    if (sourceGap - editedGap > MATCH_SETTINGS.maxJump) {
      warn(prev, "jump_risk");
      warn(next, "jump_risk");
    }
    if (sourceGap >= 0 && sourceGap <= MATCH_SETTINGS.mergeGap) {
      const boundary = (prev.out + next.in) / 2;
      if (boundary >= prev.in + 0.05) prev.out = boundary;
      if (boundary <= next.out - 0.05) next.in = Math.max(0, boundary);
      warn(prev, "adjacent_gap_merged");
      warn(next, "adjacent_gap_merged");
    }
    if (prev.out - next.in > MATCH_SETTINGS.maxOverlap) {
      if (prev.originalOut > 0 && prev.out > prev.originalOut) prev.out = Math.max(prev.originalOut, next.in);
      if (prev.out - next.in > MATCH_SETTINGS.maxOverlap && next.originalIn > 0 && next.in < next.originalIn) {
        next.in = Math.min(next.originalIn, prev.out);
      }
      if (prev.out - next.in > MATCH_SETTINGS.maxOverlap) {
        const boundary = (prev.out + next.in) / 2;
        prev.out = Math.max(prev.in + 0.05, boundary);
        next.in = Math.min(next.out - 0.05, Math.max(0, boundary));
      }
      warn(prev, "overlap_fixed");
      warn(next, "overlap_fixed");
    }
  }
  return ordered.filter((cut) => cut.out > cut.in);
}

function warn(cut: TimedCut, message: string): void {
  if (!cut.warnings.includes(message)) cut.warnings.push(message);
}
