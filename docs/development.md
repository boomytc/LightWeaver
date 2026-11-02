# 运行与开发 LightWeaver

本文用于运行源代码、修改实现和构建桌面包。操作界面与模型配置见[用户指南](user-guide.md)，完整 CLI 与运行合同见[命令与配置参考](conventions.md)。

## 准备源码环境

使用 Node.js 22.13 及以上的 22.x 版本，或 24.x。Node 安装需包含 npm。在仓库根目录安装锁定依赖：

```sh
npm ci
```

拉取代码后如果依赖发生变化，重新运行 `npm ci`。切换 Node 主版本后也重新安装，使原生依赖匹配当前 Node。

本地模型与引擎按需准备，不随源码或桌面包分发。引擎（transcribe 运行库、bindings、TEN VAD、llama-server、Python 环境）安装到默认的 `weaver/runtime/`，该目录不进入 Git：

```sh
npx weaver models settings get --json   # 取当前 revision
npx weaver engines setup --expected-revision CONFIG_REV --wait --progress
npx weaver engines setup --with-models --expected-revision CONFIG_REV --wait --progress
```

`engines setup` 会按顺序下载、校验 transcribe 运行库、bindings、TEN VAD、llama-server 与模型 Python 环境，并一次写入配置；已校验的部分在重跑时复用。必需组件失败即作业失败，可选组件失败会在采用结果里列在 `skipped` 并继续写配置。`--with-speech` 额外创建语音 Python 环境，`--with-models` 额外下载并采用本地模型权重。空间不足时在开始前返回 `DISK_SPACE_INSUFFICIENT`。也可以在 **设置 → 运行时与路径 → 本地运行环境** 点击 **一键下载并配置**。不同平台的引擎目录不同，迁移仓库时重新安装；引擎根目录可在高级设置或 `engine_install_root` 中修改。

媒体功能按用途准备工具：

- 普通视频制作需要 PATH 中的 FFmpeg 与 ffprobe，也可通过 `LIGHTWEAVER_FFMPEG`、`LIGHTWEAVER_FFPROBE` 指定绝对路径。
- 卡片制作与网页捕获需要 Chrome。可通过 `LIGHTWEAVER_CHROME` 指定可执行文件。
- bundle、OTIO 与剪映交接需要 Python 3.12 和 `weaver/requirements.txt` 中的依赖。
- 本地模型另需权重、模型 Python 环境及对应运行库。API 画面观察与 API TTS 按供应商配置使用。

普通媒体工具与交接 Python 已包含在构建后的桌面包中。源码环境按上述用途准备。

需要交接功能时，用独立环境安装依赖。macOS 与 Linux 执行：

```sh
python3.12 -m venv weaver/.venv
weaver/.venv/bin/python -m pip install -r weaver/requirements.txt
export LIGHTWEAVER_PYTHON="$PWD/weaver/.venv/bin/python"
```

Windows PowerShell 执行：

```powershell
py -3.12 -m venv weaver/.venv
& .\weaver\.venv\Scripts\python.exe -m pip install -r weaver/requirements.txt
$env:LIGHTWEAVER_PYTHON = (Resolve-Path .\weaver\.venv\Scripts\python.exe).Path
```

在同一终端继续启动应用，使 `LIGHTWEAVER_PYTHON` 生效。本地模型环境安装见[模型运行约定](conventions.md#模型边界)。

## 启动桌面或浏览器界面

启动源码桌面窗口：

```sh
npm start
```

根目录的 `start.command`、`start.cmd` 和 `start.sh` 使用同一入口。该入口检查 Node 与必要依赖，随后复用现有桌面开发命令，编译主进程和 preload，启动 Electron、Vite 与本地服务。运行 `npm start -- --help` 查看启动说明。

直接运行工作区命令也可启动桌面开发环境：

```sh
npm run dev -w @lightweaver/desktop
```

需要浏览器界面时执行：

```sh
npm run dev -w @lightweaver/studio
```

浏览器访问 `http://127.0.0.1:5175/`。在启动终端按 Ctrl+C 结束浏览器服务。运行源码桌面时保留启动终端，通过应用菜单退出，或关闭窗口后选择 **停止后台并退出**。选择 **后台运行** 会保留服务，可从系统托盘恢复窗口。

浏览器模式默认使用仓库 `data/.weaver/`。桌面模式默认使用系统用户目录，实际位置在设置页可查。源码桌面的私有配置默认是仓库根 `config.local.yaml`，与仓库 CLI、浏览器 Studio 相同；正式包使用用户目录中的 `config.local.yaml`。

桌面数据目录默认如下：

| 系统 | 数据目录 |
| --- | --- |
| macOS | `~/Library/Application Support/LightWeaver/weaver` |
| Windows | `%APPDATA%\LightWeaver\weaver` |
| Linux | `~/.config/LightWeaver/weaver` |

Linux 设置了 `XDG_CONFIG_HOME` 时，使用该目录下的 `LightWeaver/weaver`。`LIGHTWEAVER_USER_DATA` 可隔离整个桌面用户目录。源码 CLI 与浏览器模式可通过 `LIGHTWEAVER_DATA_DIR` 或 `--data-dir` 指定数据目录。

## 构建桌面包

在对应系统与架构的主机执行：

```sh
npm run package -w @lightweaver/desktop
```

首次构建下载固定版本的 Node、FFmpeg、Chrome 和交接 Python，并安装独立 sidecar 依赖。构建不下载模型权重或引擎；正式包首次使用引擎时按用户操作下载到数据目录的 `runtime/`。资源缓存在 `products/desktop/staging/`，产物位于 `products/desktop/release/`。

打包会重新生成对应目标的应用目录。打包前保存草稿，并退出运行在该目录中的应用。

显式目标与可运行产物如下：

| 目标 | 主机 | 产物 |
| --- | --- | --- |
| `darwin-arm64` | macOS Apple Silicon | `products/desktop/release/mac-arm64/LightWeaver.app` |
| `darwin-x64` | macOS Intel | `products/desktop/release/mac/LightWeaver.app` |
| `win32-x64` | Windows x64 | `products/desktop/release/win-unpacked/LightWeaver.exe` |
| `linux-x64` | Linux x64 | `products/desktop/release/linux-unpacked/LightWeaver` |

例如，在对应主机运行 `npm run package:win32-x64 -w @lightweaver/desktop`。不支持的目标或跨宿主构建在准备资源前失败。平台实测范围见[桌面客户端验收](acceptance-desktop.md)。

需要安装分发包时执行：

```sh
npm run dist -w @lightweaver/desktop
```

分发目标为 macOS DMG 与 ZIP、Windows NSIS、Linux AppImage。这些命令不包含签名或公证。打包流程检查最终包中的文件摘要、原生架构与 SQLite 运行查询。

## 使用 CLI 与外部 agent 协作

仓库技能位于 `.agents/skills/`，包括 `lightweaver`、`lightweaver-film` 和 `lightweaver-assets`。在本仓使用 Codex 时可按名称选择；从总入口开始确定桌面或源码工作区。技能发现位置遵循 [Codex 官方说明](https://learn.chatgpt.com/docs/build-skills#where-codex-loads-local-skills)。

源码环境从能力与合同发现开始：

```sh
npx weaver capabilities --json
npx weaver doctor --json
npx weaver help --json
npx weaver schema ops --json
```

创建项目并检查制作计划：

```sh
npx weaver project create demo --workflow study-explainer --json
npx weaver project show demo --json
npx weaver build --project demo --plan --json
```

写入携带当前修订的 `expectedRevision` 和逻辑请求的 `requestId`。素材导入、方案采用、制作、分析和交接的完整命令见[命令与配置参考](conventions.md)。

桌面包自带 `bin/weaver`，Windows 为 `bin/weaver.cmd`。在应用的 **设置 → 运行时与路径 → 外部 agent 与命令行** 中复制实际调用路径。随包 CLI 默认读取桌面的配置与数据，也可用 `--data-dir`、`--config-file`、`--config-base` 显式指定。

先用所选入口执行 `capabilities --json`，核对 `runtime.dataDir` 和 `runtime.configFile`。返回的 `agentSkills` 提供与该运行时配套的技能文件，`runtime.resourcesDir` 下包含 AGENTS.md 和命令参考。正式包内的技能可按路径交给 agent 读取，不会自动写入个人技能目录。

`npm start` 启动的源码桌面默认读取仓库根 `config.local.yaml`，配置基准同为仓库根，与浏览器 Studio 和仓库 CLI 一致；数据目录仍使用系统用户目录。若用仓库 CLI 协作源码桌面，显式指定设置页中的数据目录：

```sh
npx weaver capabilities --data-dir /absolute/desktop-data --json
```

在设置页绑定过其它配置文件后，再按设置页显示的路径补上 `--config-file`、`--config-base`。后续命令保持这些参数，并沿用启动桌面时的工具环境。浏览器开发模式与仓库 CLI 默认使用 `data/.weaver/` 作为数据目录。

制作完成后，用 `export --project ID --format video --dest /absolute/movie.mp4` 交付视频。先用 `artifacts --project ID` 查看交付，按需要传 `--delivery ID` 选择旧版本。用 `artifact show DIGEST` 读取 manifest 或 receipt，历史修订使用 `project show ID --revision REV`。这些命令均支持 `--json`。

仓库根的 `config.yaml` 是源码环境的内置默认值，并随桌面包复制到 `resources/config.yaml`。其中 API Key 字段保持空字符串；私有凭据写入忽略的 `config.local.yaml` 或通过设置页保存，CLI 更新配置使用文件输入，避免把密钥写入命令参数。源码入口（仓库 CLI、浏览器 Studio、源码桌面）共用仓库根这份 `config.local.yaml`；正式包的私有配置位于系统用户配置目录中的 `LightWeaver/config.local.yaml`。

源码模式的默认模型下载目录是 monorepo 根目录下的 `models/`，该目录已忽略；源码不读取也不写入 `weaver/models/`（旧版布局），设置页显示的“模型目录”也是同一个路径。源码桌面也使用这个下载目录；正式安装包使用用户模型目录。已有权重不会自动搬迁，可在设置中选择现有路径。

配置值按 `config.local.yaml`、环境变量、内置 `config.yaml` 的顺序生效，空或纯空白值视为未设置。设置页保存密钥后立即生效，无需重启；清除本地配置中的密钥后，会回退到同名环境变量，未设置则显示未配置。绑定已有配置时，该文件继续作为私有本地配置，相对路径仍按它的所在目录解析。

## 修改实现与完成验收

修改前读取根目录及目标产品的 `AGENTS.md`。共享核与 CLI 位于 `weaver/`，React 界面位于 `products/studio/`，Electron 宿主位于 `products/desktop/`，无声卡片渲染位于 `products/study-films/`。

执行相关静态检查：

```sh
npm run typecheck
npm run build -w @lightweaver/studio
```

卡片预览使用 `npm run studio -w @lightweaver/study-films`。已安装 make 的环境也可使用根目录 Makefile 中的快捷命令。

本仓采用 `confident-development-conventions`。按改动完成有限验收，结束后清理本次创建的临时脚本、mock、样本与自启服务。保留产品诊断、schema 校验、模块边界和类型检查。

职责与设计说明见[架构说明](architecture-v2.md)。当前端到端闭环与异常恢复证据见[功能收尾验收](acceptance-completion.md)，视频交付、素材来源和技能的既有证据见[Agent 制作与交付验收](acceptance-agent-delivery.md)。模型与媒体能力的既有证据见[能力验收](acceptance-coverage.md)、[模型安装验收](acceptance-model-setup.md)及[全片精确对齐验收](acceptance-alignment-root-cause.md)。
