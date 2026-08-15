import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import type { ResolvedFilm, TimedScene } from "../lib/types";
import { theme } from "../lib/theme";
import { Mark } from "./Mark";
import { Subtitles } from "./Subtitles";

export function SceneView({ film, scene }: { film: ResolvedFilm; scene: TimedScene }) {
  const frame = useCurrentFrame();
  // Sequence-local. useVideoConfig().durationInFrames is the whole film.
  const sceneLen = scene.durationInFrames;
  const fadeIn = interpolate(frame, [0, 10], [0, 1], { extrapolateRight: "clamp" });
  const fadeOut = interpolate(frame, [sceneLen - 8, sceneLen], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = Math.min(fadeIn, fadeOut);

  if (scene.kind === "title") {
    return (
      <AbsoluteFill style={{ background: theme.bg, opacity, fontFamily: theme.font }}>
        <div style={{ position: "absolute", inset: 96, display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <Mark size={32} />
            <span
              style={{
                fontSize: 18,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                color: theme.subtle,
                fontWeight: 500,
              }}
            >
              {scene.kicker}
            </span>
          </div>
          <h1
            style={{
              margin: "64px 0 0",
              fontSize: 92,
              lineHeight: 1.08,
              letterSpacing: "-0.03em",
              fontWeight: 600,
              color: theme.fg,
              maxWidth: 1400,
            }}
          >
            {scene.headline}
          </h1>
          <p
            style={{
              margin: "28px 0 0",
              fontSize: 32,
              lineHeight: 1.45,
              color: theme.muted,
              maxWidth: 980,
            }}
          >
            {scene.lede}
          </p>
          <div style={{ marginTop: "auto", display: "flex", gap: 12, paddingBottom: 72 }}>
            {(scene.tags ?? []).map((tag) => (
              <span
                key={tag}
                style={{
                  border: "1px solid rgba(23,24,28,0.12)",
                  background: theme.surface,
                  borderRadius: 999,
                  padding: "10px 18px",
                  fontSize: 18,
                  color: theme.muted,
                }}
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
        <Subtitles line={scene.line} durationInFrames={sceneLen} />
      </AbsoluteFill>
    );
  }

  if (scene.kind === "close") {
    return (
      <AbsoluteFill style={{ background: theme.fg, opacity, fontFamily: theme.font }}>
        <div style={{ position: "absolute", inset: 96, display: "flex", flexDirection: "column" }}>
          <p
            style={{
              margin: 0,
              fontSize: 16,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: "rgba(255,255,255,0.4)",
              fontWeight: 500,
            }}
          >
            {scene.headline}
          </p>
          <p
            style={{
              margin: "36px 0 0",
              fontSize: 40,
              lineHeight: 1.45,
              color: "rgba(255,255,255,0.92)",
              maxWidth: 1400,
              fontWeight: 500,
            }}
          >
            {scene.lede}
          </p>
          <div
            style={{
              marginTop: "auto",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              color: "rgba(255,255,255,0.4)",
              fontSize: 18,
              paddingBottom: 72,
            }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Mark size={22} />
              {film.brand}
            </span>
            <span>{film.title}</span>
          </div>
        </div>
        <Subtitles line={scene.line} durationInFrames={sceneLen} />
      </AbsoluteFill>
    );
  }

  // contain stills already letterbox; zoom would crop the lab chrome.
  const zoom =
    scene.fit === "contain"
      ? 1
      : interpolate(frame, [0, sceneLen], [1, 1.035], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ background: theme.bg, opacity, fontFamily: theme.font }}>
      <div style={{ position: "absolute", inset: "36px 48px 148px" }}>
        <div
          style={{
            position: "relative",
            width: "100%",
            height: "100%",
            borderRadius: 18,
            overflow: "hidden",
            background: theme.surface,
            boxShadow: "0 1px 2px rgb(23 24 28 / 0.04), 0 18px 48px rgb(23 24 28 / 0.08)",
            border: "1px solid rgba(23,24,28,0.08)",
          }}
        >
          {scene.stillSrc ? (
            <Img
              src={staticFile(scene.stillSrc)}
              style={{
                width: "100%",
                height: "100%",
                objectFit: scene.fit ?? "cover",
                objectPosition: scene.fit === "contain" ? "center" : "top center",
                background: theme.bg,
                transform: `scale(${zoom})`,
              }}
            />
          ) : null}
          <span
            style={{
              position: "absolute",
              top: 16,
              left: 16,
              padding: "6px 12px",
              borderRadius: 999,
              background: "rgba(23,24,28,0.78)",
              color: "rgba(255,255,255,0.96)",
              fontSize: 16,
              letterSpacing: "0.04em",
              fontFamily: theme.mono,
              fontWeight: 500,
            }}
          >
            {scene.id}
          </span>
        </div>
      </div>
      <Subtitles line={scene.line} durationInFrames={sceneLen} />
    </AbsoluteFill>
  );
}
