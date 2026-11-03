---
name: lightweaver-film
description: Author and revise LightWeaver films through the exact workspace CLI, including evidence, CreativePlan review, build, and delivery export.
---

# 制作和修改片子

外部 agent 负责文案与语义判断，LightWeaver 保存修订并执行分析和制作。素材由任务提供。场景方案按任务需要建立，所有制作都必须落到当前修订。

## 先固定实际 CLI

先读[入口选择](../lightweaver/SKILL.md)。从任务 brief 取得完整 CLI 入口和数据基线：

- 使用 **复制给 agent** 给出的绝对 Node 和 `weaver/bin/weaver.mjs` 路径。
- 命令保留实际 `--data-dir`、`--config-file` 和 `--config-base`。

不要在未知工作区运行裸 `weaver`。brief 缺少入口，或入口、数据目录与用户项目不一致时，先取得正确 brief 再写入。

默认情况下，stdout 是 JSON。只有用户需要终端表格时才加 `--human`。长作业加 `--wait`；脚本需要阶段进度时再加 `--progress`，进度写 stderr，stdout 仍读取最终 JSON。

## 完成一条制作链

1. 用实际 CLI 运行 `capabilities --json` 核对运行时。已有项目运行 `project show <id> --json`，再运行 `project context <id> --json`，读取当前修订、素材、证据、候选和方案。
2. 按任务选择直接编辑场景，或建立待审 CreativePlan。需要分场理由和证据记录时使用方案；上下文足够且用户已给出明确结构时，可以直接提交场景。
3. 用 `asset add` 导入任务素材。每次写入带当前 `--expected-revision` 和独立 `--request-id`。同一请求重试保留 requestId。
4. 只有任务需要时才运行 `analyze --with asr,describe --wait`，或导入人工证据。观察记录人物、动作、场景和变化，作者另写旁白。
5. 编辑场景前读取 `schema scene`、`schema ops`。新增单场可用 `scene add`；修改已有场景或批量编排用 `project apply`。制作前补齐所有可见内容、素材引用和必要声音策略。
6. 制作前运行 `doctor --json` 核对本次需要的工具与能力，再运行 `build --plan` 查看缺项和缓存。审核计划后，把它返回的 `revision` 原样传给 `build --expected-revision <revision> --wait`。修订冲突时重读并审核新版本，不自动替换 revision 重试。准备阶段取得真实语音和媒体事实，最终时长由时间轴 manifest 决定。
7. 读取 `artifacts` 和 receipt，核对交付状态、帧数与 timingQuality。需要修改时重读当前 revision，再保存局部修改并构建受影响目标。
8. 用 `export --format video --project <id> --dest /absolute/movie.mp4 --json` 导出当前成片。需要特定版本时传 `--delivery <id>`。按用户用途选择 OTIO、剪映或 bundle；工程包写到不存在的目标路径。交接软件和模型质量的验证范围据实说明。

## CreativePlan 必须显式采用

当任务选择方案流程时，按以下顺序执行：

```text
<ACTUAL CLI> schema creative-plan --json
<ACTUAL CLI> creative-plan import --project <id> --file <absolute-plan.json> --expected-revision <revision> --json
<ACTUAL CLI> creative-plan show --project <id> --json
<ACTUAL CLI> creative-plan apply --project <id> --expected-revision <new-revision> --json
```

`import` 保存方案到新修订，当前 scenes 继续用于制作。`show` 读取保存的方案供审核。只有用户或主 agent 明确采用后才运行 `apply`。默认替换当前场景，`--append` 追加。用户已确认的场景编辑可以直接用 `project apply`，不必先建立 CreativePlan。

纯卡片方案可以没有外部素材和分析证据。引用证据时，analysis、素材版本和区间必须属于当前项目。完整结构读取[CreativePlan 样例](references/examples/sample-creative-plan.json)，字段仍以运行时 schema 为准。

## 场景与输出

新增简单场景使用 `scene add`。`--kind` 支持 `card`、`still` 和 `clip`。卡片需要 `--headline`，`--label` 默认取标题，`--body` 可省略；静帧和视频片段使用 `--source`，视频片段可设置 `--start` 与 `--duration`。`--duration` 的单位是秒。写入仍需 `--expected-revision`。

可执行的纯卡片批量样例见 [ops 样例](references/examples/sample-ops.json)。完整场景和超窗合同见[场景合同](references/scenes.md)，命令顺序与样例入口见[制作流程](references/pipeline.md)。

## 六种任务

| 工作流 | 使用方式 |
| --- | --- |
| study-explainer | 任务静帧、卡片、作者旁白 |
| footage-narration | 多源转写与观察，作者组织剧情和选段 |
| observe-narrate | 无对白先观察，再写旁白与显式范围 |
| script-search | search 返回候选，proposal apply 保存选择 |
| highlight-mix | 选源窗并保留原声，无需音色 |
| reference-match | match 返回候选；有可用转写时结合文本，否则仅视觉匹配。查看 method、warnings 和 limitations 后审核采用 |

模型名称、能力与方法条件从 CLI 返回值读取。多参考、选材范围和字幕可编辑性见[创作边界](references/modes.md)，复盘见[交付核对](references/qa.md)。
