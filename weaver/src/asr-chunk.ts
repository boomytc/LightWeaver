import type { AsrResult, AsrSentence, AsrWord } from "./adapters/providers.ts";

export function stitchAsrResults(input: {
  left: AsrResult;
  right: AsrResult;
  splitUs: number;
  durationUs: number;
}): AsrResult {
  const chunks = [
    { start: 0, result: input.left },
    { start: input.splitUs / 1e6, result: input.right },
  ];
  let text = "";
  let language = "";
  const sentences: AsrSentence[] = [];
  for (const chunk of chunks) {
    const piece = offsetResult(chunk.result, chunk.start);
    language = language || piece.language;
    text = joinTexts(text, piece.text);
    sentences.push(...(piece.sentences ?? []));
  }
  return {
    text: text.trim(),
    language,
    seconds: input.durationUs / 1e6,
    timingQuality: chunks.every((c) => c.result.timingQuality === "native")
      ? "native"
      : "estimated",
    ...(input.left.vad
      ? {
          vad: {
            backend: input.left.vad.backend,
            version: input.left.vad.version,
            ranges: chunks.flatMap(
              (c) =>
                c.result.vad?.ranges.map((r) => ({
                  start: r.start + c.start,
                  end: r.end + c.start,
                })) || [],
            ),
          },
        }
      : {}),
    ...(sentences.length ? { sentences } : {}),
  };
}

function offsetResult(result: AsrResult, start: number): AsrResult {
  return {
    ...result,
    text: result.text.trim(),
    language: result.language,
    seconds: result.seconds,
    sentences: result.sentences?.map((sentence) => ({
      text: sentence.text,
      start: sentence.start + start,
      end: sentence.end + start,
      ...(sentence.words?.length
        ? { words: sentence.words.map((word) => offsetWord(word, start)) }
        : {}),
    })),
  };
}

function offsetWord(word: AsrWord, start: number): AsrWord {
  return {
    token: word.token,
    start: word.start + start,
    end: word.end + start,
  };
}

function joinTexts(a: string, b: string): string {
  if (!a) return b;
  if (!b) return a;
  if (/[A-Za-z0-9]$/.test(a) && /^[A-Za-z0-9]/.test(b)) return `${a} ${b}`;
  return `${a}${b}`;
}
