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
