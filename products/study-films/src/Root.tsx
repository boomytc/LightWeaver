import { Composition, staticFile, type CalculateMetadataFunction } from "remotion";
import { getAudioDurationInSeconds } from "@remotion/media-utils";
import catalog from "./generated/catalog.json";
import { StudyFilm, type StudyFilmProps } from "./compositions/StudyFilm";
import { fetchJson, linePublicPath, resolveProjectFile, type AssetDoc, type FilmDoc } from "./lib/resolveFilm";
import type { TimedScene } from "./lib/types";

const FPS = 30;
const TAIL = 16;

const calculateMetadata: CalculateMetadataFunction<StudyFilmProps> = async ({ props }) => {
  const film = await fetchJson<FilmDoc>(`projects/${props.projectId}/film.json`);
  const assets = await fetchJson<AssetDoc>(`projects/${props.projectId}/assets.json`);
  const locale = props.locale;
  const copy = film.locales[locale];
  let from = 0;
  const scenes: TimedScene[] = [];

  for (const scene of film.scenes) {
    const line = scene.lines[locale] ?? "";
    const charsPerSec = locale.startsWith("en") ? 14 : 4.2;
    let durationInFrames = Math.max(60, Math.round((line.length / charsPerSec + 0.55) * FPS));
    const voiceSrc = linePublicPath(film.id, scene.id, locale);
    try {
      const seconds = await getAudioDurationInSeconds(staticFile(voiceSrc));
      durationInFrames = Math.max(48, Math.round(seconds * FPS) + TAIL);
    } catch {
      /* preview before tts */
    }
    const titleCard = scene.kind === "title" ? copy?.titleCard : undefined;
    const closeCard = scene.kind === "close" ? copy?.closeCard : undefined;
    scenes.push({
      id: scene.id,
      kind: scene.kind,
      from,
      durationInFrames,
      line,
      stillSrc: resolveProjectFile(film.id, assets, scene.still, locale),
      voiceSrc,
      fit: scene.fit,
      kicker: titleCard?.kicker,
      headline: titleCard?.headline ?? closeCard?.headline,
      lede: titleCard?.lede ?? closeCard?.lede,
      tags: titleCard?.tags,
      points: titleCard?.points ?? closeCard?.points,
    });
    from += durationInFrames;
  }

  return {
    fps: FPS,
    width: 1920,
    height: 1080,
    durationInFrames: Math.max(from, FPS),
    props: {
      projectId: film.id,
      locale,
      brand: film.brand,
      title: copy?.title ?? film.id,
      scenes,
    },
  };
};

export function RemotionRoot() {
  return (
    <>
      {catalog.compositions.map((entry) => (
        <Composition
          key={entry.id}
          id={entry.id}
          component={StudyFilm}
          durationInFrames={300}
          fps={FPS}
          width={1920}
          height={1080}
          defaultProps={{ projectId: entry.projectId, locale: entry.locale, title: entry.title }}
          calculateMetadata={calculateMetadata}
        />
      ))}
    </>
  );
}
