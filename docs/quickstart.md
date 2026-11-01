# 制作第一部短片

这篇教程用内置的三张文字卡片制作一部无声短片，并导出 MP4。示例不读取外部素材，不调用模型，也不需要 API 密钥。

完成后，故事板中有三张卡片，每张固定 90 帧。在默认 30 fps 输出中，每张卡片为 3 秒。

## 准备运行环境

已取得桌面包时，打开 LightWeaver。桌面包包含 FFmpeg、ffprobe 和 Chrome，也包含普通制作与交接所需的其它运行工具。

使用源码版时，先按[从源码启动](../README.md#从源码启动)打开应用。源码环境需要 Node.js、PATH 中的 FFmpeg 和 ffprobe，以及可用的 Chrome。缺少这些工具时，制作会在任务面板报告错误。

模型、API 密钥、交接 Python 和模型权重不属于这次制作的依赖。

## 从首页打开示例

1. 打开 **项目** 页面。
2. 在新建区点击 **打开示例**。
3. 等应用打开示例项目。故事板中应有三张卡片，任务或交付中还没有新成片。

示例使用固定的卡片时长，默认输出规格为 1920×1080、30 fps。

## 修改文字并制作

1. 选择第一张卡片，修改标题或正文。
2. 点击工作区右上角的 **保存并制作**。项目已经保存时，按钮显示为 **制作**。
3. 打开 **任务** 面板查看准备、渲染和封装进度。
4. 制作期间，如果需要继续核对内容，点击 **返回故事板**。

制作完成后，任务面板显示完成状态。保存失败时，制作不会提交，界面会显示错误原因，不会把未保存的草稿当作交付内容。

## 找到交付并导出

1. 点击完成提示中的 **查看交付**。
2. 在 **交付与历史** 中确认最新交付标记为当前交付。
3. 点击 **导出视频文件**，选择新的文件名。
4. 导出完成后，在目标目录播放 MP4。

如果已有同名文件，LightWeaver 保留该文件并拒绝覆盖。请选择新文件名。

三张卡片的视觉内容是画面文本，没有声音轨。导出成片可以正常播放，但不会包含旁白或音乐。

## 用 CLI 创建同一条路径

源码版和桌面包的 CLI 入口不同。先在应用的 **设置 → 运行时与路径 → 外部 agent 与命令行** 复制完整命令，或从项目 **复制给 agent** 取得命令。完整命令包含绝对 Node 路径、CLI 入口、数据目录、配置文件和配置基准目录。

下面以源码工作区为例。把带尖括号的路径换成当前工作区的绝对路径。

```sh
'<absolute-node>' '<absolute-LightWeaver>/weaver/bin/weaver.mjs' \
  --data-dir '<absolute-data-dir>' \
  --config-file '<absolute-config-file>' \
  --config-base '<absolute-config-base>' \
  project create first-film --sample --json
```

桌面包使用设置页给出的随包 CLI 命令。不要换成 `PATH` 中可能指向另一工作区的裸 `weaver`。

创建后，沿用同一命令前缀查看项目，再检查制作计划并等待制作：

```text
<完整 CLI 命令> project show first-film --json
<完整 CLI 命令> build --project first-film --plan --json
<完整 CLI 命令> build --project first-film --wait --json
```

`build --wait` 在终端中的阶段进度写到 stderr；通过管道或脚本执行时，加 `--progress` 才显示阶段进度。未加 `--human` 时，stdout 保持 JSON 结果，适合脚本和 agent 读取。需要终端表格时显式加 `--human`。

查看交付并导出：

```text
<完整 CLI 命令> artifacts --project first-film --json
<完整 CLI 命令> export --project first-film --format video \
  --dest '<absolute-output>/first-film.mp4' --json
```

目标文件必须使用绝对路径，并且不能在导出前已存在。

## 修改示例中的场景

在界面中，选择卡片后可在右侧属性里修改文字。CLI 的便捷场景命令按当前修订写入：

```text
<完整 CLI 命令> scene add --project first-film --kind card \
  --label '开场提示' --headline '从这里开始' --body '在 Studio 中继续编辑' \
  --duration 3 --expected-revision <current-revision> --json
```

`--kind` 接受 `card`、`still` 或 `clip`。卡片需要 `--headline`；`--label` 默认取标题，`--body` 可省略，省略时生成标题卡。静帧和视频片段使用 `--source`，视频片段可设置 `--start` 与 `--duration`。`--duration` 的单位是秒。

需要修改现有卡片时，在界面保存再制作。需要批量编辑或重复生成场景时，先运行 `schema ops --json`，再按[电影制作技能](../.agents/skills/lightweaver-film/SKILL.md)中的 `project apply` 流程提交。

## 下一步

- 按用途选择[静帧讲解与其它工作流](user-guide.md#制作第一部片子)。
- 在[场景、时长与采用](concepts.md)中查看旁白超窗和创作方案规则。
- 需要画面观察、语音合成或转写时，按[用户指南](user-guide.md#按需要配置-ai-功能)配置对应能力。
