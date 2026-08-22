import { DESCRIBE_SETTINGS } from "./describe-settings.ts";
import { frameScore, nearestHash, type FrameHash } from "./match-visual.ts";
import type { SceneIndex } from "./match-scene.ts";

export type ShotObservation = {
  in: number;
  out: number;
  t: number;
  observation?: string;
  skip?: "same-as-prev" | "dense-asr";
};

export type SequenceLine = { text: string; start: number; end: number };

export type SequenceObservation = {
  id: string;
  in: number;
  out: number;
  observation?: string;
  shots: ShotObservation[];
  lines: SequenceLine[];
};

export type DescriptionDoc = {
  source_path: string;
  duration: number;
  summary: string;
  sequences: SequenceObservation[];
};

export type ShotSpan = { in: number; out: number };

export function sequenceId(index: number): string {
  return `seq-${String(index + 1).padStart(2, "0")}`;
}

export function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function shotsFromScenes(index: SceneIndex, minShot = DESCRIBE_SETTINGS.minShot): ShotSpan[] {
  const duration = Math.max(0, index.duration);
  if (!(duration > 0)) return [];
  const points: number[] = [];
  for (const time of [0, ...index.boundaries.map((item) => item.time), duration].sort((a, b) => a - b)) {
    const clipped = Math.max(0, Math.min(duration, time));
    const last = points.at(-1);
    if (last == null || clipped - last > 1e-6) points.push(clipped);
  }
  const raw: ShotSpan[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    raw.push({ in: points[i]!, out: points[i + 1]! });
  }
  const folded: ShotSpan[] = [];
  for (const shot of raw) {
    const prev = folded.at(-1);
    if (shot.out - shot.in < minShot && prev) {
      prev.out = shot.out;
    } else if (prev && prev.out - prev.in < minShot) {
      prev.out = shot.out;
    } else {
      folded.push({ in: shot.in, out: shot.out });
    }
  }
  return folded.length ? folded.map((shot) => ({ in: round3(shot.in), out: round3(shot.out) })) : [{ in: 0, out: round3(duration) }];
}

export function mergeSequences(
  shots: ShotSpan[],
  hashes: FrameHash[],
  mergeMin = DESCRIBE_SETTINGS.sequenceMergeMin,
): ShotSpan[][] {
  const groups: ShotSpan[][] = [];
  for (const shot of shots) {
    const prevGroup = groups.at(-1);
    const prev = prevGroup?.at(-1);
    if (prev && prevGroup && similarCoverage(hashes, mid(prev), mid(shot), mergeMin)) {
      prevGroup.push(shot);
    } else {
      groups.push([shot]);
    }
  }
  return groups;
}

export function sequencesFromShots(
  groups: ShotSpan[][],
  hashes: FrameHash[],
): SequenceObservation[] {
  return groups.map((shots, index) => {
    const first = shots[0]!;
    const last = shots.at(-1)!;
    return {
      id: sequenceId(index),
      in: first.in,
      out: last.out,
      shots: shots.map((shot) => ({
        in: shot.in,
        out: shot.out,
        t: round3(hashTime(hashes, mid(shot))),
      })),
      lines: [],
    };
  });
}

export function attachLines(sequences: SequenceObservation[], lines: SequenceLine[]): SequenceObservation[] {
  return sequences.map((sequence) => ({
    ...sequence,
    lines: lines.filter((line) => overlap(sequence.in, sequence.out, line.start, line.end) > 0),
  }));
}

export function markSkips(
  sequences: SequenceObservation[],
  hashes: FrameHash[],
  options: { visual?: boolean; mergeMin?: number; denseAsrRatio?: number } = {},
): SequenceObservation[] {
  const mergeMin = options.mergeMin ?? DESCRIBE_SETTINGS.sequenceMergeMin;
  const denseRatio = options.denseAsrRatio ?? DESCRIBE_SETTINGS.denseAsrRatio;
  return sequences.map((sequence, index) => {
    const prev = sequences[index - 1];
    if (!options.visual && lineCoverage(sequence) >= denseRatio) {
      return skipAll(sequence, "dense-asr");
    }
    const shots = sequence.shots.map((shot, shotIndex) => {
      const prevShot = sequence.shots[shotIndex - 1];
      if (prevShot && similarCoverage(hashes, prevShot.t, shot.t, mergeMin)) {
        return { ...shot, skip: "same-as-prev" as const };
      }
      return shot;
    });
    const next = { ...sequence, shots };
    if (prev && similarCoverage(hashes, midRange(prev), midRange(next), mergeMin)) {
      return skipAll(next, "same-as-prev");
    }
    return next;
  });
}

export function sequenceNeedsVision(sequence: SequenceObservation): boolean {
  return sequence.shots.some((shot) => !shot.skip);
}

export function pickFrameTimes(
  sequence: SequenceObservation,
  maxFrames = DESCRIBE_SETTINGS.maxFramesPerSequence,
  shortLimit = DESCRIBE_SETTINGS.shortSequence,
): number[] {
  if (!sequenceNeedsVision(sequence)) return [];
  const span = Math.max(0, sequence.out - sequence.in);
  if (!(span > 0)) return [];
  if (span < shortLimit || maxFrames <= 1) return [round3(midRange(sequence))];
  const times = [sequence.in + 0.1, midRange(sequence), sequence.out - 0.1]
    .map((time) => round3(Math.min(sequence.out - 0.001, Math.max(sequence.in, time))));
  const unique: number[] = [];
  for (const time of times) {
    const last = unique.at(-1);
    if (last == null || Math.abs(time - last) > 0.05) unique.push(time);
  }
  return unique.slice(0, maxFrames);
}

export function buildSequences(
  index: SceneIndex,
  hashes: FrameHash[],
  lines: SequenceLine[] = [],
  options: { visual?: boolean } = {},
): SequenceObservation[] {
  const shots = shotsFromScenes(index);
  const grouped = sequencesFromShots(mergeSequences(shots, hashes), hashes);
  return markSkips(attachLines(grouped, lines), hashes, options);
}

export function descriptionIsReady(doc: DescriptionDoc | null | undefined): boolean {
  if (!doc || !Array.isArray(doc.sequences) || !doc.sequences.length) return false;
  return doc.sequences.every((sequence) => sequence.out > sequence.in && sequence.shots.length > 0);
}

function skipAll(sequence: SequenceObservation, skip: ShotObservation["skip"]): SequenceObservation {
  return { ...sequence, shots: sequence.shots.map((shot) => ({ ...shot, skip })) };
}

function mid(span: ShotSpan): number {
  return (span.in + span.out) / 2;
}

function midRange(sequence: Pick<SequenceObservation, "in" | "out">): number {
  return (sequence.in + sequence.out) / 2;
}

function hashTime(hashes: FrameHash[], time: number): number {
  return nearestHash(hashes, time)?.t ?? time;
}

function similarCoverage(hashes: FrameHash[], a: number, b: number, mergeMin: number): boolean {
  const left = nearestHash(hashes, a);
  const right = nearestHash(hashes, b);
  if (!left || !right) return false;
  return frameScore(left, right) >= mergeMin;
}

function overlap(inPoint: number, outPoint: number, start: number, end: number): number {
  return Math.max(0, Math.min(outPoint, end) - Math.max(inPoint, start));
}

function lineCoverage(sequence: SequenceObservation): number {
  const span = Math.max(0.001, sequence.out - sequence.in);
  const covered = sequence.lines.reduce((sum, line) => sum + overlap(sequence.in, sequence.out, line.start, line.end), 0);
  return covered / span;
}
