---
name: lightweaver
description: Route LightWeaver film production, project editing, library management, or standalone ASR and TTS.
---

# LightWeaver

先读仓库 AGENTS.md 和 `docs/conventions.md`，再调用 `npx weaver capabilities --json`、`npx weaver help --json` 发现当前工作流、模型与命令。

- 制作或修改片子，读 `skills/lightweaver-film/SKILL.md`。
- 导入媒体、音色或方法，读 `skills/lightweaver-assets/SKILL.md`。
- 开发共享能力进入 `weaver/`，Studio 进入 `products/studio/`，卡片进入 `products/study-films/`。

独立语音操作无需项目：

```bash
npx weaver asr --file /absolute/clip.wav --locale zh --wait --json
npx weaver tts --text "旁白内容" --voice voice-id --voice-version digest --dest /tmp/line.wav --wait --json
```

模型缺项先查看 `weaver doctor --json`。任务没有授权时，不替用户下载模型或另写创作 LLM。
