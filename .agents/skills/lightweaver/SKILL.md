---
name: lightweaver
description: Route LightWeaver film production, project editing, library management, or standalone ASR and TTS.
---

# LightWeaver

按用户正在操作的环境选择 CLI，后续所有命令保持同一入口和配置。

- 正式桌面包使用设置页“运行时与路径 → 外部 agent 与命令行”提供的完整命令，或随包 `bin/weaver`，Windows 为 `bin/weaver.cmd`。它读取桌面偏好和数据，不依赖当前目录。
- 浏览器开发模式使用仓库根目录的 `npx weaver`，默认数据在 `data/.weaver`。
- 从源码启动的桌面仍使用桌面工作区。使用仓库 CLI 时，传 `--data-dir`、`--config-file` 和 `--config-base` 对齐设置页中的实际路径，并沿用启动桌面时的工具环境。其它显式工作区同样核对这些路径。

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
