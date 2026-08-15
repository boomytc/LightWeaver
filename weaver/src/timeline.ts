import type { Locale, SceneDef } from "./schema.ts";

export type TimedScene = SceneDef & {
  from: number;
  durationInFrames: number;
  line: string;
};

export function estimateDurationFrames(line: string, locale: Locale, fps = 30): number {
  const charsPerSec = locale.startsWith("en") ? 14 : 4.2;
  return Math.max(60, Math.round((line.length / charsPerSec + 0.55) * fps));
}

export function timeScenes(
  scenes: SceneDef[],
  locale: Locale,
  options: { fps?: number; audioSeconds?: Record<string, number>; tailFrames?: number } = {},
): TimedScene[] {
  const fps = options.fps ?? 30;
  const tail = options.tailFrames ?? 16;
  let from = 0;
  return scenes.map((scene) => {
    const line = scene.lines[locale] ?? "";
    const seconds = options.audioSeconds?.[scene.id];
    const durationInFrames =
      typeof seconds === "number"
        ? Math.max(48, Math.round(seconds * fps) + tail)
        : estimateDurationFrames(line, locale, fps);
    const timed = { ...scene, from, durationInFrames, line };
    from += durationInFrames;
    return timed;
  });
}
