# LightWeaver 文档

按你当前的身份和任务选择一篇开始就行。命令参数与数据结构以实际 CLI 输出和运行时 schema 为准，教程与样例用来帮你更快上手。

## 用户

| 文档 | 内容 |
| --- | --- |
| [制作第一部短片](quickstart.md) | 用自带的三张文字卡片示例走完编辑、制作与 MP4 导出 |
| [用户指南](user-guide.md) | 界面操作、按需配置 AI 模型、保存恢复、导出与常见排查 |
| [场景、时长与采用](concepts.md) | 卡片、静帧、视频片段的时长规则，旁白超长处理与创作方案采用 |
| [命令与配置参考](conventions.md) | 数据存放位置、完整 CLI 命令、分析与制作约定 |

如果只是想先跑通一次成片和导出，不想配模型、密钥或准备外部素材，直接在首页点击 **打开示例**（或运行 `project create <id> --sample`）即可。

## Agent

让外部 agent 接手项目时，从界面项目的 **更多 → 复制给 agent**（或 CLI 运行 `project brief <id>`）获取完整命令前缀。它会自带当前工作区实际的 Node 与源码 CLI 路径，以及正在使用的数据目录（`--data-dir`）、配置文件（`--config-file`）和配置基准目录（`--config-base`），避免读错或写错目录。

- [LightWeaver 总入口](../.agents/skills/lightweaver/SKILL.md)（识别当前工作区入口、任务分流与独立语音命令）
- [电影制作](../.agents/skills/lightweaver-film/SKILL.md)（读取上下文、分析证据、创作方案、编辑、制作与导出）
- [素材与库](../.agents/skills/lightweaver-assets/SKILL.md)（导入媒体与管理可复用的音色、方法、素材库）

拿到入口后，先运行 `capabilities` 核对实际工作区与能力，再用 `project context` 读取项目的最新内容、素材、分析结果和候选列表，不要在未知目录上直接跑裸 `weaver`。需要做整体规划并留给人审核时，可以用 `creative-plan import` 先把待审方案存进项目，确认后再运行 `creative-plan apply` 让它生效；如果场景结构已经确定，也可以直接用 `project apply` 写入场景，不必先建创作方案。

不确定 JSON 字段怎么写时，运行 `schema` 查看程序校验用的最新 JSON Schema。样例文件只展示结构格式，其中的项目 ID、素材 ID、摘要和证据都要替换成当前项目的真实内容。

## 开发

| 文档 | 内容 |
| --- | --- |
| [运行与开发](development.md) | 环境安装、WorkBuddy 配置、源码启动、打包分享与 CLI 协作入口 |
| [架构说明](architecture-v2.md) | 项目版本、素材存储、作业调度、时间轴编译和交付的实现边界 |
| [命令与配置参考](conventions.md) | 公开入口、数据结构、工具与运行规则 |

## 验收

| 文档 | 范围 |
| --- | --- |
| [配置分层与凭证验收](acceptance-config.md) | 本地覆盖、环境兜底、默认配置与桌面凭证生效 |
| [功能收尾验收](acceptance-completion.md) | Skill、桌面编辑、制作交付及异常恢复的最终闭环 |
| [能力验收](acceptance-coverage.md) | 共享制作与媒体能力 |
| [架构升级验收](acceptance-v2.md) | 混合场景、模型与制作链 |
| [Agent 制作与交付验收](acceptance-agent-delivery.md) | 外部 agent 制作、交付与复盘 |
| [桌面客户端验收](acceptance-desktop.md) | 桌面运行与平台范围 |
| [模型预设与本地安装验收](acceptance-model-setup.md) | 模型安装、配置与运行条件 |
| [引擎运行时安装验收](acceptance-engine-setup.md) | 原生运行库、llama-server 与 Python 环境的下载校验与采用 |
| [强制对齐和检索验收](acceptance-alignment-search.md) | 对齐、检索与重排 |
| [连续影视素材验收](acceptance-long-form.md) | 长素材、取消和恢复 |
| [全片精确对齐根因与验收](acceptance-alignment-root-cause.md) | 全片对齐缺陷与修复证据 |
| [编辑与恢复验收](acceptance-editing-recovery.md) | 保存、冲突、草稿和遮罩 |

这些文档记录的是特定环境下的阶段性验收结果（其中部分历史文档提到的独立安装包记录仅供参考，目前统一通过源码工作区交付）。它们不代表未测平台一定可用，也不作为模型主观效果或第三方剪辑软件全部版本的兼容性保证。
