# 引擎安装、校验与采用验收

2026-11-02，基线 `7d1d157`。本轮新增引擎清单、一键下载/校验/采用、独立 Python 环境、Studio 引擎设置，以及随后的可选组件部分成功、磁盘预检、更新提示、引擎根目录编辑、语音环境与模型权重选项、能力诊断与跨平台产物验证。

## 交付范围

- 引擎清单固定 6 个组件：transcribe.cpp 运行库 0.2.0（5 个平台）、transcribe Python bindings 0.2.0、TEN VAD（revision `d68ab71c8d5f`，4 个平台）、llama.cpp `llama-server` b12032（4 个平台）、模型 Python 环境、语音 Python 环境。归档固定 URL、字节数与 SHA-256；本平台组件 `available=true`，未固定平台按清单标注不可用。
- 一键配置（CLI `weaver engines setup`、`POST /api/engines/setup`、Studio 单个主按钮）：依次安装 transcribe 运行库、bindings、TEN VAD（必需），llama-server、模型 Python 环境（可选），最后重新校验并一次写入配置，用户不需要指定路径。默认关闭的 `includeSpeech`/`includeModels`（CLI `--with-speech`/`--with-models`）可把语音 Python 环境与 ASR/EmbeddingGemma/ForcedAligner 权重纳入同一作业。
- 必需组件失败时作业失败、不写配置；可选组件失败只返回在采用节点的 `skipped` 中并继续写配置，Studio 显示“部分组件未完成，可重试”。已校验的组件在重跑时复用。
- 下载前按未安装组件的 `estimatedBytes` 与模型剩余字节估算空间，引擎根目录可用空间不足时直接返回 `DISK_SPACE_INSUFFICIENT`，不启动下载。
- 已安装版本与当前发布不同时 `engines list` 返回 `updates`，Studio 显示“可更新组件”，一键配置会下载新版本、替换本应用管理的目录并重新采用。
- 源码模式产物目录统一放在仓库根 `data/`：模型 `data/models/`、引擎 `data/engines/`（含其下的 Python 环境）；正式桌面包使用运行时数据目录下的同名子目录。引擎安装根目录取 `engine_install_root`（环境变量 `LIGHTWEAVER_ENGINE_ROOT`），可在高级设置中修改；已安装目录不会自动搬迁。
- 安装走 Jobs：下载 → 解压 → 逐文件校验 → 原子发布。目标目录没有本应用标记时拒绝覆盖；取消后删除环境/暂存，不发布半成品。Python 环境按 requirements 创建 venv 并 pip 安装，版本取清单 SHA-256 前 12 位。
- 入口：CLI `weaver engines setup|list|install|verify|use`；HTTP `GET /api/runtime`、`GET /api/engines`、`POST /api/engines/setup`、`POST /api/engines/:id/{install,verify,use}`；Studio“本地运行环境”与高级引擎分组。
- 设置分区收敛为“模型与供应商 / 运行环境 / 外观”：“本地运行环境”“存储与路径”（含数据目录更换与工具状态）与“诊断及应用信息”合并为“运行环境”一个分区，旧存储/诊断入口映射到该分区。
- 任务与诊断入口：任务页显示“本地运行环境配置/引擎安装”，节点显示可读组件名、完成计数与 `skipped`，并提供“打开运行环境”；模型页在运行条件缺失时提供“配置运行环境”；合并后的“运行环境 → 诊断及应用信息”按统一分类显示“本应用安装 X/5 · 使用外部路径 Y · 未配置 Z”。`capabilities` 与 `doctor` 返回引擎摘要：`ready` 表示全部本地能力组件已安装并采用，`coreReady` 只要求 transcribe 运行库、bindings 与 TEN VAD。
- TEN VAD 从模型清单迁入引擎清单，设置项 `vad_library` 语义不变。

## 实际验收

- 默认一键配置（隔离环境、全新目录）：单个作业包含 5 个安装节点与 1 个采用节点，用时 73.25 秒，全部 succeeded；transcribe-native 0.2.0、bindings 0.2.0、ten-vad `d68ab71c8d5f`、llama-server b12032（探测 `0.8.0-dev build 12032 commit dde879bc4`）、python-model `f7bf37ba2e9d`（`Python 3.12.2`）；采用结果 `adopted=[5], skipped=[]`，一次写入 `asr_library`、`asr_bindings`、`vad_library`、`visual_server`、`llama_server`、`translation_server`、`model_python` 七项。同环境再次执行 0.30 秒完成，无下载/解压/安装事件。
- 部分成功：预置无标记的 `python-model/keep.txt` 后一键配置仍 succeeded（7.31 秒），`install-python-model` 返回 `skipped` 与可读原因；采用节点 `skipped` 列出该组件，配置写入其余 6 项且不含 `model_python`；预置文件原样保留。
- 同时下载模型权重：把本机已有 ASR、EmbeddingGemma 2、ForcedAligner 以硬链接放入独立 models 根后执行 `--with-models`，3 个 model-download 节点 succeeded/verified 且复用（无下载进度事件，硬链接 inode 未变），采用结果包含 `model:*`，配置增加 `asr_model`、`visual_model`、`visual_mmproj`、`alignment_model`，共 13 项。
- 同时创建语音环境：预置无标记的 python-speech 目录后 `--with-speech` 仍 succeeded，节点与采用结果均跳过该组件，配置不含 `speech_python`，预置文件保留。
- 磁盘预检：20 MiB RAM 盘为引擎根时，一键配置与单引擎安装都在开始前返回 `DISK_SPACE_INSUFFICIENT`，`requiredBytes` 分别为 1846400000 和 1200000、`freeBytes` 20463616、`marginBytes` 268435456；卸载后无残留挂载。
- 更新提示与修复：把已安装 ten-vad 的标记版本改为 `000000000000` 后，`engines list` 的 `updates=["ten-vad"]`、状态 invalid 并给出“已安装版本与当前发布清单不同”；一键配置修复后 1.53 秒完成、`updates=[]`、状态 installed。
- 重复与并发：同环境重复一键配置不再下载任何内容；一键配置运行期间提交第二个作业返回 `ENGINE_BUSY`（`details.runId` 指向运行中的作业，可重试）。
- 真实安装产物可用：采用后的路径直接跑通产品脚本——8.318 秒中文语音转写为“今天天气很好，我们一起去公园散步。这是一段用于验证语音转写引擎的测试音频。”（TEN VAD 2.1.0，Metal MTL0，时间质量 estimated）；安装目录内 llama-server 完成文本与图像各 768 维嵌入（余弦 0.723891）、三条候选重排（`[0.99973, 3.49e-05, 0.00059]`）与 Hy-MT2 字幕翻译。
- 负向与恢复：篡改已安装文件后 verify 为 invalid 并给出大小或 SHA-256 原因，重装恢复；无标记目标目录返回 `ENGINE_TARGET_CONFLICT` 并保留原件；取消安装后环境目录、磁盘锁与暂存清理，状态回到 missing 且可重试；损坏目录采用返回 `ENGINE_VERIFY_FAILED` 且 revision 不变；过期 revision 采用返回 `CONFIG_CONFLICT`。
- 跨平台产物（本机可做的部分）：catalog 固定且可用的 18 个“平台×引擎”组合全部通过——13 个唯一下载的 size+sha256 与 pin 一致，按 `stripPrefix`/`include` 解压后 `files[]` 每条 path/size/sha256 与可执行位一致；transcribe 5 平台 `contract.json` 版本 0.2.0、header_hash `7df72bf9e667b8c2` 与 wheel 的 `PUBLIC_HEADER_HASH` 一致，架构与平台相符；llama 符号链接分别还原 18/16/10 条且无 dangling，Windows zip 无顶层目录、`llama-server.exe` 在根，macOS 两个 build 可执行。
- 合并后的设置页实际点击：设置只剩“模型与供应商 / 运行环境 / 外观”三个分区；运行环境页自上而下为“本地运行环境（一键配置）”“存储与路径（数据/配置/引擎/日志目录、工具状态、外部命令行、更换数据目录）”“诊断及应用信息（默认折叠，展开后显示 Node、SQLite、工具版本、供应商与本地运行环境计数）”；浏览器模式下数据目录显示由启动命令决定。
- Studio 实际点击（隔离环境）：一键面板显示两个选项与“引擎目录可用 … GB/本次预计需要 …”并随勾选变化（勾选模型权重后 1.9 GB → 5.6 GB）；20 MiB 卷上显示“磁盘空间不足”且按钮禁用；预置冲突目录后一键配置显示“配置完成，部分组件未完成，可重试”、跳过节点标为“已跳过（可重试）”、任务页采用节点列出 skipped；把 ten-vad 标记改旧后显示“可更新组件：TEN VAD 原生运行库”与“更新并配置”，执行后更新提示消失；高级里引擎根目录保存后写 `engine_install_root` 并显示“本地配置文件”来源，恢复默认写入空值并回到环境变量默认；模型页运行条件缺失时出现“配置运行环境”。
- HTTP 冒烟（开发模式，临时端口）：`/api/engines` 返回 `updates`/`models`/`diskFreeBytes`，`POST /api/engines/setup` 产生 succeeded 作业，`/api/capabilities` 与 `/api/doctor` 返回引擎摘要；服务随后停止。

## 证据边界

- 只在 darwin-arm64（Apple Silicon，macOS 27.2）实机运行与点击；Windows、Linux 的产物只验证了下载、解压、摘要与目录结构，未实机安装或推理；CUDA 变体未固定，因此不向用户提供。
- 语音 Python 环境未完整安装（torch/voxcpm 体积大），本轮只验证了选项、跳过/冲突、取消与配置不写入；本地 TTS 生成与整片语音链未运行。
- 模型权重复用本机已有文件验证下载/采用节点，未在隔离环境重新下载 3.7 GB 权重；权重下载本身沿用既有模型下载验收。
- 磁盘预检只在 macOS RAM 盘验证；其它平台 `statfs` 行为与低于阈值的边界未实机覆盖。
- Studio 仅在 darwin-arm64 开发模式点击验收；未覆盖其它平台、断网重连与超长安装过程中的界面表现。
- 转写时间仍为 estimated（Qwen3-ASR 无时间戳，未接强制对齐）；未做真实整片制作、长语音或检索质量评测。

隔离数据目录、配置、引擎根、RAM 盘与临时下载在验收后清理；用户现有 `config.local.yaml`、`models/`、`weaver/runtime/` 未改动。
