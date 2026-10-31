import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { CardRenderInput, z } from "@lightweaver/weaver/contracts";
import { Mark } from "./components/Mark";
import { parsePoint, splitMarks, revealStarts } from "./lib/deck";
import { theme } from "./lib/theme";

export function Card(props: z.infer<typeof CardRenderInput>) {
  const frame = useCurrentFrame(),
    { width, height } = useVideoConfig();
  const { cardSpec: spec, locale, durationFrames } = props,
    copy = spec.copy[locale];
  const portrait = height > width,
    compact = width <= height,
    dark = spec.template === "close";
  const unit = Math.min(width, height) / 1080,
    fg = dark ? "#f5f6f8" : theme.fg;
  const opacity = Math.min(
    interpolate(frame, [0, Math.min(10, durationFrames / 3)], [0, 1], {
      extrapolateRight: "clamp",
    }),
    interpolate(
      frame,
      [Math.max(0, durationFrames - 8), durationFrames],
      [1, 0],
      { extrapolateLeft: "clamp" },
    ),
  );
  const starts = revealStarts(copy.points.length, [], durationFrames);
  const inline = (text: string) =>
    splitMarks(text).map((chunk, i) => (
      <span key={i} style={{ fontWeight: chunk.bold ? 700 : 500 }}>
        {chunk.text}
      </span>
    ));
  return (
    <AbsoluteFill
      style={{
        background: dark ? theme.fg : theme.bg,
        color: fg,
        fontFamily: theme.font,
        padding: `${height * 0.065}px ${width * 0.065}px ${height * 0.13}px`,
        opacity,
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        gap: 24 * unit,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16 * unit,
          fontSize: 22 * unit,
          color: dark ? "#aaaeb7" : theme.muted,
        }}
      >
        <Mark size={36 * unit} />
        {copy.kicker || spec.brand}
      </div>
      <h1
        style={{
          margin: `${portrait ? 48 : 12}px 0 0`,
          fontSize: (compact ? 68 : 86) * unit,
          lineHeight: 1.15,
          letterSpacing: "-.03em",
          overflowWrap: "anywhere",
        }}
      >
        {copy.headline}
      </h1>
      {copy.lede && (
        <p
          style={{
            margin: 0,
            fontSize: 30 * unit,
            lineHeight: 1.5,
            color: dark ? "#b8bdc8" : theme.muted,
          }}
        >
          {copy.lede}
        </p>
      )}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          minHeight: 0,
          justifyContent: "center",
          gap: 20 * unit,
        }}
      >
        {copy.points.map((raw, i) => {
          const p = parsePoint(raw),
            start = starts[i],
            alpha = interpolate(frame, [start, start + 8], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            });
          const box = {
            padding: `${24 * unit}px ${28 * unit}px`,
            background: dark ? "rgba(255,255,255,.06)" : theme.surface,
            border: `1px solid ${dark ? "#ffffff22" : "#17181c18"}`,
            borderRadius: 16 * unit,
            fontSize: (compact ? 32 : 36) * unit,
            lineHeight: 1.4,
          };
          return (
            <div
              key={i}
              style={{
                opacity: alpha,
                transform: `translateY(${(1 - alpha) * 14}px)`,
              }}
            >
              {p.kind === "pair" ? (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: compact ? "1fr" : "1fr auto 1fr",
                    gap: 16 * unit,
                    alignItems: "center",
                  }}
                >
                  <div style={box}>{inline(p.left)}</div>
                  <span style={{ textAlign: "center" }}>↔</span>
                  <div style={box}>{inline(p.right)}</div>
                </div>
              ) : (
                <div style={{ ...box, display: "flex", gap: 22 * unit }}>
                  <span style={{ fontFamily: theme.mono, color: theme.accent }}>
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span>{inline(p.text)}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 * unit }}>
        {copy.tags.map((tag) => (
          <span
            key={tag}
            style={{
              border: "1px solid #88888844",
              borderRadius: 100,
              padding: `${8 * unit}px ${16 * unit}px`,
              fontSize: 22 * unit,
            }}
          >
            {tag}
          </span>
        ))}
      </div>
    </AbsoluteFill>
  );
}
