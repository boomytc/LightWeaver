export const MICROS_PER_SECOND = 1e6;

export type SourceWindow = {
  startUs: number;
  durationUs: number;
};

export function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function seconds(microseconds: number) {
  return microseconds / MICROS_PER_SECOND;
}

export function normalizeWindow(window: SourceWindow, bounds: SourceWindow): SourceWindow {
  const boundsEnd = bounds.startUs + bounds.durationUs;
  const durationUs = clamp(Math.round(window.durationUs), 1, Math.max(1, bounds.durationUs));
  const startUs = clamp(
    Math.round(window.startUs),
    bounds.startUs,
    Math.max(bounds.startUs, boundsEnd - durationUs),
  );
  return {
    startUs,
    durationUs: Math.min(durationUs, boundsEnd - startUs),
  };
}
