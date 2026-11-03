# LightWeaver

LightWeaver 是桌面视频制作工具。把已有视频、图片、旁白和字幕组织成片，在 Studio 中编辑与预览，再导出成片或可继续精修的项目。

可用于静帧讲解、多源剧情解说、原声高光混剪、文案找镜头和参考片匹配。同一项目可混用文字卡片、图片和视频片段，也可与外部 agent 协作编写与审核创作方案。

## 第一次做片

桌面首页提供一个由三张文字卡片组成的示例。每张卡片固定 90 帧，在默认 30 fps 输出中为 3 秒。打开示例后修改文字，点击 **保存并制作**，再从任务完成提示进入 **交付** 导出 MP4。项目已经保存时，按钮显示为 **制作**。这条路径不需要模型、API 密钥或自备素材。

先让 WorkBuddy 按[运行指南](docs/development.md)准备 Node.js、FFmpeg、ffprobe 和 Chrome，再从源码启动。

完整的界面步骤见[制作第一部短片](docs/quickstart.md)。卡片、静帧、视频片段和创作方案的时长关系见[场景、时长与采用](docs/concepts.md)。

## 选择入口

| 你想做什么 | 从哪里开始 |
| --- | --- |
| 找到某类文档 | [文档导航](docs/README.md) |
| 从示例走完成片与导出 | [快速上手](docs/quickstart.md) |
| 使用界面、配置模型、保存与恢复项目 | [用户指南](docs/user-guide.md) |
| 理解场景时长与创作方案 | [核心概念](docs/concepts.md) |
| 安装环境、启动与共享源码 | [运行指南](docs/development.md) |
| 使用 CLI 或接入外部 agent | [协作入口与工作区选择](docs/development.md#使用-cli-与外部-agent-协作) |
| 查看功能与平台的验收范围 | [验收文档](docs/README.md#验收) |

## 产品与运行边界

项目修订保存创作内容。制作生成冻结当前修订、素材、库和工具版本的交付。导出把已验证的交付复制到目标文件。保存项目不会改写已有视频，重新制作也不会覆盖已导出的文件。

模型分析与语音合成为可选能力。画面观察、语音合成、本地转写、精确字幕和检索按需配置。普通卡片制作、项目保存、交付查看和已有视频导出不需要模型。

通过源码工作区交付，接收方由 WorkBuddy 准备本机环境。macOS 仅支持 Apple Silicon（M 系列芯片），完整本地模型功能要求 macOS 14 或更新版本；不支持 Intel Mac。平台实测范围见[桌面客户端验收](docs/acceptance-desktop.md)。

## 从源码启动

准备 Node.js 22.13 及以上的 22.x 版本，或 24.x。在项目目录首次安装依赖：

```sh
npm ci
```

安装完成后，选择当前系统的启动入口：

- macOS：双击根目录的 `start.command`。
- Windows：双击根目录的 `start.cmd`。
- Linux：在终端运行 `./start.sh`。
- 已打开终端：运行 `npm start`。

脚本启动桌面窗口。窗口出现后即可创建项目。可把以下任务交给对方的 WorkBuddy：

> 阅读本工作区的 README.md 和 docs/development.md，准备所需环境，按 lockfile 安装依赖，按我选择的功能配置模型，执行 doctor 检查，然后用 npm start 启动 LightWeaver。

共享源码时运行 `make source-zip`，发送 `out/LightWeaver-source.zip`。压缩包只包含已提交文件，内含 `.agents/skills/`；私有配置、运行数据、模型、虚拟环境和 `node_modules` 不会带入。

## 配置所需能力

在 **设置 → 模型与供应商** 中为 ModelBest 保存 API Key，默认使用 MiniCPM-V-4.7-35B-A3B 观察画面、VoxCPM2 合成语音。本地转写、精确字幕与检索选择对应模型，点击 **下载并启用**。应用自动准备缺失依赖、校验权重并启用，无需填写运行库或 Python 路径。

模型推理、语音合成和项目交接共用一套 Python 环境，由 WorkBuddy 通过现有引擎安装命令准备。模型权重按需下载或选择已有目录。

配置值按私有本地配置文件、环境变量、内置 `config.yaml` 默认值的顺序生效，空或纯空白值视为未设置。桌面设置中保存的密钥会立即生效；内置默认文件只保留空密钥，私有凭据写入 Git 忽略的 `config.local.yaml`。

项目支持导出视频、LightWeaver bundle、OTIO 和剪映草稿。保存与恢复、数据位置、CLI 输出和故障处理见[用户指南](docs/user-guide.md)。
