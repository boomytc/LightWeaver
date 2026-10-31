# 场景合同

运行 `weaver schema scene --json` 查询完整 schema。三种场景可以混用。

- card 使用注册模板及按 locale 保存的 copy。
- still 绑定图片版本，选择 contain 或 cover。
- clip 绑定视频版本和整数微秒 SourceRange，作者选择声音与时长策略。

静帧与卡片使用固定帧长，或真实语音时长加尾帧。clip 可由源窗计时，或由语音计时。语音超窗默认拒绝，末帧定格与变速需要显式上限。导入语音不要求 TTS 音色，原声场无需旁白。

字幕可以使用成片时间、源片时间或 scene 的语音时间。人工字幕保存为修订；estimated 只表示估算展示，precise 需要实际对齐能力。
