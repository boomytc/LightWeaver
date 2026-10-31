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

复制 `config.local.yaml.example` 为忽略的 `config.local.yaml`，或在启动进程的环境中设置变量。密钥使用 `MODELBEST_API_KEY` 和 `DEEPSEEK_API_KEY`。对应端点变量是 `MODELBEST_BASE_URL` 和 `DEEPSEEK_BASE_URL`。

当前功能确认使用 ModelBest VoxCPM2、DeepSeek `deepseek-flash`、ModelBest `MiniCPM-V-4.7-35B-A3B`，以及本地 TEN VAD 与 Qwen3-ASR GGUF。VLM 按作业选择：

```bash
npx weaver analyze --project demo --with describe --provider deepseek-vlm --wait --json
npx weaver analyze --project demo --with describe --provider modelbest-vlm --wait --json
```

本地 ASR 的模型、动态库、Python 绑定和 TEN VAD 库均需显式配置。开发时可以指向本机已验证的运行文件；分发时准备独立运行目录。LightWeaver 不自动发现相邻仓库或下载权重。

精确字幕使用 Qwen3-ForcedAligner-0.6B；语义检索使用 Qwen3-Embedding GGUF，可选 Qwen3-Reranker 重排。模型脚本在本仓，依赖安装在独立环境，运行时不导入 LightASR、AutoModel 或其它产品：

```bash
uv venv --python 3.12 weaver/.venv
uv pip install --python weaver/.venv/bin/python -r weaver/requirements.models.txt
```

按配置示例设置模型路径和 `llama_server` 可执行文件。模型可放在忽略的 `weaver/models/`，或显式指向自己的权重目录；运行时不会下载权重。Apple Silicon 默认 MLX，其他平台默认 Torch。Mac 上选择 Torch 时使用单独的 Python 环境安装 `qwen-asr==0.0.6`，再设置 `model_python` 与 `alignment_backend: 'torch'`。

对齐支持 zh、yue、en、de、es、fr、it、pt、ru、ko、ja，单场景语音上限 180 秒。字幕保留作者原文，使用真实词/字时间生成句界；VAD 和估算字幕不会标为精确对齐。语义检索召回字幕及画面观察文本，查询使用任务指令，素材使用原文；视觉模式使用 EmbeddingGemma 2 对视频窗口中点抽帧，直接检索画面。它只代表采样帧的相似度，仍需预览完整候选窗。

```bash
npx weaver search --project demo --query "宠物在户外休息" --mode semantic --rerank --wait --json
npx weaver search --project demo --query "正在打羽毛球的人" --mode visual --wait --json
```

`--rerank` 需配置重排权重，未启用时只做向量召回。GGUF 服务由每个作业启动并回收，取消会终止整个进程组。人工 SRT 和文本检索仍可独立使用。详见 [运行约定](docs/conventions.md) 与 [对齐和检索验收](docs/acceptance-alignment-search.md)。

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
