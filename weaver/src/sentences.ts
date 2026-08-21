import type { SpeechRange } from "./probe.ts";
import { speechRanges } from "./probe.ts";

export type TranscriptWord = { token: string; start: number; end: number };
export type TranscriptSentence = { text: string; start: number; end: number; words: TranscriptWord[] };
export type TranscriptDoc = {
  source_path: string;
  duration: number;
  full_text: string;
  language: string;
  sentences: TranscriptSentence[];
};

const NON_CORE = /[\s，。！？,!?;；、·…"'“”‘’（）()[\]【】<>《》]/u;
const SENTENCE_SPLIT = /(?<=[。！？!?;；])\s*/u;

export function isCoreChar(ch: string): boolean {
  return Boolean(ch) && !NON_CORE.test(ch);
}

export function coreText(text: string): string {
  return [...text].filter(isCoreChar).map((ch) => ch.toLowerCase()).join("");
}

export function splitSentences(text: string): string[] {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (!trimmed) return [];
  const parts = trimmed.split(SENTENCE_SPLIT).map((item) => item.trim()).filter(Boolean);
  return parts.length ? parts : [trimmed];
}

export function synthesizeWords(text: string, start: number, end: number): TranscriptWord[] {
  const chars = [...text].filter(isCoreChar);
  if (!chars.length) return [];
  const span = Math.max(0, end - start);
  const step = span / chars.length;
  return chars.map((token, index) => {
    const from = start + index * step;
    return { token: token.toLowerCase(), start: from, end: from + step };
  });
}

type SpeechTimeline = { duration: number; islands: SpeechRange[] };

function speechTimeline(islands: SpeechRange[]): SpeechTimeline {
  const usable = islands.filter((item) => item.end > item.start);
  const duration = usable.reduce((sum, item) => sum + (item.end - item.start), 0);
  return { duration, islands: usable };
}

function atSpeech(timeline: SpeechTimeline, speechTime: number): number {
  if (!timeline.islands.length) return 0;
  let cursor = 0;
  const target = Math.max(0, Math.min(timeline.duration, speechTime));
  for (const island of timeline.islands) {
    const span = island.end - island.start;
    if (target <= cursor + span) return island.start + (target - cursor);
    cursor += span;
  }
  return timeline.islands[timeline.islands.length - 1]!.end;
}

export function stampSentences(
  text: string,
  duration: number,
  speech: SpeechRange[] = [{ start: 0, end: Math.max(0, duration) }],
): TranscriptSentence[] {
  const pieces = splitSentences(text);
  if (!pieces.length) return [];
  const timeline = speechTimeline(speech.length ? speech : [{ start: 0, end: Math.max(0, duration) }]);
  const speechDur = timeline.duration > 0 ? timeline.duration : Math.max(0, duration);
  const weights = pieces.map((piece) => Math.max(1, coreText(piece).length));
  const totalW = weights.reduce((sum, item) => sum + item, 0);
  let cursor = 0;
  return pieces.map((piece, index) => {
    const span = (weights[index]! / totalW) * speechDur;
    const start = atSpeech(timeline, cursor);
    const end = atSpeech(timeline, cursor + span);
    cursor += span;
    const from = Math.max(0, start);
    const to = Math.max(from, end);
    return { text: piece, start: from, end: to, words: synthesizeWords(piece, from, to) };
  });
}

export function transcriptIsStamped(transcript: TranscriptDoc): boolean {
  if (!transcript.sentences.length) return false;
  if (transcript.sentences.some((sentence) => sentence.words.length > 0)) return true;
  return transcript.sentences.length > 1 && transcript.sentences.some((sentence) => sentence.end > sentence.start);
}

export function stampTranscript(
  transcript: TranscriptDoc,
  options: { speech?: SpeechRange[]; duration?: number; media?: string } = {},
): TranscriptDoc {
  if (transcriptIsStamped(transcript)) return transcript;
  const duration = options.duration && options.duration > 0 ? options.duration : transcript.duration;
  const speech =
    options.speech ??
    (options.media ? speechRanges(options.media, duration) : [{ start: 0, end: Math.max(0, duration) }]);
  return {
    ...transcript,
    duration,
    sentences: stampSentences(transcript.full_text, duration, speech),
  };
}
