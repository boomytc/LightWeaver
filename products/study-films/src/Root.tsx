import { Composition, staticFile, type CalculateMetadataFunction } from "remotion";
import { getAudioDurationInSeconds } from "@remotion/media-utils";
import { StudyFilm, type StudyFilmProps } from "./compositions/StudyFilm";
import { COMP_IDS, FILMS, lineOf } from "./lib/films";
import type { CompId, TimedScene } from "./lib/types";

const FPS = 30;
const TAIL = 16;

const calculateMetadata: CalculateMetadataFunction<StudyFilmProps> = async ({ props }) => {
  const film = FILMS[props.compId];
  let from = 0;
  const scenes: TimedScene[] = [];

  for (const scene of film.scenes) {
    const line = lineOf(film.filmId, film.locale, scene.id);
    const charsPerSec = film.locale === "en" ? 14 : 4.2;
    let durationInFrames = Math.max(60, Math.round((line.length / charsPerSec + 0.55) * FPS));
    try {
      const seconds = await getAudioDurationInSeconds(staticFile(`${film.voiceDir}/${scene.id}.wav`));
      durationInFrames = Math.max(48, Math.round(seconds * FPS) + TAIL);
    } catch {
      /* studio preview before tts */
    }
    scenes.push({ ...scene, from, durationInFrames, line });
    from += durationInFrames;
  }

  return {
    fps: FPS,
    width: 1920,
    height: 1080,
    durationInFrames: Math.max(from, FPS),
    props: { compId: props.compId, scenes },
  };
};

export function RemotionRoot() {
  return (
    <>
      {COMP_IDS.map((compId) => (
        <Composition
          key={compId}
          id={compId}
          component={StudyFilm}
          durationInFrames={300}
          fps={FPS}
          width={1920}
          height={1080}
          defaultProps={{ compId: compId as CompId }}
          calculateMetadata={calculateMetadata}
        />
      ))}
    </>
  );
}
