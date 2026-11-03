import { DESCRIBE_SETTINGS } from "./describe-settings.ts";
import { sequenceRatio } from "./match-align.ts";
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

export type DescriptionWindow = { from: number; to: number };

export type ShotSpan = { in: number; out: number };

function sequenceId(index: number): string {
  return `seq-${String(index + 1).padStart(2, "0")}`;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function shotsFromScenes(
  index: SceneIndex,
  minShot = DESCRIBE_SETTINGS.minShot,
  range?: DescriptionWindow,
): ShotSpan[] {
  const from = range?.from ?? 0;
  const to = range?.to ?? index.duration;
  const duration = Math.max(0, Math.min(index.duration, to));
  if (!(duration > from)) return [];
  const points: number[] = [];
  for (const time of [from, ...index.boundaries.map((item) => item.time), duration].sort((a, b) => a - b)) {
    if (time < from - 1e-6 || time > duration + 1e-6) continue;
    const clipped = Math.max(from, Math.min(duration, time));
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
  return folded.length
    ? folded.map((shot) => ({ in: round3(shot.in), out: round3(shot.out) }))
    : [{ in: round3(from), out: round3(duration) }];
}

function foldShortShots(shots: ShotSpan[], minSequence = DESCRIBE_SETTINGS.minSequence): ShotSpan[] {
  if (!shots.length) return [];
  const folded: ShotSpan[] = [];
  for (const shot of shots) {
    const prev = folded.at(-1);
    if (shot.out - shot.in < minSequence && prev) {
      prev.out = shot.out;
      continue;
    }
    folded.push({ in: shot.in, out: shot.out });
  }
  if (folded.length >= 2 && folded[0]!.out - folded[0]!.in < minSequence) {
    folded[1]!.in = folded[0]!.in;
    folded.shift();
  }
  return folded.map((shot) => ({ in: round3(shot.in), out: round3(shot.out) }));
}

function capSequences(groups: ShotSpan[][], maxSequence = DESCRIBE_SETTINGS.maxSequence): ShotSpan[][] {
  const capped: ShotSpan[][] = [];
  for (const group of groups) {
    let current: ShotSpan[] = [];
    for (const shot of group) {
      const start = current[0]?.in ?? shot.in;
      if (current.length && shot.out - start > maxSequence) {
        capped.push(current);
        current = [shot];
      } else {
        current.push(shot);
      }
    }
    if (current.length) capped.push(current);
  }
  return capped;
}

function foldSkippedSequences(sequences: SequenceObservation[]): SequenceObservation[] {
  const folded: SequenceObservation[] = [];
  const skipMax = DESCRIBE_SETTINGS.maxSequence / 2;
  for (const sequence of sequences) {
    const skipped = sequence.shots.length > 0 && sequence.shots.every((shot) => shot.skip === "same-as-prev");
    const prev = folded.at(-1);
    const span = sequence.out - sequence.in;
    if (skipped && prev && span < skipMax && sequence.out - prev.in <= DESCRIBE_SETTINGS.maxSequence) {
      prev.out = sequence.out;
      prev.shots.push(...sequence.shots);
      prev.lines.push(...sequence.lines);
      continue;
    }
    folded.push({
      ...sequence,
      shots: sequence.shots.map((shot) => ({ ...shot })),
      lines: sequence.lines.map((line) => ({ ...line })),
    });
  }
  return folded.map((sequence, index) => ({ ...sequence, id: sequenceId(index) }));
}

function mergeSequences(
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

function sequencesFromShots(
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

function attachLines(sequences: SequenceObservation[], lines: SequenceLine[]): SequenceObservation[] {
  return sequences.map((sequence) => ({
    ...sequence,
    lines: lines.filter((line) => overlap(sequence.in, sequence.out, line.start, line.end) > 0),
  }));
}

function markSkips(
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
    if (prev && similarSequences(hashes, prev, next, mergeMin)) {
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
  options: { visual?: boolean; window?: DescriptionWindow } = {},
): SequenceObservation[] {
  const shots = foldShortShots(shotsFromScenes(index, DESCRIBE_SETTINGS.minShot, options.window));
  const grouped = sequencesFromShots(capSequences(mergeSequences(shots, hashes)), hashes);
  return foldSkippedSequences(markSkips(attachLines(grouped, lines), hashes, options));
}

function isSameAsPrevObservation(text: string | undefined): boolean {
  const value = (text ?? "").trim();
  return !value || value === "同前" || value === "同前。" || /^上一场/.test(value);
}

export function mergeByObservation(
  sequences: SequenceObservation[],
  minRatio = DESCRIBE_SETTINGS.observationMergeMin,
): SequenceObservation[] {
  const folded: SequenceObservation[] = [];
  for (const sequence of sequences) {
    const prev = folded.at(-1);
    const same =
      Boolean(prev) &&
      (isSameAsPrevObservation(sequence.observation) ||
        Boolean(
          prev?.observation?.trim() &&
            sequence.observation?.trim() &&
            sequenceRatio(prev.observation.trim(), sequence.observation.trim()) >= minRatio,
        ));
    if (prev && same && sequence.out - prev.in <= DESCRIBE_SETTINGS.maxSequence) {
      prev.out = sequence.out;
      prev.shots.push(...sequence.shots);
      prev.lines.push(...sequence.lines);
      if (!prev.observation?.trim() && sequence.observation?.trim() && !isSameAsPrevObservation(sequence.observation)) {
        prev.observation = sequence.observation;
      }
      continue;
    }
    folded.push({
      ...sequence,
      shots: sequence.shots.map((shot) => ({ ...shot })),
      lines: sequence.lines.map((line) => ({ ...line })),
    });
  }
  return folded.map((sequence, index) => ({ ...sequence, id: sequenceId(index) }));
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

function sampleTimes(span: Pick<SequenceObservation, "in" | "out">): number[] {
  const length = span.out - span.in;
  if (length < DESCRIBE_SETTINGS.shortSequence) return [midRange(span)];
  return [
    span.in + 0.1,
    midRange(span),
    Math.max(span.in, span.out - 0.1),
  ];
}

function similarSequences(
  hashes: FrameHash[],
  prev: SequenceObservation,
  next: SequenceObservation,
  mergeMin: number,
): boolean {
  const left = sampleTimes(prev);
  const right = sampleTimes(next);
  const n = Math.min(left.length, right.length);
  for (let i = 0; i < n; i++) {
    if (!similarCoverage(hashes, left[i]!, right[i]!, mergeMin)) return false;
  }
  return n > 0;
}

function overlap(inPoint: number, outPoint: number, start: number, end: number): number {
  return Math.max(0, Math.min(outPoint, end) - Math.max(inPoint, start));
}

function lineCoverage(sequence: SequenceObservation): number {
  const span = Math.max(0.001, sequence.out - sequence.in);
  const covered = sequence.lines.reduce((sum, line) => sum + overlap(sequence.in, sequence.out, line.start, line.end), 0);
  return covered / span;
}
