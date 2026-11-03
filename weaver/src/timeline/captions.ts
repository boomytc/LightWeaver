import {
  z,
  CaptionTrack,
  CaptionStyle,
  CaptionCue,
  type TimelineManifest,
  type OutputProfile,
  MediaRef,
} from "../contracts/index.ts";
import { WeaverError } from "../contracts/errors.ts";
import { secondsFrames, usSeconds, frameUs } from "./clock.ts";

function parseTime(raw: string): number {
  const parts = raw.replace(",", ".").split(":").map(Number);
  if (parts.some((p) => !Number.isFinite(p)))
    throw new WeaverError("INVALID_INPUT", "字幕时间无效");
  return Math.round(parts.reduce((acc, v) => acc * 60 + v, 0) * 1e6);
}
export function importCaptions(
  body: string,
  locale: string,
  fps: OutputProfile["fps"],
  source?: z.infer<typeof MediaRef>,
): z.infer<typeof CaptionTrack> {
  const blocks = body
      .replace(/^\uFEFF/, "")
      .replace(/\r/g, "")
      .split(/\n\s*\n/),
    cues: z.infer<typeof CaptionCue>[] = [];
  for (const block of blocks) {
    const rows = block.split("\n"),
      i = rows.findIndex((r) => r.includes("-->"));
    if (i < 0) continue;
    const times = rows[i].split("-->").map((t) => t.trim().split(/\s/)[0]),
      start = parseTime(times[0]),
      end = parseTime(times[1]);
    if (end <= start || start < 0)
      throw new WeaverError("INVALID_INPUT", "字幕区间无效");
    const from = secondsFrames(usSeconds(start), fps),
      to = secondsFrames(usSeconds(end), fps);
    cues.push(
      CaptionCue.parse({
        id: `cue-${cues.length + 1}`,
        text: rows.slice(i + 1).join("\n"),
        timingQuality: "manual",
        provenance: "人工导入 SRT/VTT",
        time: source
          ? {
              kind: "source",
              source,
              range: { startUs: start, durationUs: end - start },
            }
          : {
              kind: "timeline",
              startFrame: from,
              durationFrames: Math.max(1, to - from),
            },
      }),
    );
  }
  if (!cues.length)
    throw new WeaverError("INVALID_INPUT", "没有解析出字幕 cue");
  return CaptionTrack.parse({
    locale,
    fps,
    mode: "manual",
    style: CaptionStyle.parse({}),
    cues,
  });
}
function time(us: number, ass: boolean): string {
  const units = Math.round(us / (ass ? 10000 : 1000)),
    base = ass ? 100 : 1000,
    sub = units % base,
    sec = Math.floor(units / base);
  return `${ass ? Math.floor(sec / 3600) : String(Math.floor(sec / 3600)).padStart(2, "0")}:${String(Math.floor((sec % 3600) / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}${ass ? "." : ","}${String(sub).padStart(ass ? 2 : 3, "0")}`;
}
export function wrapCaption(text: string, maxChars: number): string {
  return text
    .split("\n")
    .flatMap((line) => {
      const chars = [...line],
        rows: string[] = [];
      while (chars.length > maxChars) {
        let cut = maxChars;
        const s = chars
          .slice(0, cut + 1)
          .join("")
          .lastIndexOf(" ");
        if (s > maxChars / 2) cut = s;
        rows.push(chars.splice(0, cut).join("").trim());
      }
      rows.push(chars.join("").trim());
      return rows;
    })
    .join("\n");
}
export function toSrt(manifest: TimelineManifest): string {
  return (
    manifest.captions
      .map(
        (cue, i) =>
          `${i + 1}\n${time(frameUs(cue.startFrame, manifest.output.fps), false)} --> ${time(frameUs(cue.startFrame + cue.durationFrames, manifest.output.fps), false)}\n${wrapCaption(cue.text, manifest.captionStyle.maxChars)}`,
      )
      .join("\n\n") + (manifest.captions.length ? "\n" : "")
  );
}
export function toAss(manifest: TimelineManifest): string {
  const s = manifest.captionStyle,
    color = `&H00${s.color.slice(5, 7)}${s.color.slice(3, 5)}${s.color.slice(1, 3)}`;
  const header = `[Script Info]\nScriptType: v4.00+\nPlayResX: ${manifest.output.width}\nPlayResY: ${manifest.output.height}\nWrapStyle: 0\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,${s.font.replace(/[,\n]/g, "")},${s.size},${color},${color},&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,${s.outline},0,2,60,60,${s.marginV},1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n`;
  return (
    header +
    manifest.captions
      .map(
        (c) =>
          `Dialogue: 0,${time(frameUs(c.startFrame, manifest.output.fps), true)},${time(frameUs(c.startFrame + c.durationFrames, manifest.output.fps), true)},Default,,0,0,0,,${wrapCaption(c.text, s.maxChars).replace(/[{}]/g, "").replace(/\n/g, "\\N")}\n`,
      )
      .join("")
  );
}
