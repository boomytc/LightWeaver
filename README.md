# LightWeaver

本地后处理视频工具。CLI 与 Studio 共用项目修订、作业、媒体和交付记录。外部 agent 编写剧情、旁白和选段，人可在 Studio 修改同一份项目。

支持静帧讲解、多源剧情解说、无对白观察后配旁白、文案找镜头、原声高光混剪、参考片反向匹配。同一项目可混用卡片、静帧和视频片段。方法、音色和素材库按需选用。

## 启动

需要 Node 22.13+ 或 24、Python 3.12、FFmpeg 与 ffprobe。卡片渲染需要 Chrome。精修导出使用 Python 依赖，剪映目标版本是 macOS 11.7.0。

```bash
make install
python3 -m pip install -r weaver/requirements.txt
make studio
```

打开 `http://127.0.0.1:5175/`，创建草稿、导入素材、编辑并保存修订。制作按钮提交作业，作业页支持取消与恢复，复盘页显示当前、过期和历史交付。

命令行从发现能力开始：

```bash
npx weaver capabilities --json
npx weaver doctor --json
npx weaver help --json
npx weaver project create demo --workflow study-explainer --json
npx weaver project show demo --json
npx weaver schema ops --json
```

用返回的 revision 调用 `project apply --ops /absolute/edits.json --expected-revision <revision>`，再制作：

```bash
npx weaver build --project demo --plan --json
npx weaver build --project demo --wait --json
npx weaver artifacts --project demo --json
```

独立 ASR、TTS 无需项目。`--wait` 使用同一 runner，也可在 Studio 关闭时运行。

```bash
npx weaver asr --file /absolute/audio.wav --locale zh --wait --json
npx weaver tts --text "要合成的内容" --voice voice-id --voice-version digest --wait --dest /tmp/speech.wav --json
```

## 配置模型

复制 `config.local.yaml.example` 为忽略的 `config.local.yaml`，或在启动进程的环境中设置变量。Studio 的“模型”页提供同一套设置；密钥写入本地配置，页面不回显已保存值。

第一个供应商预设是 ModelBest。默认端点为 `https://api.modelbest.cn/v1`，固定提供 `MiniCPM-V-4.7-35B-A3B` 画面观察和 `VoxCPM2` 语音合成。可从 [ModelBest 平台](https://platform.modelbest.cn/) 获取 Key，并查看 [接口文档](https://platform.modelbest.cn/console/docs)。环境变量 `MODELBEST_API_KEY` 优先于 `config.local.yaml`。旧的 DeepSeek 适配仍可按作业显式选择。

```bash
npx weaver analyze --project demo --with describe --provider deepseek-vlm --wait --json
npx weaver analyze --project demo --with describe --provider modelbest-vlm --wait --json
```

本地模型使用声明式目录。查询、校验、下载和采用分开执行：

```bash
npx weaver models list --json
npx weaver models settings get --json
npx weaver models download qwen3-forced-aligner --wait --json
npx weaver models verify qwen3-forced-aligner --json
npx weaver models use qwen3-forced-aligner --path /absolute/Qwen3-ForcedAligner-0.6B --json
npx weaver models use qwen3-asr --path /absolute/Qwen3-ASR-Q8_0.gguf --json
npx weaver models use-provider modelbest --json
```

下载根目录可由 `LIGHTWEAVER_MODEL_DOWNLOAD_ROOT` 或 `model_download_root` 指定。相对路径按仓库根解析。下载作业沿用现有取消、恢复和事件链，复用已通过校验的完整文件。文件先写入该作业独立暂存区，大小和固定 revision 的 SHA-256 都通过后才发布；目标存在不同内容时报告冲突并保留原件，可另选目录。下载完成不会自动修改配置；`models use` 或 Studio 的“校验后采用路径”才会绑定。Qwen ASR GGUF 和 TEN VAD 是单文件模型，可以直接采用任意文件名的既有文件；ForcedAligner 和 EmbeddingGemma 采用完整目录。

保存 ModelBest Key 不等于选择预设。`models use-provider modelbest` 或 Studio 的“采用 ModelBest 预设”会一次写入 `vlm_provider`、`vlm_model` 和 `tts_model`。页面显示三项的有效值和来源，环境变量仍优先。

`models settings set` 从文件读取白名单更新，避免把密钥放进命令参数：

```bash
npx weaver models settings set --file /absolute/model-settings.json --json
npx weaver schema model-settings --json
```

本地 ASR 使用 Qwen3-ASR GGUF、TEN VAD、`transcribe` native library、Python bindings 和 `model_python`。`model_python` 是实际启动 ASR 进程的解释器。权重、native library、bindings、VAD 和 Python 环境分别检查；权重存在不等于运行时就绪。LightWeaver 不自动发现相邻仓库或自动编译运行库。

精确字幕默认使用官方 Qwen3-ForcedAligner-0.6B 权重和 Torch 后端，跨平台默认为 CPU。MLX 仍是显式高级兼容路径：

```bash
uv pip install --python weaver/.venv/bin/python -r weaver/requirements.models.mlx.txt
```

模型脚本在本仓，依赖安装在独立环境，运行时不导入 LightASR、AutoModel 或其它产品：

```bash
uv venv --python 3.12 weaver/.venv
uv pip install --python weaver/.venv/bin/python -r weaver/requirements.models.txt
```

Windows 安装依赖时将上述 Python 路径换成 `weaver/.venv/Scripts/python.exe`。未显式设置 `model_python` 时会按平台选择该环境。

按配置示例设置模型路径和运行库。模型可放在忽略的 `weaver/models/`，或显式指向自己的权重目录；推理不会下载权重。

对齐支持 zh、yue、en、de、es、fr、it、pt、ru、ko、ja，单场景语音上限 180 秒。字幕保留作者原文，使用真实词/字时间生成句界；VAD 和估算字幕不会标为精确对齐。文本语义检索和画面检索共用 EmbeddingGemma 2 主干、mmproj、llama-server 与模型 Python。文本查询和文档使用各自的 EmbeddingGemma 前缀，执行 mean pooling 和 L2 归一化；视觉模式对视频窗口中点抽帧。缓存键包含文本适配器、前缀、文件字节和运行时，旧 Qwen3 向量不会被复用。

```bash
npx weaver search --project demo --query "宠物在户外休息" --mode semantic --wait --json
npx weaver search --project demo --query "正在打羽毛球的人" --mode visual --wait --json
```

独立重排和说话人分段不在当前 Studio 默认入口和预设中。已配置的显式重排能力仍可由 CLI 使用。GGUF 服务由每个作业启动并回收，取消会终止整个进程组。人工 SRT 和文本检索仍可独立使用。详见 [运行约定](docs/conventions.md) 与 [对齐和检索验收](docs/acceptance-alignment-search.md)。

本地 VoxCPM2、Hy-MT2 字幕翻译和 MOSS 临时说话人分段也使用本仓适配脚本。VoxCPM2 单独安装，避免与 MLX 对齐依赖冲突：

```bash
uv venv --python 3.12 weaver/.speech-venv
uv pip install --python weaver/.speech-venv/bin/python -r weaver/requirements.speech.txt
```

源 ASR 可显式 `--align` 后采用为源片字幕。Studio 支持候选预览裁剪、逐句时间编辑、遮罩和创作方案审核。翻译保留原声音轨与句界，采用后记录字幕目标语言；说话人标签仅在同一分析窗口内有效。完整命令和配置见 [运行约定](docs/conventions.md)。

## 数据与交接

默认数据根为 `data/.weaver/`，可由 `LIGHTWEAVER_DATA_DIR` 或 `--data-dir` 覆盖。SQLite 保存元数据，SHA-256 内容存储保存媒体。旧目录迁移后保留原件和备份，日常操作使用 CLI 或 Studio。

```bash
npx weaver export --project demo --format bundle --dest /absolute/demo.zip --json
npx weaver export --project demo --format otio --dest /absolute/empty-otio-dir --json
npx weaver export --project demo --format jianying --dest /absolute/empty-jianying-dir --json
npx weaver backup --dest /absolute/empty-backup-dir --json
```

迁移、恢复、缓存、错误协议和完整命令见 [运行约定](docs/conventions.md)。架构取舍见 [架构说明](docs/architecture-v2.md)，本轮能力覆盖、证据与限制见 [落地验收](docs/acceptance-coverage.md)，既有媒体链见 [架构验收](docs/acceptance-v2.md)。

## 开发

```bash
make typecheck
npm run build -w @lightweaver/studio
make remotion
```

采用 `confident-development-conventions`，按改动完成有限验收。临时脚本、mock 和合成样本在验收后清理。保留产品诊断、schema 校验、模块边界和类型检查。
