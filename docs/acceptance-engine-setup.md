# 引擎安装、校验与采用验收

2026-11-02，基线 `7d1d157`。引擎清单、任务化的下载/校验/采用、独立 Python 环境与 Studio 引擎设置为本次新增。

## 交付范围

- 引擎清单固定 6 个组件：transcribe.cpp 运行库 0.2.0（5 个平台）、transcribe Python bindings 0.2.0、TEN VAD（revision `d68ab71c8d5f`，4 个平台）、llama.cpp `llama-server` b12032（4 个平台）、模型 Python 环境、语音 Python 环境。归档固定 URL、字节数与 SHA-256；本平台组件 `available=true`，未固定平台按清单标注不可用。
- 安装走 Jobs：下载 → 解压 → 逐文件校验 → 发布。已校验的安装重复执行直接复用；文件缺失、大小或摘要不符时重装。目标目录没有本应用标记时拒绝覆盖并保留原件；取消后删除环境/暂存，不发布半成品。
- 采用（use）前重新校验全部必需文件，通过后按 binding 写入 `asr_library`、`asr_bindings`、`vad_library`、`visual_server`、`llama_server`、`translation_server`、`model_python`、`speech_python`；写入受配置 revision 保护。
- Python 环境按 requirements 清单创建 venv 并 pip 安装，环境版本取清单 SHA-256 前 12 位；安装后探测解释器与关键依赖。
- 一键配置：CLI `weaver engines setup` 与 Studio“本地运行环境”的单个主按钮，按顺序安装全部必需组件并在最后一个作业节点一次写入配置，用户不需要指定路径；单组件安装/校验/采用与手动路径收在高级设置。
- 入口：CLI `weaver engines setup|list|install|verify|use`；HTTP `GET /api/runtime`、`GET /api/engines`、`POST /api/engines/setup`、`POST /api/engines/:id/{install,verify,use}`；Studio 设置页“本地运行环境”与高级引擎分组。
- 任务与诊断入口：任务页把 `engine-setup`/`engine-install` 显示为“本地运行环境配置/引擎安装”，节点显示可读组件名与完成计数，并提供“打开运行环境”；模型页在运行条件缺失时提供“配置运行环境”；诊断页显示本地运行环境已安装/已配置数量与入口。
- TEN VAD 的下载项从模型清单移除（本地模型清单只剩 ASR、EmbeddingGemma、ForcedAligner），由引擎清单负责下载与校验；设置项 `vad_library` 语义不变。

## 实际验收

- 一键配置（隔离环境、全新目录）：`weaver engines setup --expected-revision … --wait` 单个作业包含 5 个安装节点与 1 个采用节点，run succeeded，节点依次为 install-transcribe-native / install-transcribe-bindings / install-ten-vad / install-llama-server / install-python-model / adopt，全部 succeeded；最后 adopt 节点一次写入 `asr_library`、`asr_bindings`、`vad_library`、`visual_server`、`llama_server`、`translation_server`、`model_python` 七项。同一环境再次执行（新 revision）0.26 秒完成、节点全部 succeeded、配置 revision 不变且无重复下载。
- Studio 一键流程：设置 → 运行时与路径 → 本地运行环境只显示一个“一键下载并配置”主操作与 5 个组件状态行；删除已安装的 llama-server 目录后点按钮，作业显示各组件“进行中/已完成”并自动补齐、刷新为“已安装/已配置”，按钮变为“重新检查并修复”，并给出“去选择模型权重”下一步；手动路径输入与单组件操作位于折叠的高级设置中。
- 任务与跨入口（同一隔离环境、真实点击）：点击一键配置后，任务页出现“本地运行环境配置”作业，节点显示“安装 transcribe 运行库 … 写入运行时配置”，进度 6/6 完成，并提供“打开运行环境”；作业类型显示“本地运行环境配置 · engine-setup”。模型页在运行条件缺失时显示“配置运行环境”，诊断页显示“本地运行环境：已安装 5/5 · 已配置 5/5；语音环境按需创建”与入口。

- 隔离环境（独立数据目录、配置文件与引擎根，未触碰用户配置、`models/`、`weaver/runtime/`）下列出 6 个引擎，本平台组件均 `available=true`；初始绑定为未设置，安装状态均为 missing。隔离配置写入后权限为 `0600`。
- 真实安装全部成功：transcribe-native `run-8c723887…` succeeded，归档 1483992 字节、SHA-256 `c6252907…3d3c`，校验 verified/0.2.0，6 个文件摘要全对，占 3.7 MB；transcribe-bindings `run-5530fb72…` succeeded，34388 字节、`2b4ae07f…2443`，verified/0.2.0，安装目录内只有 `transcribe_cpp/`；ten-vad `run-b612bc35…` succeeded，744600 字节、`81b2de13…e715a`，verified/`d68ab71c8d5f`（macOS universal x86_64+arm64）；llama-server `run-6be94574…` succeeded，16513842 字节、`00468fe8…6382`，verified/b12032，探测输出 `version: 0.8.0-dev (build 12032, commit dde879bc4)`，11 个必需文件与 18 条符号链接落地，占 40 MB。
- 重复执行 transcribe-native 安装 `run-ee726d8f…` succeeded（0.46 秒，首次 2.47 秒），事件只有排队、节点开始、节点成功，没有下载、解压或再次校验阶段；`verifiedAt` 更新为新时间戳，复用已校验文件。
- 模型 Python 环境 `run-6cc3fb67…` 真实 pip 安装 succeeded（67 秒），verified/`f7bf37ba2e9d`（`requirements.models.txt` 的 SHA-256 前 12 位），探测 detail 为 `Python 3.12.2`；环境 1.6 GB，`bin/python -c "import qwen_asr,numpy"` 成功（numpy 2.5.4，torch 亦已安装）。语音环境清单版本 `0cc1701548c4` 与 `requirements.speech.txt` 一致且 `available=true`，未完整安装，见证据边界。
- 逐个采用串起 revision 链 `e3b0c44…` → `70a291ca…` → `dd87e81c…` → `5e380f0e…` → `1c47320c…` → `a0ad595c…`；写入 `asr_library=<root>/transcribe-native/libtranscribe.dylib`、`asr_bindings=<root>/transcribe-bindings`、`vad_library=<root>/ten-vad/ten_vad`、`visual_server`/`llama_server`/`translation_server`=`<root>/llama-server/llama-server`、`model_python=<root>/python-model/bin/python`。之后 `engines list` 这些 binding 全部 `ready=true`，python-speech 因未安装为 missing。
- 采用后的真实路径直接跑通产品脚本：8.318 秒中文语音（`say` Tingting → 16 kHz 单声道）经 ASR 脚本转写为“今天天气很好，我们一起去公园散步。这是一段用于验证语音转写引擎的测试音频。”，TEN VAD 版本 2.1.0、区间 0.0–8.278 秒，Metal MTL0 后端，3.2 秒完成，时间质量为 estimated。
- 安装目录内的 llama-server 跑视觉嵌入：文本与蓝色网格图各 768 维、归一化后余弦 0.723891；重排三条候选得 `[0.99973, 3.49e-05, 0.00059]`，相关条排第一；Hy-MT2 把两条中文字幕译为英文亦通过。
- 负向与恢复：篡改已安装 `libggml.dylib` 追加 16 字节后 verify 为 invalid、reason「文件大小不匹配」（期望 90896、实际 90912）；同大小翻转 1 字节后 invalid、reason「SHA-256 不匹配」；重装 `run-e42baec7…` succeeded 并恢复原摘要。预置无标记目录 `ten-vad/keep.txt` 后安装 `run-4bd3e443…` failed/ENGINE_TARGET_CONFLICT，原文件保留；预置 python-speech 目录同样返回 ENGINE_TARGET_CONFLICT。已损坏的引擎目录执行采用返回 ENGINE_VERIFY_FAILED「引擎目录未通过完整性校验，未写入配置」且 revision 不变；过期 revision 采用返回 CONFIG_CONFLICT。
- 取消与重试：python-speech 安装 `run-546cdc79…` 取消后 state cancelled、错误 CANCELLED，环境目录与磁盘锁删除、暂存清空、状态回到 missing；再次发起 `run-9b414a6a…` 能正常进入 venv/pip，取消后同样无残留。
- Studio 实际点击（隔离数据目录、配置与引擎根，已安装并采用）：设置 → 运行时与路径显示 6 个引擎卡片、引擎根目录与「已安装/使用外部路径」等安装与使用状态（管理安装状态与当前绑定分开呈现）；对 transcribe.cpp 运行库点「校验」返回校验通过与 6 个文件的实际字节数；点「采用」写入配置并追加配置请求收据；模型 Python 环境「校验」返回 `verified`/`f7bf37ba2e9d`；「创建/更新环境」作业显示已完成；对语音 Python 环境点「创建/更新环境」后取消，界面显示「已取消」，引擎目录与磁盘锁无残留。另在仅手工配置外部路径、管理目录未安装的隔离配置下复核：卡片显示「未安装」与「使用外部路径」并给出切换到受管理副本的说明，顶部汇总为「已安装 0 / 6 · 使用外部路径 6 · 未使用 0」。
- HTTP 冒烟（开发模式，本机 5199）：`/api/runtime` 的 engineDir 指向隔离引擎根；`/api/engines` 返回 6 个引擎与当前 revision；`POST /api/engines/transcribe-bindings/install` 产生 `run-6a10a441…` succeeded/verified；`POST /api/engines/llama-server/verify` 返回 verified/b12032 与探测详情；`POST /api/engines/python-model/use` 返回同一 revision 与 model_python 路径。服务随后停止。

## 证据边界

- 只在 darwin-arm64（Apple Silicon M4 Pro，macOS 27.2）实机安装与运行；Windows、Linux、CUDA 产物只做清单与哈希固定，未做实机下载与推理验收，其中 Linux/Windows 的 llama.cpp 与 transcribe 包按微架构拆分子库，运行时选择未验证。
- 语音 Python 环境未完整安装：torch 2.15、torchaudio、voxcpm 体积大，本轮只验证了清单版本、状态展示（missing）、目标冲突拒绝与取消/重试行为；本地 TTS 生成与整片语音链未运行。
- Studio 页面只在 darwin-arm64 开发模式完成上述点击验收；未覆盖其它平台、断网重连与超长安装过程中的界面表现。
- 转写时间仍为 estimated（Qwen3-ASR 无时间戳，未接强制对齐）；未做真实整片制作、长语音或检索质量评测，不由有限样例推导整体质量。
- 模型文件使用本机已有的 Qwen3-ASR、EmbeddingGemma 2、Qwen3-Reranker、Hy-MT2，未通过模型下载流程重新获取；隔离配置不含 ModelBest 密钥，未调用付费 API。

隔离数据目录、配置、引擎根与临时下载在验收后清理；用户现有 `config.local.yaml`、`models/`、`weaver/runtime/` 未改动。
