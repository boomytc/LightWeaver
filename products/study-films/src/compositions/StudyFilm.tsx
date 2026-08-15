import { AbsoluteFill, Sequence, staticFile } from "remotion";
import { Audio } from "@remotion/media";
import { SceneView } from "../components/SceneView";
import { FILMS, lineOf } from "../lib/films";
import { theme } from "../lib/theme";
import type { CompId, TimedScene } from "../lib/types";

export type StudyFilmProps = {
  compId: CompId;
  scenes?: TimedScene[];
};

export function StudyFilm({ compId, scenes }: StudyFilmProps) {
  const film = FILMS[compId];
  const timed =
    scenes ??
    film.scenes.map((scene, index) => ({
      ...scene,
      from: index * 90,
      durationInFrames: 90,
      line: lineOf(film.filmId, film.locale, scene.id),
    }));

  return (
    <AbsoluteFill style={{ background: theme.bg }}>
      {timed.map((scene) => (
        <Sequence key={scene.id} from={scene.from} durationInFrames={scene.durationInFrames} name={scene.id}>
          <SceneView film={film} scene={scene} />
          <Audio src={staticFile(`${film.voiceDir}/${scene.id}.wav`)} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
}
