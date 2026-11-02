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

Node 产品使用 `@lightweaver/weaver/app`，浏览器使用 `@lightweaver/weaver/contracts`。`weaver capabilities` 返回工作流、输出规格、provider 描述符和内置包版本。capabilities 与 doctor 的 `runtime` 显示实际模式、数据目录和配置文件，供 agent 核对目标工作区。capabilities 和 Studio 设置页还提供带绝对 Node、CLI、数据目录、配置文件和配置基准的完整命令；项目 brief 沿用同一命令，供其他工作目录中的 agent 访问当前项目。`schema` 由运行时 Zod 合同生成。下列 `npx weaver` 示例用于源码工作区；协作桌面项目时换成设置页提供的随包 CLI。

stdout 结果为 `{ok:true,result,requestId}`，错误为 `{ok:false,error:{code,message,retryable,details,hints}}`。日志进 stderr。`--json` 输出单行 JSON。CLI 默认仍返回 JSON；终端用户可显式使用 `--human`，它与 `--json` 互斥。帮助和参数检查共享命令描述，必填参数自动进入允许参数和帮助，不接受未知参数。`--help`、`-h` 在创建 Application 前解析。`--wait` 在终端中默认把阶段进度写到 stderr，非终端可显式加 `--progress`；stdout 保持结果契约。CLI `events` 输出 JSONL，`run events` 返回事件数组。HTTP 返回相同结果与错误形状；SSE 使用单调 seq，支持 Last-Event-ID。

项目写入携带 expectedRevision，库写入携带 expectedVersion。requestId 标识一次逻辑请求，相同请求可重试。修订冲突返回当前内容。删除库 head 使用墓碑，精确版本继续可读。

帮助按命令作用域发现，完整参数以当前 CLI 返回为准：

```bash
npx weaver --help --human
npx weaver scene add --help --human
npx weaver project list --human
```

素材导入按文件内容摘要和请求参数识别重试，不把上传临时路径作为请求身份。已完成的请求返回首次素材与修订，沿用首次 expectedRevision；同一 requestId 对应不同内容或参数时返回 REQUEST_ID_REUSED。素材名、类型与 MIME 包括从文件名推导的默认值，改变这些值也会被拒绝。重试仍需提供相同文件字节。

`project create --sample` 和 Studio 的“打开示例”通过同一项目创建事务生成三张无旁白文字卡片，每张 90 帧，不导入素材或调用模型。默认规格为 1920×1080、30 fps，制作仍需 FFmpeg、ffprobe 和 Chrome。`scene add` 在共享项目写入入口按 requestId 查重、检查 expectedRevision，再解析源素材与时长；改变请求参数不能复用旧 requestId。card 的 body、label 可省略，locale 必须属于项目语言；still 和 clip 使用当前修订的精确素材引用。

## 编辑与制作

```bash
npx weaver project create demo --workflow observe-narrate --json
npx weaver asset add --project demo --file /absolute/source.mp4 --expected-revision REV --request-id source-1 --json
npx weaver project brief demo --json
npx weaver schema scene --json
npx weaver project apply --project demo --ops /absolute/ops.json --expected-revision REV --request-id edit-1 --json
npx weaver build --project demo --locales zh --profiles landscape,portrait,square --plan --json
npx weaver build --project demo --expected-revision REVIEWED_REV --wait --json
npx weaver artifacts --project demo --json
npx weaver artifact show RECEIPT_DIGEST --json
npx weaver export --project demo --format video --dest /absolute/movie.mp4 --json
```

Draft 可为空。Scene 是 card、still 或 clip。静帧使用固定帧或真实语音时长，clip 使用整数微秒源窗，并显式选择源时长或语音时长。超窗默认拒绝，定格和变速由作者设置上限。原声场无需音色。

场景集合变更通过共享规则移除已删除场景的 speech 字幕与遮罩。取消旁白或切换为原声、静音时，同步移除原来绑定该场景的 speech 字幕，保留独立 timeline、source 字幕及轨道设置。CLI 操作、整份项目保存和 Studio 草稿编辑使用同一规则；新提交的无旁白场景或失效场景引用在保存时被拒绝。

build 冻结作者、资产、库、provider 和工具，先准备真实事实，再编译 TimelineManifest。Remotion 只输出无声卡片，FFmpeg 统一画面、字幕、混音与最终封装。低清预览来自同一正式时间轴。

缓存按实际依赖与工具版本查找。改标题保留无关语音，按 locale 的文字与字幕独立失效。交付列表按文件完整性及当前工程与已存制作快照的依赖判断状态，不加载模型或探测当前制作工具。模型和工具配置变化不阻断项目读取或已有视频导出；重新制作时冻结并校验当前环境。历史结果可以显式导出。

实际提交制作必须携带已审核计划返回的 `expectedRevision`。CLI、HTTP 和共享入口均拒绝省略该值，修订变化返回冲突。只读 `build --plan` 可省略它，以取得待审核的当前计划。

视频导出默认选择当前交付，也可用 `--delivery ID` 显式选择旧交付。导出校验视频摘要，复制到目标目录中的临时文件，核对副本后原子发布，不覆盖已有目标。缺失或损坏的交付拒绝导出。桌面按钮与 CLI 使用同一核心路径。目标文件系统不支持排他链接发布时返回明确错误，可先导出到支持的本地目录。

视频、bundle、OTIO 和剪映导出以 requestId 保存请求与首次结果。首次请求固定交付或项目修订，响应丢失后用相同 requestId、目标路径与参数重试。重试验证目标的文件身份和内容，不把任意已有目标认作成功。已准备但尚未确认发布的输出保留在目标目录旁的私有暂存目录，进程退出后可由原请求恢复。参数变化必须使用新 requestId。目标被移动或修改后，原请求返回完整性错误。

预处理素材可在 `asset add` 时传 `--provenance /absolute/provenance.json`。用 `schema media-provenance` 或 `schema media-asset` 读取合同。下面展示字段结构，`version` 的示意值需换成 `project context` 返回的实际 64 位素材版本摘要：

```json
{
  "description": "从原片选取画面，合入参考音轨与字幕画面",
  "inputs": [
    {"source": {"assetId": "source-1", "version": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}, "role": "picture", "range": {"startUs": 0, "durationUs": 20000000}},
    {"source": {"assetId": "ref-2", "version": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}, "role": "audio"}
  ],
  "captions": "embedded"
}
```

来源须为当前项目可读取的精确素材版本，音视频源窗不能越界。记录进入不可变素材版本；项目、构建快照、bundle 和交接包保留来源依赖闭包。`captions` 为 `embedded`、`none` 或 `unknown`；它描述素材画面，独立字幕仍保存在项目 captions。旧素材无记录时保持未知，不推断或改写旧版本。

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

ASR、描述按源版本与窗口保存。describe 的观察和镜头树供作者判断，核心不代写旁白。文本模式按已存证据检索，semantic 模式用 EmbeddingGemma 2 召回同一份字幕与观察文本，可显式使用旧 Qwen3 Reranker 适配重排前 50 个候选，默认返回前 20 个。文本和语义模式都遵守素材和完整证据时间窗过滤。视觉模式使用同一 EmbeddingGemma 2 主干和 mmproj，按五秒窗口的中点帧召回视频；不会读取 ASR 文本，也不会把单帧分数当作整窗内容判断。素材、时间过滤在抽帧前生效。语义分数是归一化向量的余弦相似度，重排分数单列保存；它们不是内容正确率。未配置请求的能力时明确失败，不回退到其它模型。

文本语义检索和画面检索共用 EmbeddingGemma 2 GGUF、mmproj、llama-server 和模型 Python。文本查询使用 `task: search result | query:` 前缀，证据文本使用 `title: none | text:` 前缀；两者执行 mean pooling 和 L2 归一化。文本适配器、前缀、主干与 mmproj 字节、服务二进制和 Python 都进入缓存绑定，文本缓存使用 `embedding-text-v3`，不会复用旧 Qwen3 向量。重排另按查询与候选文本缓存。检索不改写源证据；候选绑定提交时修订，作业成功后才在事务中发布。单条向量输入最多 8192 tokens；重排的查询与单条候选合计最多 7680 tokens，为模型模板预留空间。超限拒绝，不静默截断。

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

源片与独立 ASR 先对完整选择做 VAD，再规划最长 40 秒的上下文，优先在停顿中切分，无停顿时有界均分。声学活动不逐段当作句子转写，外层不再固定重叠切窗。ASR 上下文仍为 estimated；`analyze --with asr --align` 按各上下文的实际文字和音频逐窗对齐，保留原文和词时间，再按当前修订采用为源片字幕。模型仍可能返回无效句界，此时明确失败。

跨窗采用只去重同一来源、相同说话人且文字一致的重叠证据；不同文字保留供作者核对，不按时间重叠丢弃整句。字幕 cue 可在 Studio 编辑文字、时间、来源和临时说话人标签；人工修改清除已失效词时间。Studio 字幕支持正文、原始转写和说话人检索，每页显示 25 条。重叠筛选只比较同一时间钟，修改与移除按 cue 标识作用于完整字幕轨。未提交草稿备份到当前数据目录的客户端状态，桌面另写独立恢复 journal，重新打开后显式恢复；恢复保留原修订基线，过期修订仍进入冲突处理。备份可手动清除。

视频和静帧遮罩按所选输出规格预览，位置保存在项目修订中；卡片遮罩使用坐标示意，并通过制作预览核对实际画面。制作时 card、still、clip 共用视觉分段遮罩处理，遮罩应用在画幅适配之后。

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

Studio 的“模型”页和 `weaver models` 共用公开 `app`、`contracts` 入口。ModelBest 是第一个供应商预设，固定提供 `MiniCPM-V-4.7-35B-A3B` 与 `VoxCPM2`；获取 Key 的入口是 `https://platform.modelbest.cn/`，接口文档是 `https://platform.modelbest.cn/console/docs`。

```bash
npx weaver models list --json
npx weaver models settings get --json
npx weaver models settings set --file /absolute/model-settings.json --json
npx weaver schema model-settings --json
npx weaver models download qwen3-asr --wait --json
npx weaver models verify qwen3-asr --json
npx weaver models use qwen3-asr --path /absolute/qwen3-asr --expected-revision CONFIG_REV --json
npx weaver models use-provider modelbest --expected-revision CONFIG_REV --json
```

本地目录由 TypeScript 声明式 catalog 提供。每条发布固定 repository、revision、文件路径、大小和 SHA-256；不接受任意下载 URL。下载输入只接受 catalog 模型 ID 和根目录，路径拒绝绝对文件项、`..` 与控制字符。下载作业沿用现有 Jobs 取消、恢复、重试和事件，模型下载单独使用六小时时限。

下载只把缺失或校验失败的文件写入本次 attempt 的独立暂存区。每个文件按固定大小与 SHA-256 校验后，才以不覆盖方式发布到用户根目录下的版本目录；内容冲突时保留原件并报告错误。取消或失败不会标为下载成功，已校验发布的完整文件可供重试复用，未读响应流会主动取消。状态页分别检查当前生效路径和下载目录的元数据；Studio 可分别校验当前模型或下载目录，CLI `verify` 校验下载目录。校验与采用按目录清单对比，其他模型版本可能不同；只有显式校验、成功下载和采用已有路径才读取并哈希完整文件。Qwen ASR GGUF 可把任意文件名的既有文件直接传给 `models use`；ForcedAligner 与 EmbeddingGemma 的目录绑定要求完整模型目录。TEN VAD 与其它原生运行库由引擎安装管理。下载不会复制到 CAS，也不会隐式写入配置。

模型下载根目录、模型采用路径及配置中的相对路径按运行时的 `configBase` 解析。源码入口（仓库 CLI、浏览器 Studio、源码桌面）默认以仓库为配置基准，正式桌面包以配置文件所在目录为基准。普通 CLI 文件参数的相对路径按当前工作目录解析；视频导出的 `--dest` 要求绝对路径。保存 ModelBest Key 不会改变运行时预设；`models use-provider modelbest` 或 Studio 的“采用 ModelBest 预设”会一次写入 `vlm_provider`、`vlm_model`、`tts_model`。SettingsView 返回三项的有效值与来源，配置来源保持可见。

内置 `model_download_root: 'models'` 在源码模式按 monorepo 根目录解析，因此 CLI、浏览器 Studio 和源码桌面默认下载到根目录的 `models/`，与私有配置文件位置无关。正式桌面包没有 monorepo，默认使用运行时的用户模型目录。源码模型目录只有根目录 `models/`；`weaver/models/` 是旧版布局，不再读取或写入。私有配置或环境变量显式指定的下载根目录仍按 `configBase` 解析，优先级保持不变；根目录 `models/` 不进入 Git。

配置值按运行时 `configFile`（私有本地配置）、环境变量、内置 `config.yaml` 默认值的顺序解析。三者中的空字符串和纯空白值都视为未设置。`source=file` 表示私有本地配置，`source=environment` 表示环境变量，`source=default` 表示 `config.yaml` 或代码缺省值，`source=unset` 表示没有有效值。源码内置默认文件位于仓库根目录 `config.yaml`；桌面包内位于 `currentRuntime.resourcesDir/config.yaml`。私有覆盖继续写入 `runtime.configFile`，相对路径仍按 `runtime.configBase` 解析。

`config.yaml` 的 API Key 字段必须保持空字符串，不得提交真实凭据。用户应通过设置页或私有本地配置文件提供凭据；在源码环境，该文件是忽略的 `config.local.yaml`。桌面设置保存密钥后立即采用新值，无需重启；清除私有本地配置中的密钥后，如果环境变量有非空值则立即回退到环境变量，否则回到未配置状态。

配置写入、供应商预设和已有模型采用均需读取 `models settings get` 的 revision，写入时沿用该 expectedRevision 和稳定 requestId。响应丢失后重放原请求，不重新计算 expectedRevision。

`config.local.yaml` 更新只接受平面白名单，保留无关行与密钥，拒绝控制字符。保存先冻结 expected revision，再在 `config.local.yaml.lock` 短临界区内重读；锁遗留按空锁宽限、owner PID 存活和文件 dev/ino 身份回收。配置与私有请求收据注释一起同步并原子替换，权限为 `0600`。逻辑 revision 排除这些内部收据注释。收据保存请求指纹和不含明文密钥的首次结果。相同请求重放首次结果，不同参数复用 requestId 被拒绝。密钥空输入保持现值，清除必须显式请求；私有本地文件优先于环境变量，清除本地密钥后回退到环境变量。SettingsView 只暴露是否配置和来源。

| 能力 | 当前适配 | 配置 |
| --- | --- | --- |
| TTS、音色设计 | ModelBest VoxCPM2 SSE 音频事件 | MODELBEST_API_KEY、LIGHTWEAVER_TTS_MODEL |
| VLM | ModelBest MiniCPM-V 或 DeepSeek flash | MODELBEST_API_KEY、DEEPSEEK_API_KEY，analyze --provider |
| VAD 与 ASR | TEN VAD native ABI、Qwen3 GGUF transcribe ABI | LIGHTWEAVER_MODEL_PYTHON、LIGHTWEAVER_VAD_LIBRARY、LIGHTWEAVER_ASR_MODEL、TRANSCRIBE_LIBRARY、LIGHTWEAVER_ASR_BINDINGS |
| 精确对齐 | Qwen3 ForcedAligner，Torch 默认，MLX 显式兼容 | LIGHTWEAVER_ALIGNMENT_MODEL、LIGHTWEAVER_ALIGNMENT_BACKEND、LIGHTWEAVER_ALIGNMENT_DEVICE |
| 文本和视觉向量 | EmbeddingGemma 2 GGUF 与 mmproj，mean pooling | LIGHTWEAVER_VISUAL_MODEL、LIGHTWEAVER_VISUAL_MMPROJ、LIGHTWEAVER_VISUAL_SERVER |
| 重排 | Qwen3 Reranker GGUF，rank pooling | LIGHTWEAVER_RERANKER_MODEL，search --rerank |
| 本地语音 | VoxCPM2 Torch | LIGHTWEAVER_LOCAL_TTS_MODEL、LIGHTWEAVER_SPEECH_PYTHON |
| 字幕翻译 | Hy-MT2 GGUF | LIGHTWEAVER_TRANSLATION_MODEL、LIGHTWEAVER_TRANSLATION_SERVER |
| 说话人分段 | MOSS Transcribe Diarize GGUF | LIGHTWEAVER_DIARIZATION_MODEL，加 ASR 原生运行时 |

本地模型 Python 由 `LIGHTWEAVER_MODEL_PYTHON` / `model_python` 指定，并实际启动 ASR、对齐和视觉子进程。默认路径相对 `configBase`，Windows 为 `weaver/.venv/Scripts/python.exe`，其他平台为 `weaver/.venv/bin/python`。推荐用 `weaver engines install python-model` 创建独立环境并采用；也可在设置页指定已有环境的绝对路径。`llama_server` 只服务于显式配置的 GGUF 能力；ASR 执行链使用 TEN VAD、`transcribe` native library 和 Python bindings，不使用 `llama-server`。相对配置路径按运行时配置基准解析，不读取相邻仓库配置或 Python 环境。默认 `requirements.models.txt` 在所有平台安装 `qwen-asr`；MLX 只在显式安装 `requirements.models.mlx.txt` 后可用。权重路径需要显式设置，不自动下载。

每次 GGUF 执行绑定临时 loopback 端口及独立凭据，关闭代理，完成或失败后回收服务。模型 Python 与子服务同属作业进程组，取消一并终止。doctor 检查文件、可执行文件和对齐依赖，不加载权重或发送推理请求；ready 只表示配置与依赖条件满足。

本地文件内容摘要进入绑定。远端模型输出可能不确定，缓存复用已验证的实际字节。`--regenerate` 使用新 generation。远端不支持幂等，取消只中止本地等待，远端结果可能未知。本轮模型预设与安装的验收证据和限制见[模型预设与本地安装验收](acceptance-model-setup.md)。

`weaver doctor` 显示工具、依赖、配置和目标剪映版本。它不发送模型请求。模型功能确认见[架构升级验收](acceptance-v2.md)、[强制对齐和检索验收](acceptance-alignment-search.md)、[能力落地验收](acceptance-coverage.md)、[连续影视素材验收](acceptance-long-form.md)与[全片精确对齐根因与验收](acceptance-alignment-root-cause.md)。

## 引擎运行时

Studio 的“运行时与路径”和 `weaver engines` 管理本地引擎：transcribe 运行库与 Python bindings、TEN VAD、llama-server，以及模型与语音 Python 环境。引擎与模型权重分开。引擎是固定版本、固定平台的官方预编译产物或由本应用创建的独立环境；权重仍由“模型”页下载。

```bash
npx weaver engines setup --expected-revision CONFIG_REV --wait --json
npx weaver engines list --json
# 高级或自动化：单独处理某个组件
npx weaver engines install transcribe-native --wait --json
npx weaver engines verify transcribe-native --json
npx weaver engines use transcribe-native --expected-revision CONFIG_REV --json
npx weaver schema engine-settings --json
```

Studio 的“本地运行环境”只提供一个“一键下载并配置”主操作：依次安装 transcribe 运行库、Python bindings、TEN VAD、llama-server 和模型 Python 环境，最后一个作业节点一次写入配置。用户不需要指定路径，也不需要先理解“下载、校验、采用”的逐步操作；已安装且校验通过的部分会复用，中途失败时保留已下载组件，重试继续。语音 Python 环境体积大，单独按需创建。单个组件的安装、校验、采用和手动路径输入收在高级设置里，供自定义运行库或排障使用。

`engines list` 返回解析后平台的 catalog。transcribe 运行库与 TEN VAD 固定到当前平台的发布摘要，transcribe bindings 固定 PyPI wheel 摘要，llama-server 固定 llama.cpp 发布 build；不接受任意下载 URL，也不在用户机器上编译 C++。目录只声明发布地址、归档大小与 SHA-256、归档内顶层目录、解压后每个必需文件的路径、大小和 SHA-256。下载只写入本次作业暂存区；归档先按 SHA-256 校验，解压时拒绝绝对路径、`..` 与越界软链，解压后再逐个文件校验，最后以目录重命名原子发布。已安装目录带 `.lightweaver-engine.json` 标记；目标目录存在但无标记时不覆盖，保留用户自己的文件。

引擎安装根目录取 `engine_install_root`（环境变量 `LIGHTWEAVER_ENGINE_ROOT`）。未显式配置时，源码入口使用仓库 `weaver/runtime/`（Git 忽略），正式桌面包使用数据目录下的 `runtime/`。显式相对路径按 `configBase` 解析。安装目录固定为 `<根>/<引擎 ID>`，重新安装同版本会复用已校验内容，升级版本替换本应用安装的目录。

`engines setup` 是上述单组件流程的组合：五个安装节点按顺序执行，最后一个 `engine-adopt` 节点重新校验全部组件后一次写入配置，写入继续受 expectedRevision 保护。`engines use`（高级）先完整校验单个引擎，再把绑定写入私有配置：transcribe 运行库写 `asr_library`，bindings 写 `asr_bindings`，TEN VAD 写 `vad_library`，llama-server 同时写 `visual_server`、`llama_server` 与 `translation_server`，Python 环境写 `model_python` 或 `speech_python`。采用沿用 `models settings get` 的 revision 与稳定 requestId，先校验后写配置；下载或安装本身不会隐式改写配置。

Python 环境由 `python-model`、`python-speech` 两个引擎项创建：优先使用运行时 Python，否则从 PATH 找 Python 3.10 以上解释器，创建 venv 后按 `weaver/requirements.models.txt` 或 `weaver/requirements.speech.txt` 安装依赖，失败时删除本次新建的环境。作业使用六小时时限，取消会终止 pip。校验会读取已安装包版本与 requirements 的固定版本对比；语音环境的 torch/voxcpm 体积较大，安装时间取决于网络。

TEN VAD 已从模型目录迁入引擎。旧配置中的 `vad_library` 路径继续有效；`models use ten-vad-*` 不再是模型命令，改用 `engines use ten-vad` 或设置页直接填写路径。引擎安装与采用的实际证据和平台范围见[引擎运行时安装验收](acceptance-engine-setup.md)。

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

失败与取消保留已完成独立目标及上一份有效交付。作业总时限返回 `DEADLINE_EXCEEDED`，用户取消与 worker 停止分别登记 cancelled 与 interrupted。工具探测接收节点取消信号。媒体监督进程通过父进程管道与 IPC 断连感知 worker 退出。POSIX 终止目标进程组；Windows 用 PowerShell 宿主中的 Job Object 拥有进程树，目标先挂起、加入 Job 后才运行，停止或宿主退出会回收后代。三秒宽限后仍未退出的监督宿主会被强制停止。界面上的“取消”只表示请求已提交，进程回收以监督结果为准。lease、attempt token 和目标代次约束发布。完成收据进入 DB 与 CAS 引用，备份后也能复用；本地旧 attempt 工作收据支持崩溃恢复。

## 桌面客户端

```bash
make desktop          # Electron + Vite HMR + 动态端口服务
make desktop-package  # 本机未签名可运行包
make desktop-dist     # 未签名安装分发包
```

Studio 的“保存”一次写入文档与待审创作方案；“保存并制作”先完成该写入，再以返回的精确 expectedRevision 提交制作。保存方案不会自动采用场景。等待保存期间产生新文档或方案编辑时，保留草稿并暂停制作；保存或提交制作的响应丢失时，相同内容重试复用 requestId。离开项目时选择保存也使用同一写入。创建项目和导入项目包的失败重试保留请求身份，确认成功后才结束该操作。

冲突界面保留本地草稿并展示内容差异。加载服务器内容前先备份、重新读取 head；服务器又更新时要求重新查看差异。备份、读取及恢复的回调绑定项目、会话代次和草稿序号，不能清除期间的新编辑，也不能向新项目展示旧项目的恢复 journal 错误。

`make studio` 继续使用仓库 `data/.weaver` 与 Vite。桌面开发包和正式包默认把数据库写到用户目录，不写安装目录或仓库数据；源码桌面的私有配置与仓库 CLI、浏览器 Studio 共用仓库根 `config.local.yaml`。`LIGHTWEAVER_USER_DATA` 可隔离桌面的数据目录与偏好。正式服务和 CLI 使用随包 Node；bundle 内的 `bin/weaver`（Windows 为 `bin/weaver.cmd`）默认读取同一桌面偏好，也可用 `--data-dir`、`--config-file`、`--config-base` 显式覆盖。

打包支持 `darwin-arm64`、`darwin-x64`、`linux-x64`、`win32-x64`，需在对应宿主执行 `npm run package -w @lightweaver/desktop -- --target=目标`。普通 package 生成可运行目录，`--dist` 再生成安装分发包；不支持的目标或跨宿主构建在修改 staging 前失败。Node、FFmpeg、Chrome、交接 Python 和 sidecar 依赖随包固定，最终 Resources 按 SHA-256 与原生架构核验。签名和公证不在这些命令里。

交接 Python 自带 OTIO 与剪映导出依赖。模型 Python 仍由用户单独安装并指定，设置页提供包内 requirements、创建环境命令和 native library/bindings 路径字段。首次启动不会安装模型依赖或下载权重。项目首页可导入 bundle ZIP 或目录；模型完整性检查与真实推理作业结果分别展示。

客户端状态先加载再重放待保存操作；冲突时按最新状态重放，备份清除需服务端确认。桌面每次编辑同时写入当前数据目录的独立恢复 journal，重启前等待写盘。草稿恢复保留原修订基线，转换操作期间的新编辑不会绕过修订冲突。“保留草稿并加载当前修订”在备份前绑定项目、会话、修订基线与草稿序号；等待期间有新编辑时，保留草稿和冲突状态，由用户再次确认加载。并发保存推进修订后，旧加载操作也会失效。桌面关窗提供后台运行、停止后台并退出、取消三项；后台运行先等待草稿写盘并建立托盘恢复入口，再隐藏窗口。停止后台先处理草稿，随后回收本地服务和作业进程。菜单退出仍确认活动作业，隐藏窗口会先恢复以显示确认。主进程串行协调关窗与退出，浏览器仍使用离站提示。验收证据与平台限制见 [桌面客户端验收](acceptance-desktop.md)。

备份使用 SQLite backup API，并复制快照引用的不可变 blob。restore 核对备份数据库实际引用、清单集合与元数据，以及每个文件的大小和 SHA-256；全部通过后才发布到空目录，失败会清理暂存。GC 默认 dry-run，保护修订、库版本、run、收据、pin 和保留交付。迁移保留旧原件，旧派生结果无完整来源时登记 historical/unverified。rollback 只在迁移后未被修改时执行。
