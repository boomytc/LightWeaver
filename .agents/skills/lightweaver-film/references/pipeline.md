# 命令顺序

## 绑定 CLI 和数据

先读任务 brief。源码版使用绝对 Node 路径和绝对 `weaver/bin/weaver.mjs` 路径。桌面包使用 **复制给 agent** 或设置页给出的完整随包 CLI 命令。两者都保留 brief 中的 `--data-dir`、`--config-file` 和 `--config-base`。

以下 `<ACTUAL CLI>` 表示复制得到的完整命令。不要用裸 `weaver` 猜测数据目录。

默认情况下，stdout 是 JSON。只有终端阅读需要表格时才加 `--human`。长作业加 `--wait`；脚本需要阶段进度时加 `--progress`，阶段进度写 stderr，stdout 保留最终 JSON。

## 从零完成示例

创建项目时追加 `--sample`：

```text
<ACTUAL CLI> project create first-film --sample --json
<ACTUAL CLI> project show first-film --json
<ACTUAL CLI> build --project first-film --plan --json
<ACTUAL CLI> build --project first-film --expected-revision <reviewed-revision> --wait --json
<ACTUAL CLI> artifacts --project first-film --json
<ACTUAL CLI> export --project first-film --format video --dest /absolute/first-film.mp4 --json
```

审核计划后，用返回的 `revision` 替换 `<reviewed-revision>`。示例是三张固定 90 帧的卡片，不含外部素材或声音。创建入口的源码或桌面包形式以实际 brief 和运行时为准。

## CreativePlan 流程

方案流程用于需要保存分场理由、证据和待审场景的任务。它不是所有创作的前置条件。

```text
<ACTUAL CLI> project context demo --json
<ACTUAL CLI> schema creative-plan --json
<ACTUAL CLI> creative-plan import --project demo --file /absolute/plan.json --expected-revision revision --json
<ACTUAL CLI> creative-plan show --project demo --json
<ACTUAL CLI> creative-plan apply --project demo --expected-revision new-revision --json
```

`import` 保存方案，现有 scenes 继续用于制作。审核 `show` 的结果后，才运行 `apply`。默认替换场景，`--append` 追加。纯卡片示例 [sample-creative-plan.json](examples/sample-creative-plan.json) 可执行；带证据的方案必须引用当前项目的分析记录和精确素材版本。

直接编辑已确认的场景不需要 CreativePlan。读取 `schema scene`、`schema ops`，再用 `project apply` 保存修订。

```text
<ACTUAL CLI> project create demo --workflow observe-narrate --json
<ACTUAL CLI> asset add --project demo --file /absolute/source.mp4 --expected-revision revision --json
<ACTUAL CLI> analyze --project demo --with describe --provider modelbest-vlm --wait --json
<ACTUAL CLI> project show demo --json
<ACTUAL CLI> project apply --project demo --ops /absolute/edits.json --expected-revision revision --json
<ACTUAL CLI> build --project demo --plan --json
<ACTUAL CLI> build --project demo --expected-revision <reviewed-revision> --wait --json
<ACTUAL CLI> artifacts --project demo --json
<ACTUAL CLI> export --project demo --format video --dest /absolute/movie.mp4 --json
```

每次修改后使用返回的新 revision。制作时使用已审核计划的 `revision`，不能用新的 head 绕过冲突。job 返回 runId；取消用 `run cancel`，中断后用 `run resume --wait`。独立 ASR、TTS 无需创建项目。

新增简单场景可运行 `scene add`；修改已有场景使用 `project apply`。`--kind` 接受 `card`、`still`、`clip`；卡片需要 `--headline`，`--label` 默认取标题，`--body` 可省略。静帧和视频片段使用 `--source`，视频片段可传 `--start`、`--duration`。`--duration` 按秒计，写入仍必须带 `--expected-revision`。可执行的纯卡片批量写入样例见 [sample-ops.json](examples/sample-ops.json)。

要把纯卡片样例写入当前空草稿，使用：

```text
<ACTUAL CLI> project apply --project first-film \
  --ops <absolute-LightWeaver>/.agents/skills/lightweaver-film/references/examples/sample-ops.json \
  --expected-revision revision --json
```

源片转写可先 `analyze --with asr --align`，再 `captions from-analysis` 显式采用为字幕。人工 SRT 用 `captions import`。导入音轨使用场景的 imported speech 合同，并按所需画面时长选择 source 或 speech 计时，不必先把声音合入视频。

已有文案找镜头时先确认已存字幕或画面观察证据，再用 `search --mode semantic` 召回。需要重排时显式加 `--rerank`，并确认该能力已配置；素材和时间窗可用 `--sources`、`--from-us`、`--to-us` 限制。候选仍需作者确认，选择后调用 `proposal apply`。

精确字幕设为 `precise` 前确认 Qwen3 强制对齐模型、Python 环境和语种可用，单场景旁白不得超过 180 秒。使用精确语音对齐的导入旁白需提供对应原文；缺对齐能力时可导入人工字幕或由作者显式选择 estimated。

以上结构用于快速编辑，运行时 schema 是当前字段和约束的权威。样例中的项目标识、素材标识、摘要和证据不能复用为另一个项目的事实。
