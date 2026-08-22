import { sequenceRatio } from "./match-align.ts";
import { ASR_SETTINGS } from "./asr-settings.ts";
import type { AsrResult, AsrSentence, AsrWord } from "./asr.ts";

export type AsrWindow = { start: number; end: number };

export type AsrWindowResult = AsrWindow & { result: AsrResult };

export type TruncationHint = {
  text: string;
  truncated?: boolean;
  log?: string;
};

export function windowsFor(
  duration: number,
  chunk = ASR_SETTINGS.chunkSeconds,
  overlap = ASR_SETTINGS.overlapSeconds,
): AsrWindow[] {
  if (!(duration > 0)) return [];
  if (duration <= chunk) return [{ start: 0, end: duration }];
  const step = Math.max(0.5, chunk - overlap);
  const windows: AsrWindow[] = [];
  let start = 0;
  while (start < duration - 1e-6) {
    const end = Math.min(duration, start + chunk);
    windows.push({ start, end });
    if (end >= duration - 1e-9) break;
    start += step;
  }
  return windows;
}

export function isTruncated(result: TruncationHint, duration: number, sparse = true): boolean {
  if (result.truncated) return true;
  if (result.log && /OutputTruncated/i.test(result.log)) return true;
  if (!sparse) return false;
  const text = result.text.trim();
  if (duration >= ASR_SETTINGS.chunkSeconds / 2 && text.length < duration * ASR_SETTINGS.minCharsPerSecond) {
    return true;
  }
  return false;
}

export function stripOverlap(prev: string, next: string, minRatio = ASR_SETTINGS.overlapRatio): string {
  const a = prev.trim();
  const b = next.trim();
  if (!a || !b) return b;
  const max = Math.min(a.length, b.length, 80);
  for (let n = max; n >= 2; n--) {
    if (sequenceRatio(a.slice(-n), b.slice(0, n)) >= minRatio) return b.slice(n).trim();
  }
  return b;
}

export function stitchAsrResults(chunks: AsrWindowResult[]): AsrResult {
  const ordered = [...chunks].sort((a, b) => a.start - b.start || a.end - b.end);
  let text = "";
  let language = "";
  const sentences: AsrSentence[] = [];
  for (const chunk of ordered) {
    const piece = offsetResult(chunk.result, chunk.start);
    language = language || piece.language;
    const nextText = stripOverlap(text, piece.text);
    text = joinTexts(text, nextText);
    const uniqueFrom = sentences.at(-1)?.end ?? chunk.start;
    for (const sentence of piece.sentences ?? []) {
      if (sentence.end <= uniqueFrom + 0.05 && sentences.length) continue;
      sentences.push(sentence);
    }
  }
  const last = ordered.at(-1);
  return {
    text: text.trim(),
    language,
    seconds: last?.end ?? 0,
    ...(sentences.length ? { sentences } : {}),
  };
}

function offsetResult(result: AsrResult, start: number): AsrResult {
  return {
    text: result.text.trim(),
    language: result.language,
    seconds: result.seconds,
    sentences: result.sentences?.map((sentence) => ({
      text: sentence.text,
      start: sentence.start + start,
      end: sentence.end + start,
      ...(sentence.words?.length ? { words: sentence.words.map((word) => offsetWord(word, start)) } : {}),
    })),
  };
}

function offsetWord(word: AsrWord, start: number): AsrWord {
  return { token: word.token, start: word.start + start, end: word.end + start };
}

function joinTexts(a: string, b: string): string {
  if (!a) return b;
  if (!b) return a;
  if (/[A-Za-z0-9]$/.test(a) && /^[A-Za-z0-9]/.test(b)) return `${a} ${b}`;
  return `${a}${b}`;
}
