# 运行与开发 LightWeaver

LightWeaver 以源码工作区方式交付。你可以按下面的步骤自己准备本机环境，也可以让 WorkBuddy 阅读本指南完成安装后，再启动桌面窗口。日常界面操作见[用户指南](user-guide.md)，完整 CLI 参数与协议见[命令与配置参考](conventions.md)。

## 首次安装

1. **准备 Node.js**：安装 Node.js 22.13 及以上的 22.x 版本，或 24.x 版本（需包含 npm）。
2. **准备媒体工具与浏览器**：安装 FFmpeg、ffprobe 和 Google Chrome。请确保 `ffmpeg` 和 `ffprobe` 已加入系统 `PATH`；Chrome 在 macOS 默认识别 `/Applications/Google Chrome.app`，若安装到其他路径，可通过环境变量 `LIGHTWEAVER_CHROME` 指定可执行文件路径。
3. **安装 Node 依赖**：在工作区根目录执行：
   ```sh
   npm ci
   ```
   （也可以使用 `make install`，两者都按 `package-lock.json` 安装 Electron 与各工作区依赖。）
4. **按需准备 Python 与本地模型**（仅在使用本地转写、精确对齐、语义/视觉检索，或导出 OTIO / 剪映交接包时需要；纯卡片制作无需此步骤）：
   准备好 Python 3.12 后，在工作区根目录依次初始化运行组件并检查状态：
   ```sh
   npx weaver models settings get --json
   npx weaver engines setup --expected-revision CONFIG_REV --wait --json
   npx weaver models list --json
   ```
   其中 `CONFIG_REV` 填入上一条命令返回的 `revision`。确认要安装的模型 ID（例如 `qwen3-asr`、`embeddinggemma-2`、`qwen3-forced-aligner`）后，按需要安装并自检（如果依次安装多个模型，每次前请重新执行 `models settings get --json` 获取最新 `revision`）：
   ```sh
   npx weaver models install MODEL_ID --expected-revision CONFIG_REV --wait --json
   npx weaver doctor --json
   ```

`engines setup` 会自动下载并校验 `transcribe` 原生运行库、Python bindings、TEN VAD、`llama-server` 以及独立的共享 Python 虚拟环境；`models install` 会下载、校验并启用指定模型权重（同时补齐缺少的运行组件）。已有的有效文件会自动复用。默认情况下，运行组件存放在 `data/engines/`，模型权重存放在 `data/models/`。云端供应商的 API Key 不随源码提供，请在应用的 **设置 → 模型与供应商** 中自行填写。

**平台说明**：macOS 支持 Apple Silicon（M 系列芯片），完整本地模型功能需要 macOS 14 或更新版本（不支持 Intel Mac）。更多平台与打包实测记录见[桌面客户端验收](acceptance-desktop.md)。

## 启动应用

在工作区根目录运行：

```sh
npm start
```

也可以直接使用根目录的系统启动脚本，或运行 `make desktop`（它们都走同一入口）：
- macOS：双击 `start.command`
- Windows：双击 `start.cmd`
- Linux：在终端运行 `./start.sh`

启动入口会检查 Node 版本与核心依赖，编译桌面端主进程与 preload 脚本，然后拉起 Electron 窗口、Vite 开发服务和独立 Node 业务服务。

- **运行期间请保持启动终端开启**。关闭窗口时，如果没有进行中的任务，应用会处理好未保存草稿并安全退出；如果有制作或下载任务正在进行，可以选择 **后台运行**（隐藏窗口并保留系统托盘图标）或 **停止后台并退出**。
- **仅启动浏览器界面**：如果你更希望在浏览器中调试 Studio，可运行 `make studio`，随后访问 `http://127.0.0.1:5175/`，在终端按 `Ctrl+C` 停止。
- **依赖变更后**：如果拉取代码后依赖有更新，或切换了 Node 主版本，请重新执行一次 `npm ci`。

## 共享源码工作区

需要把当前仓库打包发给其他人时，先确保要分享的改动都已提交，然后在根目录执行：

```sh
make source-zip
```

打包完成后发送生成的 `out/LightWeaver-source.zip` 即可。该命令内部调用 `git archive HEAD`，只包含已提交的源码、`package-lock.json`、内置资源和 `.agents/skills/`，不会把 Git 历史、私有配置（`config.local.yaml`）、个人项目数据、已下载模型、Python 环境、`node_modules` 或构建缓存带进压缩包；未提交的修改也不会进入其中。

> **注意**：不要直接压缩整个日常工作目录，否则不仅体积巨大，还可能把本地 API Key 和个人项目一起发出去。接收方解压后，按上面的“首次安装”步骤准备本机环境即可。

## 使用 CLI 与外部 agent 协作

工作区的 `.agents/skills/` 目录下内置了三份配套技能：`lightweaver`（总入口）、`lightweaver-film`（电影制作与修订）和 `lightweaver-assets`（素材与库管理）。让外部 agent 先读总入口技能，再按任务读取对应技能即可。

在工作区根目录可以直接调用 CLI 自检：

```sh
npx weaver capabilities --json
npx weaver doctor --json
npx weaver help --json
```

当你需要让外部 agent 协助修改**桌面应用中的项目**时，请使用 Studio 项目右上角 **更多 → 复制给 agent** 得到的完整命令。这个命令里已经写好了 Node、源码 CLI 入口（`weaver/bin/weaver.mjs`）的绝对路径，以及桌面端正在使用的 `--data-dir`、`--config-file` 和 `--config-base`，即使在工作区外调用也能准确命中同一份项目数据。`capabilities --json` 返回的 `agentSkills` 会直接给出当前工作区下各技能文件的路径（按路径读取即可，不会往全局个人目录写文件）。

- **数据目录差异**：CLI 与浏览器模式（`make studio`）默认把项目存在工作区下的 `data/.weaver/`；桌面应用则默认把项目数据和偏好存在系统用户配置目录（例如 macOS 的 `~/Library/Application Support/LightWeaver/weaver`，可在 **设置 → 存储** 中查看或更换）。因此在桌面与 agent 协作时，务必沿用 **复制给 agent** 给出的完整命令，避免两边读写不同的数据目录。开发测试桌面端时，也可通过环境变量 `LIGHTWEAVER_USER_DATA` 指定隔离的用户目录。
- **配置优先级**：三个入口默认共用工作区根目录的 `config.local.yaml`（只保存模型路径、模型选择和 API 凭据），内置默认配置在 `config.yaml`。生效优先级为：`config.local.yaml` > 环境变量 > `config.yaml`。运行组件（如 Python、FFmpeg、Chrome、`llama-server` 等）默认由受管安装自动解析；开发调试时如需临时覆盖可执行文件路径，请直接设置对应的环境变量（如 `LIGHTWEAVER_CHROME`、`LIGHTWEAVER_PYTHON`、`LIGHTWEAVER_FFMPEG` 等），不需要改写模型配置文件。

## 修改实现与完成验收

修改代码前，请先阅读根目录以及目标模块下的 `AGENTS.md`：
- 共享核与 CLI：`weaver/`
- Studio 编辑界面：`products/studio/`
- Electron 桌面宿主：`products/desktop/`
- 无声卡片渲染器：`products/study-films/`

完成代码改动后，运行以下检查确认边界、类型与前端构建无误：

```sh
npm run typecheck
npm run build -w @lightweaver/studio
```

本仓库遵循 `confident-development-conventions`：按实际改动范围执行有限验收，临时脚本、测试数据和合成媒体放到系统临时目录并在结束后清理；同时保留产品自带的诊断检查、schema 校验与类型检查。
