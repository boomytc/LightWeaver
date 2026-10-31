# 运行与开发 LightWeaver

本文用于运行源代码、修改实现和构建桌面包。操作界面与模型配置见[用户指南](user-guide.md)，完整 CLI 与运行合同见[命令与配置参考](conventions.md)。

## 准备源码环境

使用 Node.js 22.13 及以上的 22.x 版本，或 24.x。Node 安装需包含 npm。在仓库根目录安装锁定依赖：

```sh
npm ci
```

拉取代码后如果依赖发生变化，重新运行 `npm ci`。切换 Node 主版本后也重新安装，使原生依赖匹配当前 Node。

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

浏览器访问 `http://127.0.0.1:5175/`。在启动终端按 Ctrl+C 结束浏览器服务。运行源码桌面时保留启动终端，通过应用菜单退出。

浏览器模式默认使用仓库 `data/.weaver/`。桌面模式默认使用系统用户目录，实际位置在设置页可查。

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

首次构建下载固定版本的 Node、FFmpeg、Chrome 和交接 Python，并安装独立 sidecar 依赖。构建不下载模型权重。资源缓存在 `products/desktop/staging/`，产物位于 `products/desktop/release/`。

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

源码配置可从 `config.local.yaml.example` 复制到忽略的 `config.local.yaml`，保留已有配置。环境变量优先。密钥也可通过设置页保存，CLI 更新配置使用文件输入，避免把密钥写入命令参数。

## 修改实现与完成验收

修改前读取根目录及目标产品的 `AGENTS.md`。共享核与 CLI 位于 `weaver/`，React 界面位于 `products/studio/`，Electron 宿主位于 `products/desktop/`，无声卡片渲染位于 `products/study-films/`。

执行相关静态检查：

```sh
npm run typecheck
npm run build -w @lightweaver/studio
```

卡片预览使用 `npm run studio -w @lightweaver/study-films`。已安装 make 的环境也可使用根目录 Makefile 中的快捷命令。

本仓采用 `confident-development-conventions`。按改动完成有限验收，结束后清理本次创建的临时脚本、mock、样本与自启服务。保留产品诊断、schema 校验、模块边界和类型检查。

职责与设计说明见[架构说明](architecture-v2.md)。模型与媒体能力的既有证据见[能力验收](acceptance-coverage.md)、[模型安装验收](acceptance-model-setup.md)及[全片精确对齐验收](acceptance-alignment-root-cause.md)。
