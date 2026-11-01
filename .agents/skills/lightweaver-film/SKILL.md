---
name: lightweaver-film
description: Author and revise LightWeaver films through the shared CLI, inspect analysis and proposals, build, and export deliveries.
---

# 制作和修改片子

外部 agent 负责文案与语义判断，LightWeaver 保存修订并执行分析和制作。素材由任务提供。没有指定方法时直接按任务组织场景。

先读 [入口选择](../lightweaver/SKILL.md)，确定与用户项目一致的 CLI 和数据目录。以下 `weaver` 表示该实际入口。

1. 调用 `weaver capabilities --json` 选择工作流。已有项目先 `project show <id> --json`，再 `project context <id> --json` 读取修订、素材、证据和候选。
2. 用 `asset add` 导入任务素材。每次写入带当前 expectedRevision 和独立 requestId，同一请求重试保留 requestId。
3. 按任务运行 `analyze --with asr,describe --wait`，或导入人工证据。观察记录人物、动作、场景和变化，作者另写旁白。
4. 查 `weaver schema scene`、`schema ops`。用 `project apply` 保存 card、still、clip 及声音策略。空草稿可以保留，制作前补齐实际内容。
5. 运行 `build --plan` 查看缺项和缓存，再 `build --wait`。准备步骤获取真实语音和媒体事实，最终时长由 manifest 决定。
6. 复盘交付与 timingQuality。需要修改时重读当前 revision，再保存局部修改并构建受影响目标。
7. 用 `export --format video --project <id> --dest /absolute/movie.mp4 --json` 导出当前成片。需要特定版本时传 `--delivery <id>`。按用户用途选择 OTIO、剪映或 bundle；工程包写到不存在的目标路径。交接软件和模型质量的验证范围据实说明。

## 六种任务

| 工作流 | 使用方式 |
| --- | --- |
| study-explainer | 任务静帧、卡片、作者旁白 |
| footage-narration | 多源转写与观察，作者组织剧情和选段 |
| observe-narrate | 无对白先观察，再写旁白与显式范围 |
| script-search | search 返回候选，proposal apply 保存选择 |
| highlight-mix | 选源窗并保留原声，无需音色 |
| reference-match | match 返回候选；有可用转写时结合文本，否则仅视觉匹配。查看 method、warnings 和 limitations 后审核采用 |

模型名称、能力与方法条件从 CLI 返回值读取。多参考、选材范围和字幕可编辑性见 [创作边界](references/modes.md)，详细合同见 [场景合同](references/scenes.md)，命令顺序见 [制作流程](references/pipeline.md)，复盘见 [交付核对](references/qa.md)。
