# 运行合同与命令参考

## 数据位置

| 位置 | 内容 |
| --- | --- |
| `data/.weaver/state.sqlite3` | 项目 head、不可变修订、资产与库版本、作业、事件、候选、交付 |
| `data/.weaver/blobs/<prefix>/<digest>` | SHA-256 内容存储 |
| `data/.weaver/work/<node>/<attempt>` | 独立 attempt 工作目录与完成收据 |
| `data/.weaver/materialized/` | 可重建的友好文件名副本 |
| `data/.weaver/backups/` | 一致性数据库、引用 blob 与迁移前 JSON 备份 |
| `library/` | 可复用内置包和方法说明的显式导入来源 |
| `data/projects/`、`data/first-party/` | 保留的旧输入，一次性迁移器读取 |

`LIGHTWEAVER_DATA_DIR` 或 CLI `--data-dir` 选择运行根。项目 ID 不依赖方法、工作流或目录。完整 DB 与 blobs 可一起搬迁，内部 locator 保持相对值。JSON 用于显式交换和不可变快照。

## 公开入口

Node 产品使用 `@lightweaver/weaver/app`，浏览器使用 `@lightweaver/weaver/contracts`。`weaver capabilities` 返回工作流、输出规格、provider 描述符和内置包版本。`schema` 由运行时 Zod 合同生成。

stdout 结果为 `{ok:true,result,requestId}`，错误为 `{ok:false,error:{code,message,retryable,details,hints}}`。日志进 stderr。`--json` 输出单行 JSON。CLI `events` 输出 JSONL，`run events` 返回事件数组。HTTP 返回相同结果与错误形状；SSE 使用单调 seq，支持 Last-Event-ID。

项目写入携带 expectedRevision，库写入携带 expectedVersion。requestId 标识一次逻辑请求，相同请求可重试。修订冲突返回当前内容。删除库 head 使用墓碑，精确版本继续可读。

## 编辑与制作

```bash
npx weaver project create demo --workflow observe-narrate --json
npx weaver asset add --project demo --file /absolute/source.mp4 --expected-revision REV --request-id source-1 --json
npx weaver project brief demo --json
npx weaver schema scene --json
npx weaver project apply --project demo --ops /absolute/ops.json --expected-revision REV --request-id edit-1 --json
npx weaver build --project demo --locales zh --profiles landscape,portrait,square --plan --json
npx weaver build --project demo --wait --json
npx weaver artifacts --project demo --json
```

Draft 可为空。Scene 是 card、still 或 clip。静帧使用固定帧或真实语音时长，clip 使用整数微秒源窗，并显式选择源时长或语音时长。超窗默认拒绝，定格和变速由作者设置上限。原声场无需音色。

build 冻结作者、资产、库、provider 和工具，先准备真实事实，再编译 TimelineManifest。Remotion 只输出无声卡片，FFmpeg 统一画面、字幕、混音与最终封装。低清预览来自同一正式时间轴。

缓存按实际依赖与工具版本查找。改标题保留无关语音，按 locale 的文字与字幕独立失效。输出状态同时检查完整性和依赖；历史结果可以显式导出。

## 分析与候选

```bash
npx weaver analyze --project demo --with asr,describe --provider modelbest-vlm --wait --json
npx weaver analyze --project demo --with describe --provider deepseek-vlm --from-us 0 --duration-us 10000000 --wait --json
npx weaver search --project demo --query "需要的画面" --mode text --json
npx weaver search --project demo --query "需要的画面" --mode semantic --wait --json
npx weaver match --project demo --edited edited-asset-id --sources source-asset-id --wait --json
npx weaver proposal apply --project demo --proposal PROPOSAL --select CANDIDATE --expected-revision REV --json
```

ASR、描述按源版本与窗口保存。describe 的观察和镜头树供作者判断，核心不代写旁白。文本模式按已存证据检索，semantic 模式调用配置的向量后端。未配置时显式失败。

人工证据文件是 `[{sourceId,startUs,durationUs,text}]`，通过 `analyze --import /absolute/evidence.json --expected-revision REV --wait` 导入。外部候选使用 `schema proposal`，经 `proposal import --file /absolute/proposal.json --expected-revision REV --wait` 校验后保存。应用选择生成新修订，并保留选择记录。

## 字幕与声音

```bash
npx weaver captions import --project demo --file /absolute/subtitles.srt --locale zh --expected-revision REV --json
# 源片字幕额外带 --source-id ASSET --source-version DIGEST
```

字幕支持人工 SRT、VTT，时间可映射到成片、源片或场景语音。manual、native、aligned、estimated 分别记录。precise 模式缺对齐能力时报错；estimated 需要显式选择。SRT、ASS、烧录和交接使用同一 cue。

声音计划包含原声、语音、BGM、增益、裁剪、循环、淡变、旁白驱动 ducking 和最终 LUFS、true peak 目标。默认 -16 LUFS、-1 dBTP。静音节目不填写虚构测量值。正式视频验证帧数、规格和解码音频采样数，AAC 允许最多 2048 个额外样本。

## 模型边界

| 能力 | 当前适配 | 配置 |
| --- | --- | --- |
| TTS、音色设计 | ModelBest VoxCPM2 SSE 音频事件 | MODELBEST_API_KEY、LIGHTWEAVER_TTS_MODEL |
| VLM | ModelBest MiniCPM-V 或 DeepSeek flash | MODELBEST_API_KEY、DEEPSEEK_API_KEY，analyze --provider |
| VAD 与 ASR | TEN VAD native ABI、Qwen3 GGUF transcribe ABI | LIGHTWEAVER_VAD_LIBRARY、LIGHTWEAVER_ASR_MODEL、TRANSCRIBE_LIBRARY、LIGHTWEAVER_ASR_BINDINGS |
| 精确对齐 | WhisperX | LIGHTWEAVER_ALIGNMENT_MODEL |
| 向量 | Transformers masked mean pooling | LIGHTWEAVER_EMBEDDING_MODEL、LIGHTWEAVER_EMBEDDING_REVISION |

本地文件内容摘要进入绑定。远端模型输出可能不确定，缓存复用已验证的实际字节。`--regenerate` 使用新 generation。远端不支持幂等，取消只中止本地等待，远端结果可能未知。

`weaver doctor` 显示工具、依赖、配置和目标剪映版本。它不发送模型请求。模型功能确认记录在 acceptance-v2.md。

## 库与交接

```bash
npx weaver library list --json
npx weaver library set --file /absolute/payload.json --media /absolute/reference.wav --json
npx weaver library show ITEM --version DIGEST --json
npx weaver library delete --id ITEM --expected-version DIGEST --json
npx weaver asset adopt --project demo --item ITEM --version DIGEST --expected-revision REV --json
npx weaver library import-builtin --package-version DIGEST --json
```

内置包 DIGEST 由 capabilities 返回。方法条件来自 MethodVersion。项目升级使用 `project apply` 的 rebind 操作。音色参考音频转写、设计试听和收下也可在 Studio 完成。

```bash
npx weaver export --project demo --format otio --dest /absolute/empty-otio-dir --json
npx weaver export --project demo --format jianying --dest /absolute/empty-jianying-dir --json
npx weaver export verify --dir /absolute/package --json
npx weaver export install --dir /absolute/jianying-package --json
npx weaver export --project demo --format bundle --dest /absolute/package.zip --json
npx weaver import --file /absolute/package.zip --id imported-project --json
```

OTIO 使用官方库生成与重载。字幕附 SRT、ASS 与 metadata，编辑器的字幕与特效兼容性各异。剪映锁定 macOS 11.7.0、schema 360000、adapter v1。安装创建新草稿并备份索引。

画面适配、速度和定格可烘焙。节目母带保留最终混音，独立备选音轨默认静音，并烘焙裁剪、循环、变速、增益与淡变。原始媒体、映射与报告随包保存。bundle 保存精确版本和必要物化依赖，排除活动 DB 与密钥。

## 取消、恢复与维护

```bash
npx weaver run status RUN --json
npx weaver run cancel RUN --json
npx weaver run resume RUN --wait --json
npx weaver run events RUN --after 0 --json
npx weaver backup --dest /absolute/empty-backup --json
npx weaver restore --source /absolute/backup --dest /absolute/empty-state --json
npx weaver gc --json
npx weaver gc --apply --json
npx weaver migrate --root /absolute/legacy-workspace --dry-run --json
npx weaver migrate --root /absolute/legacy-workspace --execute --request-id migration-1 --json
npx weaver migrate rollback JOURNAL --json
```

失败与取消保留已完成独立目标及上一份有效交付。lease、attempt token 和目标代次约束发布。完成收据进入 DB 与 CAS 引用，备份后也能复用；本地旧 attempt 工作收据支持崩溃恢复。

备份使用 SQLite backup API，并复制快照引用的不可变 blob。restore 写入空目录，GC 默认 dry-run，保护修订、库版本、run、收据、pin 和保留交付。迁移保留旧原件，旧派生结果无完整来源时登记 historical/unverified。rollback 只在迁移后未被修改时执行。
