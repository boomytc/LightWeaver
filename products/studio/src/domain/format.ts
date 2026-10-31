export const labels: Record<string, string> = {
  landscape: "横屏 1920×1080",
  portrait: "竖屏 1080×1920",
  square: "方形 1080×1080",
  queued: "排队",
  running: "运行中",
  cancelling: "取消中",
  succeeded: "成功",
  failed: "失败",
  cancelled: "已取消",
  interrupted: "中断",
  partial: "部分成功",
  current: "当前",
  stale: "已过期",
  historical: "历史",
  missing: "缺失",
  card: "卡片",
  still: "静帧",
  clip: "视频片段",
};

export function localeName(value: string) {
  return value === "zh"
    ? "中文"
    : value === "en"
      ? "英文"
      : value === "ja"
        ? "日文"
        : value === "ko"
          ? "韩文"
          : value;
}

export function runLabel(state: string) {
  return labels[state] || state;
}
