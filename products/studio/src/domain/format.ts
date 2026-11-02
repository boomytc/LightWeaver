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
  stale: "内容已更新",
  historical: "历史",
  missing: "缺失",
  card: "卡片",
  still: "静帧",
  clip: "视频片段",
  asr: "语音转写",
  describe: "画面观察",
  aligned: "精确对齐",
  native: "原生时间",
  estimated: "估算时间",
  manual: "人工编辑",
};

const runKinds: Record<string, string> = {
  build: "影片制作", analyze: "素材分析", "reference-match": "参考成片匹配",
  "semantic-search": "语义检索", "visual-search": "画面检索", capture: "网页捕获",
  "import-proposal": "导入候选方案", "import-analysis": "导入分析结果",
  "model-download": "模型下载", "model-setup": "模型准备", "engine-install": "组件准备",
  "engine-setup": "组件检查与修复", "caption-translate": "字幕翻译", "caption-speakers": "说话人分段",
  asr: "音频转写", tts: "语音合成", "voice-design": "音色试听",
};
export const runKindLabel = (kind: string) => runKinds[kind] || kind;

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
