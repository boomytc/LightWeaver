import { coreText, isCoreChar, synthesizeWords, type TranscriptDoc, type TranscriptWord } from "./sentences.ts";
import { MATCH_SETTINGS, type MatchSettings } from "./match-settings.ts";

export type MatchBlock = { a: number; b: number; size: number };

export type CoreWord = { char: string; start: number; end: number; sourceRef: string };

export type Candidate = {
  sourceRef: string;
  charStart: number;
  charEnd: number;
  tStart: number;
  tEnd: number;
  score: number;
};

function longestMatch(
  a: string,
  alo: number,
  ahi: number,
  b: string,
  blo: number,
  bhi: number,
  b2j: Map<string, number[]>,
): MatchBlock {
  let bestA = alo;
  let bestB = blo;
  let bestSize = 0;
  let j2len = new Map<number, number>();
  for (let i = alo; i < ahi; i++) {
    const next = new Map<number, number>();
    for (const j of b2j.get(a[i]!) ?? []) {
      if (j < blo) continue;
      if (j >= bhi) break;
      const k = (j2len.get(j - 1) ?? 0) + 1;
      next.set(j, k);
      if (k > bestSize) {
        bestA = i - k + 1;
        bestB = j - k + 1;
        bestSize = k;
      }
    }
    j2len = next;
  }
  return { a: bestA, b: bestB, size: bestSize };
}

export function matchingBlocks(a: string, b: string): MatchBlock[] {
  const b2j = new Map<string, number[]>();
  for (let i = 0; i < b.length; i++) {
    const ch = b[i]!;
    const list = b2j.get(ch);
    if (list) list.push(i);
    else b2j.set(ch, [i]);
  }
  const found: MatchBlock[] = [];
  const stack: [number, number, number, number][] = [[0, a.length, 0, b.length]];
  while (stack.length) {
    const [alo, ahi, blo, bhi] = stack.pop()!;
    const block = longestMatch(a, alo, ahi, b, blo, bhi, b2j);
    if (block.size <= 0) continue;
    found.push(block);
    if (alo < block.a && blo < block.b) stack.push([alo, block.a, blo, block.b]);
    const aNext = block.a + block.size;
    const bNext = block.b + block.size;
    if (aNext < ahi && bNext < bhi) stack.push([aNext, ahi, bNext, bhi]);
  }
  found.sort((left, right) => left.a - right.a || left.b - right.b);
  const merged: MatchBlock[] = [];
  for (const block of found) {
    const last = merged.at(-1);
    if (last && last.a + last.size === block.a && last.b + last.size === block.b) last.size += block.size;
    else merged.push({ ...block });
  }
  return merged;
}

export function sequenceRatio(a: string, b: string): number {
  if (!a.length && !b.length) return 1;
  if (!a.length || !b.length) return 0;
  const matches = matchingBlocks(a, b).reduce((sum, block) => sum + block.size, 0);
  return (2 * matches) / (a.length + b.length);
}

function sentenceWords(sentence: TranscriptDoc["sentences"][number]): TranscriptWord[] {
  return sentence.words.length ? sentence.words : synthesizeWords(sentence.text, sentence.start, sentence.end);
}

export function buildSourceCorpus(
  sources: { ref: string; transcript: TranscriptDoc }[],
): { text: string; mapping: CoreWord[] } {
  const mapping: CoreWord[] = [];
  const chars: string[] = [];
  for (const source of [...sources].sort((a, b) => a.ref.localeCompare(b.ref))) {
    for (const sentence of source.transcript.sentences) {
      for (const word of sentenceWords(sentence)) {
        for (const ch of word.token) {
          if (!isCoreChar(ch)) continue;
          chars.push(ch.toLowerCase());
          mapping.push({
            char: ch.toLowerCase(),
            start: word.start,
            end: word.end,
            sourceRef: source.ref,
          });
        }
      }
    }
  }
  return { text: chars.join(""), mapping };
}

export function alignSentence(
  sentenceText: string,
  corpusText: string,
  mapping: CoreWord[],
  settings: MatchSettings = MATCH_SETTINGS,
): Candidate[] {
  if (sentenceText.length < settings.minSentenceChars || !corpusText) return [];
  const blocks = matchingBlocks(sentenceText, corpusText)
    .filter((block) => block.size > 0)
    .sort((a, b) => b.size - a.size);
  const candidates: Candidate[] = [];
  const seen = new Set<string>();
  for (const block of blocks.slice(0, Math.max(settings.topK * 3, 3))) {
    let charStart = Math.max(0, block.b - block.a);
    let charEnd = Math.min(mapping.length, charStart + sentenceText.length);
    if (charEnd <= charStart) continue;
    let startEntry = mapping[charStart];
    let endEntry = mapping[charEnd - 1];
    if (!startEntry || !endEntry) continue;
    if (startEntry.sourceRef !== endEntry.sourceRef) {
      const anchor = mapping[block.b];
      if (!anchor) continue;
      const indices: number[] = [];
      for (let i = charStart; i < charEnd; i++) {
        if (mapping[i]?.sourceRef === anchor.sourceRef) indices.push(i);
      }
      if (!indices.length) continue;
      charStart = indices[0]!;
      charEnd = indices[indices.length - 1]! + 1;
      startEntry = mapping[charStart];
      endEntry = mapping[charEnd - 1];
      if (!startEntry || !endEntry) continue;
    }
    const score = sequenceRatio(sentenceText, corpusText.slice(charStart, charEnd));
    if (score < settings.fuzzyThreshold) continue;
    const key = `${startEntry.sourceRef}:${charStart}`;
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push({
      sourceRef: startEntry.sourceRef,
      charStart,
      charEnd,
      tStart: Math.max(0, startEntry.start - settings.timePadding),
      tEnd: endEntry.end + settings.timePadding,
      score,
    });
    if (candidates.length >= settings.topK) break;
  }
  return candidates.sort((a, b) => b.score - a.score);
}

export function alignEditedToSources(
  edited: TranscriptDoc,
  sources: { ref: string; transcript: TranscriptDoc }[],
  settings: MatchSettings = MATCH_SETTINGS,
): { text: string; start: number; end: number; candidates: Candidate[] }[] {
  const { text, mapping } = buildSourceCorpus(sources);
  if (!text) return [];
  const rows: { text: string; start: number; end: number; candidates: Candidate[] }[] = [];
  for (const sentence of edited.sentences) {
    const core = coreText(sentence.text);
    if (core.length < settings.minSentenceChars) continue;
    rows.push({
      text: sentence.text,
      start: sentence.start,
      end: sentence.end,
      candidates: alignSentence(core, text, mapping, settings),
    });
  }
  return rows;
}

export function pickCandidate(candidates: Candidate[]): Candidate | undefined {
  if (!candidates.length) return undefined;
  return [...candidates].sort((a, b) => b.score - a.score || a.tStart - b.tStart)[0];
}
