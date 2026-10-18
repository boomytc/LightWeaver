export const ASR_SETTINGS = {
  /** 超过此时长才切窗；克隆源短 wav 不切。 */
  chunkSeconds: 40,
  overlapSeconds: 2,
  /** 每秒有效字符过少视为截断（OutputTruncated 的后备）。 */
  minCharsPerSecond: 0.4,
  overlapRatio: 0.75,
};
