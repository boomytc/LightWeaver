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

export function isCoreChar(ch: string): boolean {
  return Boolean(ch) && !NON_CORE.test(ch);
}

export function coreText(text: string): string {
  return [...text].filter(isCoreChar).map((ch) => ch.toLowerCase()).join("");
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
