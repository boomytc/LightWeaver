import { AbsoluteFill, Sequence, staticFile } from "remotion";
import { Audio } from "@remotion/media";
import { SceneView } from "../components/SceneView";
import { theme } from "../lib/theme";
import type { ResolvedFilm, TimedScene } from "../lib/types";

export type StudyFilmProps = {
  projectId: string;
  locale: string;
  brand?: string;
  title?: string;
  scenes?: TimedScene[];
};

export function StudyFilm({ projectId, locale, brand, title, scenes }: StudyFilmProps) {
  const film: ResolvedFilm = {
    projectId,
    locale,
    brand: brand ?? "LightWeaver",
    title: title ?? projectId,
  };
  const timed = scenes ?? [];

  return (
    <AbsoluteFill style={{ background: theme.bg }}>
      {timed.map((scene) => (
        <Sequence key={scene.id} from={scene.from} durationInFrames={scene.durationInFrames} name={scene.id}>
          <SceneView film={film} scene={scene} />
          {scene.voiceSrc ? <Audio src={staticFile(scene.voiceSrc)} /> : null}
        </Sequence>
      ))}
    </AbsoluteFill>
  );
}
