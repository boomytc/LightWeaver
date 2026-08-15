export type Cue = {
  text: string;
  from: number;
  durationInFrames: number;
};

export function cuesFromLine(text: string, durationInFrames: number): Cue[] {
  const parts = text
    .split(/(?<=[。！？；.!?])/)
    .map((part) => part.trim())
    .filter(Boolean);
  const lines = parts.length ? parts : text.trim() ? [text.trim()] : [];
  if (!lines.length) return [];

  const total = lines.reduce((sum, part) => sum + part.length, 0) || 1;
  const usable = Math.max(1, durationInFrames - 8);
  let from = 6;
  return lines.map((part, index) => {
    const share = part.length / total;
    const duration = Math.max(20, Math.round(share * usable));
    const cue = { text: part, from, durationInFrames: duration };
    from += duration;
    if (index === lines.length - 1) {
      cue.durationInFrames = Math.max(duration, durationInFrames - cue.from - 4);
    }
    return cue;
  });
}

export function activeCue(cues: Cue[], frame: number): Cue | null {
  return cues.find((cue) => frame >= cue.from && frame < cue.from + cue.durationInFrames) ?? null;
}
