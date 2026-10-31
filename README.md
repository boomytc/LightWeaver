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

精确字幕和语义检索是可选能力，需要另装 `weaver/requirements.models.txt`，配置实际对齐模型和向量模型。人工 SRT 和文本检索可离线使用。VAD 区间与估算字幕不会标为 forced alignment。

## 数据与交接

默认数据根为 `data/.weaver/`，可由 `LIGHTWEAVER_DATA_DIR` 或 `--data-dir` 覆盖。SQLite 保存元数据，SHA-256 内容存储保存媒体。旧目录迁移后保留原件和备份，日常操作使用 CLI 或 Studio。

```bash
npx weaver export --project demo --format bundle --dest /absolute/demo.zip --json
npx weaver export --project demo --format otio --dest /absolute/empty-otio-dir --json
npx weaver export --project demo --format jianying --dest /absolute/empty-jianying-dir --json
npx weaver backup --dest /absolute/empty-backup-dir --json
```

迁移、恢复、缓存、错误协议和完整命令见 [运行约定](docs/conventions.md)。架构取舍见 [架构说明](docs/architecture-v2.md)，本轮证据和验证边界见 [验收记录](docs/acceptance-v2.md)。

## 开发

```bash
make typecheck
npm run build -w @lightweaver/studio
make remotion
```

采用 `confident-development-conventions`，按改动完成有限验收。临时脚本、mock 和合成样本在验收后清理。保留产品诊断、schema 校验、模块边界和类型检查。
