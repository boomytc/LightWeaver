import { interpolate } from "remotion";
import { parsePoint, revealStarts, splitMarks } from "../lib/deck";
import { cuesFromLine } from "../lib/subtitles";
import { theme } from "../lib/theme";

export function DeckPoints({
  points,
  frame,
  durationInFrames,
  line,
  tone,
}: {
  points: string[];
  frame: number;
  durationInFrames: number;
  line: string;
  tone: "light" | "dark";
}) {
  if (!points.length) return null;
  const starts = revealStarts(points.length, cuesFromLine(line, durationInFrames), durationInFrames);
  const dark = tone === "dark";
  const fg = dark ? "rgba(255,255,255,0.94)" : theme.fg;
  const muted = dark ? "rgba(255,255,255,0.55)" : theme.muted;
  const card = dark ? "rgba(255,255,255,0.06)" : theme.surface;
  const lineColor = dark ? "rgba(255,255,255,0.12)" : "rgba(23,24,28,0.10)";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, flex: 1, justifyContent: "center", minHeight: 0 }}>
      {points.map((raw, index) => {
        const start = starts[index] ?? 0;
        const opacity = interpolate(frame, [start, start + 8], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        const lift = interpolate(frame, [start, start + 8], [14, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        const point = parsePoint(raw);
        const num = String(index + 1).padStart(2, "0");
        if (point.kind === "pair") {
          return (
            <div
              key={`${raw}-${index}`}
              style={{
                opacity,
                transform: `translateY(${lift}px)`,
                display: "grid",
                gridTemplateColumns: "1fr auto 1fr",
                gap: 18,
                alignItems: "stretch",
              }}
            >
              <PairTile text={point.left} tone={tone} />
              <span style={{ alignSelf: "center", color: muted, fontSize: 22 }}>↔</span>
              <PairTile text={point.right} tone={tone} />
            </div>
          );
        }
        return (
          <div
            key={`${raw}-${index}`}
            style={{
              opacity,
              transform: `translateY(${lift}px)`,
              display: "flex",
              alignItems: "center",
              gap: 20,
              padding: "22px 28px",
              borderRadius: 16,
              background: card,
              border: `1px solid ${lineColor}`,
            }}
          >
            <span
              style={{
                fontFamily: theme.mono,
                fontSize: 18,
                color: dark ? "rgba(255,255,255,0.45)" : theme.accent,
                minWidth: 36,
              }}
            >
              {num}
            </span>
            <span style={{ fontSize: 32, lineHeight: 1.35, fontWeight: 500, color: fg }}>{inline(point.text)}</span>
          </div>
        );
      })}
    </div>
  );
}

function PairTile({ text, tone }: { text: string; tone: "light" | "dark" }) {
  const dark = tone === "dark";
  return (
    <div
      style={{
        padding: "22px 26px",
        borderRadius: 16,
        background: dark ? "rgba(255,255,255,0.06)" : theme.surface,
        border: `1px solid ${dark ? "rgba(255,255,255,0.12)" : "rgba(23,24,28,0.10)"}`,
        fontSize: 28,
        lineHeight: 1.35,
        fontWeight: 500,
        color: dark ? "rgba(255,255,255,0.94)" : theme.fg,
      }}
    >
      {inline(text)}
    </div>
  );
}

function inline(text: string) {
  return splitMarks(text).map((chunk, index) => (
    <span key={`${chunk.text}-${index}`} style={{ fontWeight: chunk.bold ? 650 : 500 }}>
      {chunk.text}
    </span>
  ));
}
