import { interpolate, useCurrentFrame } from "remotion";
import { activeCue, cuesFromLine } from "../lib/subtitles";
import { theme } from "../lib/theme";

export function Subtitles({ line, durationInFrames }: { line: string; durationInFrames: number }) {
  const frame = useCurrentFrame();
  const cues = cuesFromLine(line, durationInFrames);
  const cue = activeCue(cues, frame);
  if (!cue) return null;

  const local = frame - cue.from;
  const opacity = interpolate(local, [0, 5, cue.durationInFrames - 4, cue.durationInFrames], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        position: "absolute",
        left: 120,
        right: 120,
        bottom: 48,
        display: "flex",
        justifyContent: "center",
        pointerEvents: "none",
        opacity,
        fontFamily: theme.font,
      }}
    >
      <span
        style={{
          maxWidth: 1520,
          padding: "12px 22px",
          borderRadius: 12,
          background: "rgba(23,24,28,0.78)",
          color: "rgba(255,255,255,0.96)",
          fontSize: 32,
          lineHeight: 1.45,
          fontWeight: 500,
          textAlign: "center",
          letterSpacing: "0.02em",
        }}
      >
        {cue.text}
      </span>
    </div>
  );
}
