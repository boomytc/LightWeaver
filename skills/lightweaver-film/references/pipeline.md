# 命令顺序

```bash
npx weaver project create demo --workflow observe-narrate --json
npx weaver asset add --project demo --file /absolute/source.mp4 --expected-revision revision --json
npx weaver analyze --project demo --with describe --provider deepseek-vlm --wait --json
npx weaver project show demo --json
npx weaver project apply --project demo --ops /tmp/edits.json --expected-revision revision --json
npx weaver build --project demo --plan --json
npx weaver build --project demo --wait --json
npx weaver artifacts --project demo --json
```

每次修改后使用返回的新 revision。job 返回 runId；取消用 `run cancel`，中断后用 `run resume --wait`。独立 ASR、TTS 无需创建项目。

已有文案找镜头时先确认已存字幕或画面观察证据，再用 `search --mode semantic` 召回。需要重排时显式加 `--rerank`，并确认该能力已配置；素材和时间窗可用 `--sources`、`--from-us`、`--to-us` 限制。候选仍需作者确认，选择后调用 `proposal apply`。

精确字幕设为 `precise` 前确认 Qwen3 强制对齐模型、Python 环境和语种可用，单场景旁白不得超过 180 秒。导入旁白必须提供对应原文；缺对齐能力时可导入人工字幕或由作者显式选择 estimated。
