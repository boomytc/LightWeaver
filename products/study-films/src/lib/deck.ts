export type DeckPoint =
  | { kind: "item"; text: string }
  | { kind: "pair"; left: string; right: string };

export function parsePoint(text: string): DeckPoint {
  const parts = text
    .split("||")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 2) return { kind: "pair", left: parts[0] ?? "", right: parts[1] ?? "" };
  return { kind: "item", text: text.trim() };
}

/** 条数与旁白句数相同时跟句；否则在片长里均分。 */
export function revealStarts(count: number, cues: { from: number }[], durationInFrames: number): number[] {
  if (count <= 0) return [];
  if (cues.length === count) return cues.map((cue) => cue.from);
  const lead = 14;
  const tail = 10;
  const span = Math.max(1, durationInFrames - lead - tail);
  return Array.from({ length: count }, (_, index) => lead + Math.floor((index * span) / count));
}

export function splitMarks(text: string): { text: string; bold: boolean }[] {
  const chunks: { text: string; bold: boolean }[] = [];
  const re = /\*\*(.+?)\*\*/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    if (match.index > last) chunks.push({ text: text.slice(last, match.index), bold: false });
    chunks.push({ text: match[1] ?? "", bold: true });
    last = match.index + match[0].length;
  }
  if (last < text.length) chunks.push({ text: text.slice(last), bold: false });
  return chunks.filter((chunk) => chunk.text);
}
