# LightWeaver 文档

按当前任务选择入口。运行合同和运行时 schema 是事实来源，教程和样例帮助完成操作。

## 用户

| 文档 | 内容 |
| --- | --- |
| [制作第一部短片](quickstart.md) | 从内置文字卡片示例完成制作与 MP4 导出 |
| [用户指南](user-guide.md) | 界面操作、模型配置、保存恢复、导出与协作 |
| [场景、时长与采用](concepts.md) | card、still、clip 的时长规则，旁白超窗和创作方案采用 |
| [命令与配置参考](conventions.md) | 数据位置、CLI、分析和制作合同 |

零模型路径使用首页示例或 `project create <id> --sample`。不需要 API 密钥、模型权重或自备媒体。

## Agent

Agent 从项目 **复制给 agent** 或 `project brief <id>` 取得完整调用入口。该入口包含绝对 Node 与源码 CLI 路径，或随包 CLI 路径，并带有实际 `dataDir`、配置文件与配置基准目录。

- [LightWeaver 入口选择](../.agents/skills/lightweaver/SKILL.md)
- [电影制作](../.agents/skills/lightweaver-film/SKILL.md)
- [素材与库](../.agents/skills/lightweaver-assets/SKILL.md)

不要在未知数据目录上运行裸 `weaver`。先用 `capabilities` 核对运行时，再用 `project context` 读取当前修订、素材、证据与候选。CreativePlan 可以通过 `import` 保存待审方案，并由 `apply` 显式采用。创作方案不是所有任务的必选步骤；已确认的场景也可以直接通过 `project apply` 保存。

`schema` 返回运行时 Zod 合同生成的 JSON Schema。样例文件只展示合法结构，项目标识、素材标识、摘要和证据必须按当前项目替换。

## 开发

| 文档 | 内容 |
| --- | --- |
| [运行与开发](development.md) | 源码环境、启动、构建、CLI 和验证入口 |
| [架构说明](architecture-v2.md) | 修订、素材、作业、时间轴和交付的实现边界 |
| [命令与配置参考](conventions.md) | 公开入口、数据结构、工具和运行合同 |

## 验收

| 文档 | 范围 |
| --- | --- |
| [能力验收](acceptance-coverage.md) | 共享制作与媒体能力 |
| [架构升级验收](acceptance-v2.md) | 混合场景、模型与制作链 |
| [Agent 制作与交付验收](acceptance-agent-delivery.md) | 外部 agent 制作、交付与复盘 |
| [桌面客户端验收](acceptance-desktop.md) | 桌面运行与平台范围 |
| [模型预设与本地安装验收](acceptance-model-setup.md) | 模型安装、配置与运行条件 |
| [强制对齐和检索验收](acceptance-alignment-search.md) | 对齐、检索与重排 |
| [连续影视素材验收](acceptance-long-form.md) | 长素材、取消和恢复 |
| [全片精确对齐根因与验收](acceptance-alignment-root-cause.md) | 全片对齐缺陷与修复证据 |
| [编辑与恢复验收](acceptance-editing-recovery.md) | 保存、冲突、草稿和遮罩 |

验收文档记录特定环境下的证据。它们不证明未列出的平台、模型质量或交付软件兼容性。
