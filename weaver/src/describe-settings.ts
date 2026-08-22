import { MATCH_SETTINGS } from "./match-settings.ts";

export const DESCRIBE_SETTINGS = {
  sequenceMergeMin: 0.75,
  denseAsrRatio: 0.6,
  jpegWidth: 640,
  maxFramesPerSequence: 3,
  minShot: MATCH_SETTINGS.minPiece,
  shortSequence: 2,
};

export const DEFAULT_VLM_MODEL = "MiniCPM-V-4.6";
