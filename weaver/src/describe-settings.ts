import { MATCH_SETTINGS } from "./match-settings.ts";

export const DESCRIBE_SETTINGS = {
  sceneThreshold: 0.5,
  sequenceMergeMin: 0.62,
  observationMergeMin: 0.85,
  denseAsrRatio: 0.6,
  jpegWidth: 640,
  maxFramesPerSequence: 3,
  minShot: MATCH_SETTINGS.minPiece,
  minSequence: 3,
  maxSequence: 18,
  shortSequence: 2,
};
