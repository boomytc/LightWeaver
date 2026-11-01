# 命令顺序

```bash
weaver project create demo --workflow observe-narrate --json
weaver asset add --project demo --file /absolute/source.mp4 --expected-revision revision --json
weaver analyze --project demo --with describe --provider modelbest-vlm --wait --json
weaver project show demo --json
weaver project apply --project demo --ops /absolute/edits.json --expected-revision revision --json
weaver build --project demo --plan --json
weaver build --project demo --wait --json
weaver artifacts --project demo --json
weaver export --project demo --format video --dest /absolute/movie.mp4 --json
```

每次修改后使用返回的新 revision。job 返回 runId；取消用 `run cancel`，中断后用 `run resume --wait`。独立 ASR、TTS 无需创建项目。

源片转写可先 `analyze --with asr --align`，再 `captions from-analysis` 显式采用为字幕。人工 SRT 用 `captions import`。导入音轨使用场景的 imported speech 合同，并按所需画面时长选择 source 或 speech 计时，不必先把声音合入视频。

已有文案找镜头时先确认已存字幕或画面观察证据，再用 `search --mode semantic` 召回。需要重排时显式加 `--rerank`，并确认该能力已配置；素材和时间窗可用 `--sources`、`--from-us`、`--to-us` 限制。候选仍需作者确认，选择后调用 `proposal apply`。

精确字幕设为 `precise` 前确认 Qwen3 强制对齐模型、Python 环境和语种可用，单场景旁白不得超过 180 秒。使用精确语音对齐的导入旁白需提供对应原文；缺对齐能力时可导入人工字幕或由作者显式选择 estimated。
