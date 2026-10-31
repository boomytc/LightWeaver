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
npx weaver analyze --project demo --with asr --align --locale zh --wait --json
npx weaver captions from-analysis --project demo --locale zh --run RUN --expected-revision REV --json
npx weaver analyze --project demo --with asr,describe --provider modelbest-vlm --wait --json
npx weaver analyze --project demo --with describe --provider deepseek-vlm --from-us 0 --duration-us 10000000 --wait --json
npx weaver search --project demo --query "需要的画面" --mode text --json
npx weaver search --project demo --query "需要的画面" --mode semantic --wait --json
npx weaver search --project demo --query "需要的情节" --mode semantic --rerank --sources source-id --from-us 0 --to-us 10000000 --wait --json
npx weaver match --project demo --edited edited-asset-id --sources source-asset-id --wait --json
npx weaver proposal apply --project demo --proposal PROPOSAL --select CANDIDATE --expected-revision REV --json
```

ASR、描述按源版本与窗口保存。describe 的观察和镜头树供作者判断，核心不代写旁白。文本模式按已存证据检索，semantic 模式用 Qwen3 Embedding 召回同一份字幕与观察文本，可显式使用 Qwen3 Reranker 重排前 50 个候选，默认返回前 20 个。文本和语义模式都遵守素材和完整证据时间窗过滤。视觉模式使用 EmbeddingGemma 2 和 mmproj，按五秒窗口的中点帧召回视频；不会读取 ASR 文本，也不会把单帧分数当作整窗内容判断。素材、时间过滤在抽帧前生效。语义分数是归一化向量的余弦相似度，重排分数单列保存；它们不是内容正确率。未配置请求的能力时明确失败，不回退到其它模型。

查询以 `Instruct` / `Query` 格式编码，素材用原文，使用 last-token pooling 和 L2 归一化。角色、指令、模型字节和实际运行时进入缓存绑定，重排另按查询与候选文本缓存。检索不改写源证据；候选绑定提交时修订，作业成功后才在事务中发布。单条向量输入最多 8192 tokens；重排的查询与单条候选合计最多 7680 tokens，为模型模板预留空间。超限拒绝，不静默截断。

人工证据文件是 `[{sourceId,startUs,durationUs,text}]`，通过 `analyze --import /absolute/evidence.json --expected-revision REV --wait` 导入。外部候选使用 `schema proposal`，经 `proposal import --file /absolute/proposal.json --expected-revision REV --wait` 校验后保存。应用选择生成新修订，并保留选择记录。`proposal apply --ranges /absolute/ranges.json` 可传 `{候选ID:{startUs,durationUs}}`，裁剪必须完全包含在所选候选窗内。Studio 提供同样的预览和裁剪。

## 创作方案

外部 agent 使用 `project context` 读取修订、证据、素材和候选，通过 `schema creative-plan` 取得合同。方案包含标题、概述、场景、理由和源证据引用。

```bash
npx weaver creative-plan import --project demo --file /absolute/plan.json --expected-revision REV --json
npx weaver creative-plan show --project demo --json
npx weaver creative-plan apply --project demo --expected-revision REV --json
```

保存方案生成新修订，现有场景继续用于制作。采用默认替换场景，`--append` 追加。引用证据必须属于此项目，素材版本和区间必须匹配。无分析证据的人工选段也可保存。Studio 审核同一方案，并要求先保存本地草稿。方案与依赖随 bundle 保存。

## 字幕与声音

```bash
npx weaver captions import --project demo --file /absolute/subtitles.srt --locale zh --expected-revision REV --json
# 源片字幕额外带 --source-id ASSET --source-version DIGEST
```

字幕支持人工 SRT、VTT，时间可映射到成片、源片或场景语音。manual、native、aligned、estimated 分别记录。precise 模式缺对齐能力时报错；estimated 需要显式选择。SRT、ASS、烧录和交接使用同一 cue。

precise 使用 Qwen3-ForcedAligner-0.6B。zh、yue、en、de、es、fr、it、pt、ru、ko、ja 可用，区域标签取主语种，拒绝 auto。单场景语音最多 180 秒，音频转为 16kHz 单声道；字幕用作者原文分句，通过实际词/字时间得到句界。空结果、原文覆盖不完整和无效时码会失败，不伪造 aligned 字幕。

源片 `analyze --with asr --align` 保留 ASR 原文和实际词时间，再按当前修订采用为源片字幕。跨窗采用只去重同一来源、相同说话人且文字一致的重叠证据；不同文字保留供作者核对，不按时间重叠丢弃整句。字幕 cue 可在 Studio 编辑文字、时间、来源和临时说话人标签；人工修改清除已失效词时间。Studio 字幕支持正文、原始转写和说话人检索，每页显示 25 条。重叠筛选只比较同一时间钟，修改与移除按 cue 标识作用于完整字幕轨。离页时备份未提交草稿到当前浏览器，重新打开后显式恢复；恢复保留原修订基线，过期修订仍进入冲突处理。备份可手动清除。

视频和静帧遮罩按所选输出规格预览，位置保存在项目修订中；卡片遮罩使用坐标示意，并通过制作预览核对实际画面。

```bash
npx weaver captions translate --project demo --locale zh --target-locale en --expected-revision REV --wait --json
npx weaver captions apply-translation --project demo --run RUN --expected-revision REV --json
npx weaver speakers analyze --project demo --source-id SOURCE --locale zh --wait --json
npx weaver speakers apply --project demo --run RUN --expected-revision REV --json
npx weaver voice-design --provider local-voxcpm2 --text "试听内容" --style "温和自然" --wait --json
```

翻译保留 cue 标识、句界、源引用和 sourceText，清除译文无对应关系的词时间。采用后 `translationLocale` 记录字幕语言，制作 locale 与原声不变。MOSS 仅支持中文与英文；每窗最多 40 秒，标签带窗口作用域，不跨窗推断人物身份。模型完成不会自动覆盖项目字幕。按 run 采用局部结果只替换重叠的源字幕，窗口外 cue 保留。原文结果不能混入仍保留译文 cue 的轨道；完整恢复原文会清除译文标记。再次翻译已有译文轨时从保留的原文开始。

本地 VoxCPM2 音色可通过 Studio 上传或试听收下。音色的 provider 随版本保存，场景的 `Speech.style[locale]` 可覆盖默认风格；真实文字、风格、参考音频和模型绑定共同决定语音缓存。本地合成有风格时使用可控克隆，只向模型传参考音频；无风格且有参考文本时使用续写克隆。两种模式不混用。语音绑定还摘要实际 site-packages 内容，环境字节变化会失效。

声音计划包含原声、语音、BGM、增益、裁剪、循环、淡变、旁白驱动 ducking 和最终 LUFS、true peak 目标。默认 -16 LUFS、-1 dBTP。静音节目不填写虚构测量值。正式视频验证帧数、规格和解码音频采样数，AAC 允许最多 2048 个额外样本。

## 模型边界

| 能力 | 当前适配 | 配置 |
| --- | --- | --- |
| TTS、音色设计 | ModelBest VoxCPM2 SSE 音频事件 | MODELBEST_API_KEY、LIGHTWEAVER_TTS_MODEL |
| VLM | ModelBest MiniCPM-V 或 DeepSeek flash | MODELBEST_API_KEY、DEEPSEEK_API_KEY，analyze --provider |
| VAD 与 ASR | TEN VAD native ABI、Qwen3 GGUF transcribe ABI | LIGHTWEAVER_VAD_LIBRARY、LIGHTWEAVER_ASR_MODEL、TRANSCRIBE_LIBRARY、LIGHTWEAVER_ASR_BINDINGS |
| 精确对齐 | Qwen3 ForcedAligner，显式 MLX / Torch | LIGHTWEAVER_ALIGNMENT_MODEL、LIGHTWEAVER_ALIGNMENT_BACKEND、LIGHTWEAVER_ALIGNMENT_DEVICE |
| 向量 | Qwen3 Embedding GGUF，last-token pooling | LIGHTWEAVER_EMBEDDING_MODEL |
| 重排 | Qwen3 Reranker GGUF，rank pooling | LIGHTWEAVER_RERANKER_MODEL，search --rerank |
| 视觉检索 | EmbeddingGemma 2 GGUF 与 mmproj，mean pooling | LIGHTWEAVER_VISUAL_MODEL、LIGHTWEAVER_VISUAL_MMPROJ、LIGHTWEAVER_VISUAL_SERVER |
| 本地语音 | VoxCPM2 Torch | LIGHTWEAVER_LOCAL_TTS_MODEL、LIGHTWEAVER_SPEECH_PYTHON |
| 字幕翻译 | Hy-MT2 GGUF | LIGHTWEAVER_TRANSLATION_MODEL、LIGHTWEAVER_TRANSLATION_SERVER |
| 说话人分段 | MOSS Transcribe Diarize GGUF | LIGHTWEAVER_DIARIZATION_MODEL，加 ASR 原生运行时 |

本地模型 Python 由 `LIGHTWEAVER_MODEL_PYTHON` / `model_python` 指定，默认 `weaver/.venv/bin/python`。GGUF 使用 `LIGHTWEAVER_LLAMA_SERVER` / `llama_server` 指定的二进制，默认从 PATH 查找 `llama-server`。相对配置路径以仓库根解析，不读取相邻仓库配置或 Python 环境。依赖安装见 README；Torch 和新版 MLX 的 Transformers 版本不同，切换时使用各自独立环境。权重路径需要显式设置，不自动下载。

每次 GGUF 执行绑定临时 loopback 端口及独立凭据，关闭代理，完成或失败后回收服务。模型 Python 与子服务同属作业进程组，取消一并终止。doctor 检查文件、可执行文件和对齐依赖，不加载权重或发送推理请求；ready 只表示配置与依赖条件满足。

本地文件内容摘要进入绑定。远端模型输出可能不确定，缓存复用已验证的实际字节。`--regenerate` 使用新 generation。远端不支持幂等，取消只中止本地等待，远端结果可能未知。

`weaver doctor` 显示工具、依赖、配置和目标剪映版本。它不发送模型请求。模型功能确认见[架构升级验收](acceptance-v2.md)、[强制对齐和检索验收](acceptance-alignment-search.md)、[能力落地验收](acceptance-coverage.md)与[连续影视素材验收](acceptance-long-form.md)。

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

OTIO 使用官方库生成与重载。字幕附 SRT、ASS 与 metadata，编辑器的字幕与特效兼容性各异。剪映锁定 macOS 11.7.0、schema 360000、adapter v1。重叠字幕分配独立文本轨，保留原始文字与时间，作者可在编辑器继续核对。安装创建新草稿并备份索引。

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

失败与取消保留已完成独立目标及上一份有效交付。作业总时限返回 `DEADLINE_EXCEEDED`，用户取消与 worker 停止分别登记 cancelled 与 interrupted。工具探测接收节点取消信号。媒体监督进程通过父进程管道与 IPC 断连感知 worker 退出，终止目标进程组，三秒后强制回收未退出后代。lease、attempt token 和目标代次约束发布。完成收据进入 DB 与 CAS 引用，备份后也能复用；本地旧 attempt 工作收据支持崩溃恢复。

备份使用 SQLite backup API，并复制快照引用的不可变 blob。restore 写入空目录，GC 默认 dry-run，保护修订、库版本、run、收据、pin 和保留交付。迁移保留旧原件，旧派生结果无完整来源时登记 historical/unverified。rollback 只在迁移后未被修改时执行。
