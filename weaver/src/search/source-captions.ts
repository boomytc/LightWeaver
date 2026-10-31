import {
  z,
  AnalysisEntry,
  CaptionCue,
  CaptionStyle,
  CaptionTrack,
  refKey,
} from "../contracts/index.ts";
import { digest } from "../store/index.ts";
import { WeaverError } from "../contracts/errors.ts";

type Entry = z.infer<typeof AnalysisEntry>;
type Track = z.infer<typeof CaptionTrack>;
type Cue = z.infer<typeof CaptionCue>;
type Fps = Track["fps"];

const qualityRank: Record<Entry["timingQuality"], number> = {
  aligned: 0,
  native: 1,
  manual: 2,
  estimated: 3,
};

function captionText(text: string): string {
  return text.normalize("NFC").trim().replace(/\s+/gu, " ");
}

function overlaps(a: Entry["range"], b: Entry["range"]): boolean {
  return (
    Math.max(a.startUs, b.startUs) <
    Math.min(a.startUs + a.durationUs, b.startUs + b.durationUs)
  );
}

export function selectSourceEntries(input: {
  entries: Entry[];
  sourceKeys: ReadonlySet<string>;
  locale: string;
}): Entry[] {
  const ordered = input.entries
    .filter(
      (entry) =>
        entry.kind !== "describe" &&
        input.sourceKeys.has(refKey(entry.source)) &&
        (entry.locale === undefined || entry.locale === input.locale),
    )
    .sort(
      (a, b) =>
        qualityRank[a.timingQuality] - qualityRank[b.timingQuality] ||
        refKey(a.source).localeCompare(refKey(b.source)) ||
        a.range.startUs - b.range.startUs ||
        a.id.localeCompare(b.id),
    );
  const selected: Entry[] = [];
  for (const entry of ordered)
    if (
      !selected.some(
        (chosen) =>
          refKey(chosen.source) === refKey(entry.source) &&
          overlaps(chosen.range, entry.range) &&
          chosen.speakerId === entry.speakerId &&
          captionText(chosen.sourceText ?? chosen.text) ===
            captionText(entry.sourceText ?? entry.text),
      )
    )
      selected.push(entry);
  return selected.sort(
    (a, b) =>
      refKey(a.source).localeCompare(refKey(b.source)) ||
      a.range.startUs - b.range.startUs ||
      a.id.localeCompare(b.id),
  );
}

function modeFor(cues: Cue[]): Track["mode"] {
  if (
    cues.every(
      (cue) =>
        cue.timingQuality === "aligned" || cue.timingQuality === "native",
    )
  )
    return "precise";
  return cues.some((cue) => cue.timingQuality === "estimated")
    ? "estimated"
    : "manual";
}

export function sourceCues(entries: Entry[]): Cue[] {
  return entries.map((entry) => {
    const sourceText = entry.sourceText ?? entry.text;
    return CaptionCue.parse({
      id: `source-${digest({
        projectId: entry.projectId,
        source: entry.source,
        analysisId: entry.id,
        range: entry.range,
      })}`,
      text: sourceText,
      timingQuality: entry.timingQuality,
      provenance: `${entry.model}/${entry.evidenceDigest}`,
      sourceText,
      ...(entry.speakerId ? { speakerId: entry.speakerId } : {}),
      ...(entry.words ? { words: entry.words } : {}),
      time: {
        kind: "source",
        source: entry.source,
        range: entry.range,
      },
    });
  });
}

export function mergeSourceCaptionTrack(input: {
  track?: Track;
  locale: string;
  fps: Fps;
  sourceKeys: ReadonlySet<string>;
  cues: Cue[];
  replaceWindows?: { source: string; startUs: number; endUs?: number }[];
}): Track {
  const current =
    input.track ??
    CaptionTrack.parse({
      locale: input.locale,
      fps: input.fps,
      mode: "precise",
      style: CaptionStyle.parse({}),
      cues: [],
    });
  const retained = current.cues.filter((cue) => {
    if (cue.time.kind !== "source") return true;
    const { source, range } = cue.time;
    const key = refKey(source);
    if (!input.sourceKeys.has(key)) return true;
    return input.replaceWindows !== undefined && !input.replaceWindows.some((window) =>
      window.source === key && range.startUs < (window.endUs ?? Infinity) &&
      range.startUs + range.durationUs > window.startUs,
    );
  });
  if (current.translationLocale && retained.length)
    throw new WeaverError("INVALID_INPUT", "不能将原文结果混入译文字幕轨，请先恢复原文字幕");
  const cues = [...retained, ...input.cues];
  return CaptionTrack.parse({...current, translationLocale: undefined, mode: modeFor(cues), cues});
}
