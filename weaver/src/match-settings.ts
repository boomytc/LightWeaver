export const MATCH_SETTINGS = {
  minSentenceChars: 2,
  fuzzyThreshold: 0.6,
  topK: 3,
  timePadding: 0.3,
  sceneThreshold: 0.35,
  sceneMinGap: 0.4,
  snapWindow: 1.0,
  minPiece: 0.25,
  silentMinGap: 0.35,
  visualMinScore: 0.55,
  visualSampleCount: 5,
  frameInterval: 1,
  cropTop: 0.04,
  cropBottom: 0.18,
  cropSide: 0.04,
  continuityPenalty: 0.25,
  /** 视觉下一场先在上一场源点附近搜（秒）。 */
  continuitySlack: 12,
  /** 续搜分不低于全局最优减去这个值时，跟原片走。 */
  continuityMargin: 0.12,
  /** 已占用源窗的重叠惩罚（满分 1）。 */
  occupiedPenalty: 0.45,
  /** 源段 / 参考段时长比低于此则拉回参考时长。 */
  durationRatioMin: 0.5,
  maxOverlap: 0.05,
  maxJump: 0.6,
  mergeGap: 0.08,
  paddingBefore: 0.5,
  paddingAfter: 0.5,
  textWeight: 0.65,
  visualWeight: 0.35,
};

export type MatchSettings = typeof MATCH_SETTINGS;
