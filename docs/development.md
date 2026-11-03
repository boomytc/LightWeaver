# 运行与开发 LightWeaver

LightWeaver 通过源码工作区交付。接收方可让 WorkBuddy 阅读本文完成安装，再用启动脚本打开桌面窗口。界面操作见[用户指南](user-guide.md)，CLI 合同见[命令参考](conventions.md)。

## 首次安装

1. 准备 Node.js 22.13 及以上的 22.x，或 24.x，包含 npm。
2. 准备 FFmpeg、ffprobe 和 Chrome。FFmpeg 与 ffprobe 放入 PATH；macOS 默认识别 `/Applications/Google Chrome.app`，其它位置用 `LIGHTWEAVER_CHROME` 指定。
3. 在工作区根目录执行 `npm ci`，按 lockfile 安装 Electron 和项目依赖。
4. 需要本地模型或项目交接时，准备 Python 3.12，再通过下列命令创建共用环境和运行组件。

```sh
npx weaver models settings get --json
npx weaver engines setup --expected-revision CONFIG_REV --wait --json
npx weaver models list --json
```

`CONFIG_REV` 使用第一条命令返回的当前配置 revision。按需要选择模型，再重新读取配置 revision 并安装：

```sh
npx weaver models install MODEL_ID --expected-revision CONFIG_REV --wait --json
npx weaver doctor --json
```

`engines setup` 准备 transcribe 运行库、bindings、TEN VAD、llama-server 和共享 Python。`models install` 下载、校验并启用指定模型，也会准备缺少的运行组件。已有有效安装可复用；组件默认在 `data/engines/`，权重在 `data/models/`。API Key 由使用者在设置中填写，不随源码交付。

普通卡片制作不需要模型或 Python。macOS 支持 M 系列芯片，完整本地模型功能要求 macOS 14 或更新版本；不支持 Intel Mac。其它平台的历史验证范围见[桌面客户端验收](acceptance-desktop.md)。

## 启动应用

```sh
npm start
```

也可双击根目录的 `start.command`（macOS）、`start.cmd`（Windows），或运行 `./start.sh`（Linux）。入口检查 Node 和项目依赖，编译主进程与 preload，再启动 Electron、Vite 和独立 Node 服务。`make desktop` 使用同一入口。

运行时保留启动终端。关闭窗口时，没有进行中任务会处理草稿并退出；有任务时可选择后台运行，从系统托盘恢复窗口。通过应用菜单退出也会处理草稿与任务。

需要浏览器界面时运行 `make studio`，访问 `http://127.0.0.1:5175/`；在启动终端按 Ctrl+C 结束。

依赖变化或切换 Node 主版本后重新运行 `npm ci`。

## 共享源码工作区

提交修改后执行：

```sh
make source-zip
```

发送 `out/LightWeaver-source.zip`。它由 `git archive HEAD` 生成，只包含已提交源码、lockfile、内置资源和 `.agents/skills/`，不含 Git 历史、私有配置、用户数据、模型、环境、依赖或构建产物。未提交的修改不会进入压缩包。

接收方解压后，让 WorkBuddy 按“首次安装”准备本机环境。不要直接压缩整个日常工作目录，其中可能含有密钥、个人项目和大量依赖。

## 使用 CLI 与外部 agent 协作

`.agents/skills/` 内含 `lightweaver`、`lightweaver-film` 和 `lightweaver-assets`。先读总入口，再按任务读取电影制作或素材管理技能。

在工作区根目录执行：

```sh
npx weaver capabilities --json
npx weaver doctor --json
npx weaver help --json
```

与桌面中的项目协作时，从项目 **复制给 agent** 取得完整命令。它包含绝对 Node 与源码 CLI 路径，以及实际数据目录和配置参数，离开工作区后仍能调用同一项目。`capabilities.agentSkills` 返回本工作区的技能路径；技能按路径读取，不自动写入个人技能目录。

CLI 与浏览器默认使用 `data/.weaver/`。桌面保留系统用户目录中的数据与偏好，实际位置可在设置中查看；协作时沿用复制出的完整命令，避免操作另一份数据。`LIGHTWEAVER_USER_DATA` 可隔离桌面用户目录。

三个入口默认共用工作区根的 `config.local.yaml`。其中只保存模型路径、模型选择和 API 凭据；默认值在 `config.yaml`。配置按本地文件、环境变量、默认值的顺序生效。组件通过受管安装解析，开发覆盖使用环境变量，不写入模型配置。

## 修改实现与完成验收

修改前读取根目录与目标产品的 `AGENTS.md`。共享核与 CLI 位于 `weaver/`，界面位于 `products/studio/`，Electron 宿主位于 `products/desktop/`，卡片渲染位于 `products/study-films/`。

```sh
npm run typecheck
npm run build -w @lightweaver/studio
```

本仓采用 `confident-development-conventions`。按改动完成有限验收，清理临时脚本、样本和自启服务。保留产品诊断、schema 校验、模块边界和类型检查。
