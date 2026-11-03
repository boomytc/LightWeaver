---
name: lightweaver
description: Route LightWeaver film production, project editing, library management, or standalone ASR and TTS.
---

# LightWeaver

从源码工作区运行。首次安装或缺少环境时，先读 `docs/development.md`，按需准备运行组件和模型。

- 在工作区根目录使用 `npx weaver`。
- 与桌面项目协作时，使用 **复制给 agent** 给出的完整命令；它已绑定实际数据目录、配置文件与基准目录。
- 从其它目录调用时，保留命令中的绝对 Node、`weaver/bin/weaver.mjs` 路径和配置参数。

用所选入口运行 `capabilities --json`、`help --json`。核对返回的 `runtime.dataDir` 和 `runtime.configFile`，读取 `runtime.resourcesDir` 下的 AGENTS.md 和 `docs/conventions.md`。`agentSkills` 提供与入口配套的技能路径。已有项目先读取它；找不到项目时先检查入口和工作区。

- 制作或修改片子，读 [电影制作技能](../lightweaver-film/SKILL.md)。
- 导入媒体、音色或方法，读 [素材管理技能](../lightweaver-assets/SKILL.md)。
- 开发共享能力进入 `weaver/`，Studio 进入 `products/studio/`，卡片进入 `products/study-films/`。

独立语音操作无需项目：

```bash
weaver asr --file /absolute/clip.wav --wait --json
weaver tts --text "旁白内容" --voice voice-id --voice-version digest --dest /absolute/line.wav --wait --json
```

上面的 `weaver` 表示已确定的实际入口。未确认音频语言时保留 ASR 自动识别。模型缺项先查看 `doctor --json`。任务没有授权时，不替用户下载模型或另写创作 LLM。
