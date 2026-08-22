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
    const alreadySplit = cut.matchMethod === "visual" || cut.matchMethod === "silent_gap";
    const pieces = alreadySplit
      ? ([[cut.editedStart, cut.editedEnd]] as [number, number][])
      : splitRangeByScene(cut.editedStart, cut.editedEnd, editedScene);
    const sentenceDur = Math.max(0.001, cut.editedEnd - cut.editedStart);
    const sourceDur = Math.max(0.001, cut.out - cut.in);
    for (const [editedStart, editedEnd] of pieces) {
      const relStart = Math.max(0, (editedStart - cut.editedStart) / sentenceDur);
      const relEnd = Math.min(1, (editedEnd - cut.editedStart) / sentenceDur);
      const originalIn = cut.in + sourceDur * relStart;
      const originalOut = cut.in + sourceDur * relEnd;
      const sourceScene = sourceScenes.get(cut.sourceRef);
      const snapped = snapWindow(originalIn, originalOut, sourceScene);
      next.push({
        ...cut,
        editedStart,
        editedEnd,
        in: snapped.in,
        out: snapped.out,
        originalIn,
        originalOut,
        sceneSnapped: snapped.snapped || cut.sceneSnapped,
        warnings: [...cut.warnings],
      });
    }
  }
  return next;
}

/** 整窗吸附：只推 in，时长跟参考走。两端各自贴边界会把窗压成 0.05s。 */
export function snapWindow(
  start: number,
  end: number,
  index: SceneIndex | undefined,
  window = MATCH_SETTINGS.snapWindow,
  minPiece = MATCH_SETTINGS.minPiece,
): { in: number; out: number; snapped: boolean } {
  const duration = Math.max(0, end - start);
  if (!(duration > 0)) return { in: start, out: end, snapped: false };
  const snappedIn = snapToSceneBoundary(start, index, window);
  let nextIn = snappedIn.snapped ? snappedIn.time : start;
  let nextOut = nextIn + duration;
  const limit = index?.duration;
  if (limit != null && nextOut > limit) {
    nextOut = limit;
    nextIn = Math.max(0, nextOut - duration);
  }
  if (nextOut - nextIn < minPiece && duration >= minPiece) {
    return { in: start, out: end, snapped: false };
  }
  return { in: nextIn, out: Math.max(nextIn, nextOut), snapped: snappedIn.snapped };
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
  const minPiece = MATCH_SETTINGS.minPiece;
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
      if (boundary >= prev.in + minPiece) prev.out = boundary;
      if (boundary <= next.out - minPiece) next.in = Math.max(0, boundary);
      warn(prev, "adjacent_gap_merged");
      warn(next, "adjacent_gap_merged");
    }
    if (prev.out - next.in > MATCH_SETTINGS.maxOverlap) {
      if (prev.originalOut > 0 && prev.out > prev.originalOut) prev.out = Math.max(prev.originalOut, next.in);
      if (prev.out - next.in > MATCH_SETTINGS.maxOverlap && next.originalIn > 0 && next.in < next.originalIn) {
        next.in = Math.min(next.originalIn, prev.out);
      }
      if (prev.out - next.in > MATCH_SETTINGS.maxOverlap) {
        const span = next.out - prev.in;
        if (span >= minPiece * 2) {
          const boundary = (prev.out + next.in) / 2;
          prev.out = Math.max(prev.in + minPiece, Math.min(boundary, next.out - minPiece));
          next.in = Math.min(next.out - minPiece, Math.max(prev.out, boundary));
        }
      }
      warn(prev, "overlap_fixed");
      warn(next, "overlap_fixed");
    }
  }
  return ordered.filter((cut) => cut.out - cut.in > 1e-6);
}

export function enforceDuration(cuts: TimedCut[], sourceDurations: Map<string, number>): TimedCut[] {
  const minPiece = MATCH_SETTINGS.minPiece;
  const ratioMin = MATCH_SETTINGS.durationRatioMin;
  return cuts.map((cut) => {
    const sourceSpan = cut.out - cut.in;
    const editedSpan = Math.max(0, cut.editedEnd - cut.editedStart);
    if (editedSpan < minPiece || sourceSpan >= Math.max(minPiece, editedSpan * ratioMin)) return cut;
    const limit = sourceDurations.get(cut.sourceRef);
    let nextIn = cut.in;
    let nextOut = cut.in + editedSpan;
    if (limit != null && nextOut > limit) {
      nextOut = limit;
      nextIn = Math.max(0, nextOut - editedSpan);
    }
    if (nextOut - nextIn < minPiece) return cut;
    const next = { ...cut, in: nextIn, out: nextOut, warnings: [...cut.warnings] };
    warn(next, "duration_restored");
    return next;
  });
}

export function mergeAdjacentCuts(cuts: TimedCut[]): TimedCut[] {
  const gap = MATCH_SETTINGS.sceneMinGap;
  const ordered = [...cuts].sort((a, b) => a.editedStart - b.editedStart || a.editedEnd - b.editedEnd);
  const merged: TimedCut[] = [];
  for (const cut of ordered) {
    const prev = merged.at(-1);
    const sourceGap = prev ? cut.in - prev.out : Infinity;
    const editedGap = prev ? cut.editedStart - prev.editedEnd : Infinity;
    if (
      prev &&
      prev.sourceRef === cut.sourceRef &&
      sourceGap >= -MATCH_SETTINGS.maxOverlap &&
      sourceGap <= gap &&
      editedGap <= gap
    ) {
      prev.out = Math.max(prev.out, cut.out);
      prev.editedEnd = Math.max(prev.editedEnd, cut.editedEnd);
      prev.originalOut = Math.max(prev.originalOut, cut.originalOut);
      for (const message of cut.warnings) warn(prev, message);
      warn(prev, "adjacent_merged");
      continue;
    }
    merged.push({ ...cut, warnings: [...cut.warnings] });
  }
  return merged;
}

export function dropCrumbs(cuts: TimedCut[]): TimedCut[] {
  const minPiece = MATCH_SETTINGS.minPiece;
  return cuts.filter((cut) => {
    const sourceSpan = cut.out - cut.in;
    const editedSpan = cut.editedEnd - cut.editedStart;
    if (sourceSpan <= 0) return false;
    if (sourceSpan < minPiece && editedSpan >= minPiece) return false;
    return true;
  });
}

function warn(cut: TimedCut, message: string): void {
  if (!cut.warnings.includes(message)) cut.warnings.push(message);
}
