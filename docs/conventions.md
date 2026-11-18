# 运行合同与命令参考

本文档是 LightWeaver 的工程接口与运行时合同参考，涵盖数据目录布局、CLI/HTTP 协议、编辑与制作约束、分析与检索规则、模型与运行组件边界，以及桌面客户端的并发与恢复机制。

## 数据位置

| 位置 | 内容 |
| --- | --- |
| `data/.weaver/state.sqlite3` | 项目 `head`、不可变修订、素材与库版本、作业、事件、候选与交付记录 |
| `data/.weaver/blobs/<prefix>/<digest>` | SHA-256 内容寻址存储（CAS）字节文件 |
| `data/.weaver/work/<node>/<attempt>` | 作业节点的独立 attempt 工作目录与本地完成收据 |
| `data/.weaver/materialized/` | 可重建的友好文件名副本 |
| `data/.weaver/backups/` | 按需创建的一致性数据库与引用 blob 备份 |
| `library/` | 可复用内置包与预设的显式导入来源 |

- **运行根目录**：默认使用工作区 `data/.weaver/`，可通过环境变量 `LIGHTWEAVER_DATA_DIR` 或 CLI 参数 `--data-dir` 覆盖。
- **可搬迁性**：项目 ID 独立于创作方法、工作流或文件系统目录；数据库内的路径引用只保存相对值，因此完整 `state.sqlite3` 与 `blobs/` 目录可以整体迁移到其他路径或机器。
- **JSON 角色**：JSON 仅用于显式导入导出和不可变快照交换，不作为并发运行时的直接读写存储。

## 公开入口

### 模块边界与工作区发现

- **公开入口**：Node 产品层只使用 `@lightweaver/weaver/app`，浏览器前端只使用 `@lightweaver/weaver/contracts`。
- **能力与运行时自省**：`weaver capabilities` 返回工作流、输出规格（profile）、provider 描述符与内置包版本。`capabilities` 与 `doctor` 返回的 `runtime` 字段标明了当前生效的数据目录（`dataDir`）和配置文件（`configFile`），供外部 agent 核对目标工作区。
- **跨目录协作命令**：`capabilities`、Studio 设置页（"诊断与修复 → 运行信息与命令行"）以及 `project brief`（对应 Studio 中的 **复制给 agent**）均会给出绑定了绝对 Node 路径、CLI 入口、数据目录、配置文件与配置基准（`--config-file`、`--config-base`）的完整命令。在桌面项目或其他工作目录协作时，应直接使用该完整命令；下文 `npx weaver ...` 示例默认在源码工作区根目录执行。
- **动态 Schema**：`weaver schema` 的输出由运行时 Zod 合同实时生成。

### CLI 协议、流式输出与帮助发现

```bash
npx weaver --help --human
npx weaver scene add --help --human
npx weaver project list --human
```

- **stdout / stderr 契约**：
  - 成功响应：`{ok:true,result,requestId}`。
  - 错误响应：`{ok:false,error:{code,message,retryable,details,hints}}`。
  - CLI 默认输出带缩进的 JSON；传入 `--json` 输出单行紧凑 JSON；终端用户可显式使用 `--human` 输出紧凑人类可读文本（`--human` 与 `--json` 互斥）。所有运行日志均写入 `stderr`。
- **进度与事件流**：
  - `--wait` 在交互式终端（TTY）中默认将阶段进度输出到 `stderr`；非终端管道如需进度需显式加 `--progress`。`stdout` 始终保持最终结果契约。
  - CLI `events` 输出 JSONL，`run events` 返回事件数组；HTTP 接口返回与 CLI 相同的成功/错误结构，SSE 事件流（`/api/runs/:id/events`）使用单调递增 `seq` 并支持 `Last-Event-ID` 断点续传。
- **帮助与参数校验**：`--help` 与 `-h` 在创建 `Application` 之前解析（不触发数据库初始化）。帮助生成与参数校验共用同一份命令描述，必填参数会自动列入帮助与允许参数列表，未知参数直接报错拒绝。

### 并发控制、幂等重试与基础写入

- **乐观锁与墓碑**：项目写入必须携带 `expectedRevision`，库写入必须携带 `expectedVersion`；发生并发冲突时（`REVISION_CONFLICT`）返回当前最新内容。`requestId` 标识一次逻辑请求，相同请求可安全重试。删除库 `head` 仅写入墓碑标记，已发布的精确库版本仍可按版本摘要读取。
- **素材导入重试（`asset add`）**：
  - 正常机制：导入按文件内容 SHA-256 摘要和请求参数（含素材名、类型与 MIME，包括由文件名推导的默认值）识别重试，不以临时上传路径作为请求身份。已完成请求重放首次导入的素材与修订结果，并沿用首次的 `expectedRevision`。
  - 边界处理：同一 `requestId` 对应不同文件字节或不同元数据参数时返回 `REQUEST_ID_REUSED`；重试时仍需提供相同的原始文件字节。
- **示例项目与场景追加**：
  - `project create --sample` 与 Studio 的 **打开示例** 调用同一项目创建事务，生成三张无旁白文字卡片（每张 90 帧），默认规格为 1920×1080、30 fps，不导入素材也不调用模型（正式渲染制作仍需 FFmpeg、ffprobe 与 Chrome）。
  - `scene add` 在共享项目写入入口按 `requestId` 查重、校验 `expectedRevision`，再解析源素材与时长；修改请求参数不得复用旧 `requestId`。`card` 的 `body`、`label` 可省略，`locale` 必须属于项目语言列表；`still` 与 `clip` 需传入当前修订中的精确素材引用。

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

### 场景时间与引用一致性

- **正常机制**：
  - 项目草稿（`ProjectDocument`）初始可为空。场景（`Scene`）支持 `card`（文字卡片）、`still`（静帧图片）与 `clip`（视频片段）。
  - `card` 与 `still` 使用固定帧数或实际语音时长；`clip` 使用整数微秒源区间，显式选择按源窗时长（`source`）或语音时长（`speech`）播放。选择原声（`original`）或静音（`silent`）时无需配置音色。
  - 当场景集合变更（删除场景、取消旁白或将语音切换为原声/静音）时，CLI `project apply`、整份项目保存和 Studio 草稿编辑共用同一清理规则（`reconcileSceneReferences`）：自动移除已删除场景绑定的 `speech` 字幕与遮罩，同步移除失去语音的场景关联的 `speech` 字幕，同时保留独立的 `timeline` 字幕、`source` 字幕以及字幕轨样式设置。
- **边界与故障处理**：
  - `clip` 选择按语音时长播放且旁白超出选定源窗时，默认策略 `reject` 会直接报错拒绝（`NARRATION_OVERFLOW`）；作者可显式改用有限定格（`freeze` 上限帧数）或显式变速区间（`speed`）。
  - 新提交的无效引用（如 `speech` 字幕指向无旁白场景或已删除场景）会在保存时被拒绝。

### 制作流程、缓存与预览

- **两阶段制作**：`build` 先冻结作者文档、素材版本、库版本、模型 provider 与本地工具版本，随后运行准备节点（probe、语音合成、对齐等）获取真实事实，再由纯编译器输出 `TimelineManifest`。Remotion 只渲染无声文字卡片，FFmpeg 统一负责画面拼接、字幕烧录、混音与封装；低清预览（proxy）由同一份正式时间轴生成。
- **计划审核与提交约束**：只读预演 `build --plan` 可省略 `--expected-revision`，用于获取当前待审核计划与修订号；**实际提交制作**必须显式携带计划返回的 `expectedRevision`，CLI、HTTP 与共享应用入口均拒绝省略该值，期间若修订发生变化则返回 `REVISION_CONFLICT`。
- **缓存与交付状态判断**：
  - 缓存按实际依赖与工具版本精确查找：例如修改项目标题不会使无关语音缓存失效，不同语言（`locale`）的文案与字幕各自独立失效。
  - 交付列表仅依据交付文件完整性以及当前工程与已保存制作快照之间的依赖指纹计算状态（`current` / `stale` / `historical` / `missing`），不加载模型也不探测当前本地工具。模型或工具配置变更不会阻断读取项目或导出已有视频；只有在重新执行 `build` 时，才会重新冻结并校验当前环境。历史有效交付仍可显式导出。
- **Studio 成片预览与导出会话绑定**：
  - Studio 展开成片预览时读取该交付自身保存的不可变时间轴，场景定位严格按成片本身的场景与帧率计算，不引用当前编辑草稿。
  - 导出操作在打开系统选择器之前即绑定当前项目会话代次与所选交付 ID；选择期间重复点击不会重复弹出选择器，离开并重新进入项目后，旧选择器的返回结果不再触发导出。

### 交付导出与幂等发布

- **正常流程**：
  - 视频导出默认选择当前交付（`current`），也可通过 `--delivery ID` 显式指定旧交付。桌面客户端按钮与 CLI 共用同一导出核心路径。
  - 导出前先校验交付文件摘要，再写入目标目录旁的私有暂存目录（`.lightweaver-export-<nonce>`）中的临时文件，校验副本无误后原子发布到目标路径。
- **边界与故障处理**：
  - 缺失或损坏的交付（`missing`）拒绝导出；导出目标已存在时拒绝覆盖（不覆盖已有文件或目录）。若目标文件系统不支持排他链接/重命名发布（`renamex_np` / `renameat2`），会返回明确错误，可先导出到支持的本地文件系统目录。
  - 视频、项目包（`bundle`）、OTIO 与剪映导出均按 `requestId` 保存首次请求及冻结目标（交付 ID 或项目修订）。若导出过程中或响应丢失后中断，必须使用**相同的 `requestId`、目标路径与完整参数**重试：系统会校验目标的文件身份（device/inode）与内容摘要，绝不把目标路径上的任意已有文件当作成功。已准备就绪但尚未确认发布的输出保留在目标目录旁的私有暂存目录中，进程退出后仍可由原请求恢复完成。
  - 改变导出参数或目标路径必须更换新的 `requestId`（否则返回 `REQUEST_ID_REUSED`）；如果已导出的目标文件被移动或修改，重放原请求会返回完整性错误（`INTEGRITY_FAILED`）。

### 素材来源记录（provenance）

预处理素材可在 `asset add` 时通过 `--provenance /absolute/provenance.json` 附加来源记录。使用 `weaver schema media-provenance` 或 `weaver schema media-asset` 查看完整合同。下面展示字段结构（`version` 示意值需替换为 `project context` 返回的实际 64 位素材版本摘要）：

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

- 来源必须指向当前项目内可读取的精确素材版本（`assetId` + `version`）；仅音视频来源可附带 `range` 时间窗，且不得超出实际媒体时长。
- 来源记录写入不可变素材版本；项目、构建快照、`bundle` 与交接包均保留完整来源依赖闭包。
- `captions` 取值为 `embedded`、`none` 或 `unknown`，用于标记素材画面是否内嵌烧录字幕（独立字幕轨仍保存在项目 `captions` 字段）；旧素材无来源记录时保持未知，不会自动推断或改写旧版本。

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

### 观察与证据记录

- ASR 转写与画面观察（`describe`）均按源素材精确版本与时间窗保存。
- `describe` 生成的画面观察与镜头树仅作为客观创作证据供作者判断，核心层不代写旁白。

### 文本、语义与视觉检索

- **三种检索模式**：
  - `text`（文本检索）：按已存储的字幕与画面观察文本检索。
  - `semantic`（语义检索）：使用 EmbeddingGemma 2 对同一份字幕与观察文本进行向量召回（最多召回前 50 个候选），默认返回前 20 个；传入 `--rerank` 可显式调用 Qwen3 Reranker 对前 50 个候选重排后再截取返回。
  - `visual`（视觉检索）：共用 EmbeddingGemma 2 主干权重与 `mmproj`，按 5 秒时间窗截取中点帧进行画面召回（仅支持视频源）。该模式不读取 ASR 文本，也不将单帧相似度等同于整段窗口内容判断。
- **过滤、计算与缓存绑定**：
  - 文本与语义模式均遵守 `--sources` 素材过滤与完整证据时间窗过滤；视觉模式在抽帧前即生效素材与时间过滤。
  - 语义与视觉检索共用 EmbeddingGemma 2 GGUF、`mmproj`、`llama-server` 与共享 Python。文本查询拼接 `task: search result | query: ` 前缀，证据文本拼接 `title: none | text: ` 前缀，均执行 `mean` pooling 与 L2 归一化。文本缓存键为 `embedding-text-v3`（不复用旧 Qwen3 向量），同时绑定适配版本、前缀、模型与 `mmproj` 字节、`llama-server` 二进制及 Python 环境；重排另按查询与候选列表缓存。
  - 语义分数为归一化向量的余弦相似度，重排分数单独列示，均仅表示相似度而非内容正确率。
- **输入上限与失败边界**：
  - EmbeddingGemma 2 上下文窗口为 `8192` tokens，关闭静默截断（`truncate: false`）；重排请求的单条"查询 + 候选"合计最多 `7680` tokens（为模型模板预留空间），超限直接拒绝（`INPUT_TOO_LONG`），不静默截断。
  - 缺少所请求的检索或重排能力时直接失败（`CONFIG_MISSING`），不会静默回退到其他模型。检索不修改源证据，生成的候选绑定提交时的项目修订，作业成功后才在事务中发布。

### 人工证据导入与候选裁剪

- **人工证据导入**：文件格式为 `[{sourceId,startUs,durationUs,text}]`，通过 `analyze --import /absolute/evidence.json --expected-revision REV --wait` 校验源区间并导入。
- **外部候选导入与应用**：外部候选需符合 `schema proposal`，通过 `proposal import --file /absolute/proposal.json --expected-revision REV --wait` 校验并保存。应用选中候选会生成新修订并保留选择记录；`proposal apply --ranges /absolute/ranges.json` 可传入 `{候选ID:{startUs,durationUs}}` 进行裁剪，裁剪范围必须完全包含在所选候选窗之内。Studio 提供同等的预览与裁剪能力。

## 创作方案

```bash
npx weaver creative-plan import --project demo --file /absolute/plan.json --expected-revision REV --json
npx weaver creative-plan show --project demo --json
npx weaver creative-plan apply --project demo --expected-revision REV --json
```

- **读取与合同**：外部 agent 通过 `project context` 获取当前项目修订、分析证据、素材与候选，通过 `schema creative-plan` 获取创作方案结构（包含标题、概述、分场 `beats`、`scene`、理由 `rationale` 与源证据引用 `evidence`）。
- **保存与采用**：
  - 导入保存创作方案会生成新项目修订，此时现有场景保持不变，仍可用于制作；Studio 审核同一个方案，且在采用前会要求先保存本地草稿。
  - `creative-plan apply` 默认替换当前场景列表，传入 `--append` 时改为追加。
- **边界校验**：方案引用的所有证据必须属于当前项目，且素材版本与时间区间必须精确匹配；不含分析证据的人工选段也可按合同保存。方案及其引用依赖随项目包（`bundle`）一起保存。

## 字幕与声音

```bash
npx weaver captions import --project demo --file /absolute/subtitles.srt --locale zh --expected-revision REV --json
# 源片字幕额外带 --source-id ASSET --source-version DIGEST
```

### 字幕时间坐标与导入

- 支持导入人工 SRT、VTT 文件，每条字幕 `cue` 的时间可映射到成片时间轴（`timeline` 帧）、源媒体（`source` 微秒）或场景语音（`speech` 微秒）。
- 每条 cue 的 `timingQuality` 分别标记为 `manual`、`native`、`aligned` 或 `estimated`。`precise` 字幕模式在缺少对齐能力时报错；使用估算时码（`estimated`）必须显式选择。SRT、ASS、画面烧录与交接包共用同一套 cue 数据。

### 精确强制对齐（ForcedAligner）

- `precise` 对齐固定使用 Torch 后端的 `Qwen3-ForcedAligner-0.6B`。
- 支持语种：`zh`、`yue`、`en`、`de`、`es`、`fr`、`it`、`pt`、`ru`、`ko`、`ja`。带区域后缀的标签（如 `zh-CN`）取主语种，拒绝 `auto` 及未支持语种（`ALIGNMENT_LANGUAGE_UNSUPPORTED`）。
- 边界与校验：单场景语音最长 **180 秒**，音频统一重采样为 16kHz 单声道。对齐严格按作者原文分句，通过实际词/字时间戳推导句界；若出现空结果、原文覆盖不完整（`ALIGNMENT_TEXT_MISMATCH`）或无效/倒序时码，直接报错失败，绝不伪造 `aligned` 字幕。

### 源片 ASR 切窗与跨窗去重

- **正常流程**：源媒体与独立音频 ASR 先用 TEN VAD 对完整选段执行语音活动检测，再规划最长 **40 秒**的上下文窗口——优先在停顿中点切分，无停顿时有界均分，避免外层固定重叠切窗，也不直接把声学活动边界当作句子边界转写。
- **对齐升级**：纯 ASR 产出的上下文标记为 `estimated`；执行 `analyze --with asr --align` 时，系统按各上下文窗的实际文本与音频逐窗对齐，保留原文和词时间，再通过 `captions from-analysis` 按当前修订采用为源片字幕。若对齐模型返回无效句界，仍明确报错失败。
- **跨窗采用去重规则**：采用分析结果为源片字幕时，**仅去重**同一素材来源、相同说话人（`speakerId`）且文本一致的重叠证据（按 `aligned > native > manual > estimated` 优先级选择）；对于时间重叠但文本不同的证据，全部保留供作者核对，不按时间重叠丢弃整句。

### Studio 字幕编辑、检索与重叠筛选

- Studio 中支持修改单条 cue 的文本、时间、来源与临时说话人标签；人工修改文本或时间后，会自动清除已失效的词级时间戳（`words`）并将该条标记为 `manual`。
- 字幕列表支持按**正文、原始转写（`sourceText`）与说话人**检索，每页固定显示 **25 条**。
- "仅看重叠"筛选仅在同一时间钟内部比较时间区间（`timeline` 内部、同一 `source` 内或同一 `speech` 场景内）；编辑与移除均按 cue 唯一标识作用于完整字幕轨。

### 字幕翻译与说话人分段

```bash
npx weaver captions translate --project demo --locale zh --target-locale en --expected-revision REV --wait --json
npx weaver captions apply-translation --project demo --run RUN --expected-revision REV --json
npx weaver speakers analyze --project demo --source-id SOURCE --locale zh --wait --json
npx weaver speakers apply --project demo --run RUN --expected-revision REV --json
npx weaver voice-design --provider local-voxcpm2 --text "试听内容" --style "温和自然" --wait --json
```

- **字幕翻译（Hy-MT2）**：保留 cue 标识、原句界、源引用及原文（`sourceText` / `translationSourceText`），清除与译文不再对应的词时间戳。采用后轨道记录 `translationLocale`，制作语音语言与原声保持不变。对已有译文轨再次发起翻译时，自动以保留的原文为基础重新翻译。
- **说话人分段（MOSS）**：MOSS Transcribe Diarize GGUF 仅支持中文（`zh`）与英文（`en`）；每窗最长 **40 秒**，说话人标签仅带有窗口局部作用域，系统不跨窗推断或合并同一人物身份。
- **采用与轨道保护**：翻译与说话人分段作业完成后均不会自动覆盖项目字幕，必须按 `run` 显式采用。按 run 采用局部说话人结果时，只替换与作业时间窗重叠的 `source` 字幕，窗口外 cue 保持不变。禁止将原文分析结果混入仍保留译文 cue 的轨道；完整恢复原文后才会清除 `translationLocale` 标记。
- **Studio 共享作业订阅**：Studio 字幕翻译、音色试听与参考音频转写共用作业订阅机制，按项目、语言或音色表单隔离结果；提交响应丢失时自动重放同一 `requestId`，不重复创建任务；取消或恢复请求失败也不停止进度订阅。任务页与工作区均按当前作业实际完成节点数计算进度，重试时重新反映未完成步骤。

### 视觉遮罩

- 视频与静帧遮罩按当前选定的输出规格（profile）实时预览，归一化位置保存在项目修订中；卡片（`card`）遮罩在编辑器中使用坐标示意，通过制作预览核对实际画面。
- 正式制作时，`card`、`still`、`clip` 共用同一视觉分段遮罩管线，且遮罩应用在画幅适配（`contain` / `cover`）**之后**。

### 语音合成与声音计划

- **本地 VoxCPM2 克隆模式**：本地音色可通过 Studio 上传参考音频或音色设计试听后收下入库；音色的 `provider` 随库版本保存，场景级别的 `Speech.style[locale]` 可覆盖音色默认风格。本地合成时，有 `style`（或无参考文本）时走**可控克隆**（仅向模型传参考音频与风格），无 `style` 且有参考文本时走**续写克隆**，两种模式不混用。
- **语音缓存绑定**：真实文本、风格、参考音频和模型绑定共同决定 TTS 语音缓存；本地 VoxCPM2 绑定还会摘要实际 Python `site-packages` 目录内容，环境包字节变化会使旧缓存失效。
- **声音计划与成品校验**：声音计划统一管理原声、旁白语音、BGM、增益、裁剪、循环、淡入淡出、旁白驱动闪避（ducking）以及最终响度目标（默认 `-16 LUFS`、`-1 dBTP` 真峰值）。纯静音节目不填写虚构响度测量值。正式视频封装后验证总帧数、规格与解码音频采样数（48kHz 双声道，AAC 编码允许最多 **2048 个**额外 padding 样本）。

## 模型边界

Studio 的"设置 → 模型与供应商"页与 `weaver models` 共用公开 `app`、`contracts` 入口。ModelBest 是首个云端供应商预设，固定提供 `MiniCPM-V-4.7-35B-A3B` 与 `VoxCPM2`；获取 Key 入口为 `https://platform.modelbest.cn/`，接口文档见 `https://platform.modelbest.cn/console/docs`。

```bash
npx weaver models list --json
npx weaver models settings get --json
npx weaver models settings set --file /absolute/model-settings.json --json
npx weaver schema model-settings --json
npx weaver models install qwen3-asr --expected-revision CONFIG_REV --wait --json
# 高级：只下载文件，不准备依赖或启用
npx weaver models download qwen3-asr --wait --json
npx weaver models verify qwen3-asr --json
npx weaver models use qwen3-asr --path /absolute/qwen3-asr --expected-revision CONFIG_REV --json
npx weaver models use-provider modelbest --expected-revision CONFIG_REV --json
```

### 目录清单与下载暂存（`models download`）

- **声明式清单**：本地模型目录由 TypeScript 声明式 catalog 提供，每条发布固定 Hugging Face `repository`、`revision`、相对文件路径、精确字节大小和 SHA-256，不接受任意下载 URL。下载输入仅接受 catalog 模型 ID 与目标根目录，文件路径校验拒绝绝对路径、`..` 与控制字符。
- **暂存、校验与不覆盖发布**：
  - 下载作业复用 Jobs 的取消、恢复、重试与事件机制，模型下载单独使用 **6 小时**节点时限。
  - 下载仅把缺失或校验失败的文件写入本次 attempt 的独立暂存区（`<root>/.lightweaver-staging/<token>`）。每个文件均先校验固定大小与 SHA-256，再以不覆盖方式（hardlink）发布到用户根目录下的 `<model-id>/<revision>/` 目录；目标已有不同内容的文件时保留原件并报错（`MODEL_TARGET_CONFLICT`）。
  - 取消或失败不会标为成功，已校验发布的完整文件在重试时可直接复用；中止时主动取消未读完的响应流。下载文件既不复制到 CAS，也不隐式写入模型配置文件。

### 路径校验、采用与预设

- **列表元数据 vs 完整校验**：状态列表扫描仅检查文件路径与大小等元数据；打开模型详情、显式执行 `models verify`、下载以及采用已有路径时，会对清单全部文件执行完整 SHA-256 哈希校验。
- **采用已有模型路径（`models use`）**：
  - 单文件模型（如 Qwen3-ASR GGUF）可把任意文件名的既有文件直接传给 `models use`。
  - 多文件模型（如 Qwen3 ForcedAligner、EmbeddingGemma 2）可选择完整目录，或选择清单内的任意一个文件以定位所属完整目录；必须所有文件校验通过后才写入配置，失败时保留原配置。
- **Studio 模型路径与下载目录**：Studio 详情页只读显示当前生效模型路径与下载位置，通过系统选择器选择文件或目录后自动校验并保存；使用选择器更换下载位置后会立即保存，不搬迁已有文件。TEN VAD 与其他原生运行库不由模型管理，而是由[引擎运行时](#引擎运行时)管理。
- **供应商预设**：仅保存 ModelBest API Key 不会改变模型预设；执行 `models use-provider modelbest` 或在 Studio 点击 **采用 ModelBest 预设**，会一次原子写入 `vlm_provider`（`modelbest-vlm`）、`vlm_model`（`MiniCPM-V-4.7-35B-A3B`）与 `tts_model`（`VoxCPM2`）。配置读取接口返回三者的有效值及配置来源。

### 配置文件、优先级与并发安全

- **相对路径基准**：模型下载根目录、模型采用路径及配置中的相对路径按运行时 `configBase` 解析——CLI、浏览器 Studio 与桌面默认以工作区为基准，显式指定 `--config-file` 时默认按配置文件所在目录解析（除非另行传入 `--config-base`）。普通 CLI 文件参数的相对路径按当前工作目录解析；`export` 的 `--dest` 要求绝对路径。模型默认下载到工作区 `data/models/`（Git 忽略），可通过私有配置的 `model_download_root` 或 `LIGHTWEAVER_MODEL_DOWNLOAD_ROOT` 覆盖。
- **配置解析优先级**：按 **私有本地配置（`runtime.configFile`，源码环境默认忽略的 `config.local.yaml`） > 环境变量 > 内置默认配置（工作区根目录 `config.yaml`）** 的顺序解析。三者中的空字符串和纯空白值均视为未设置。接口返回的 `source` 值含义：`file`（私有本地配置）、`environment`（环境变量）、`default`（`config.yaml` 或代码缺省值）、`unset`（无有效值）。
- **密钥管理边界**：工作区 `config.yaml` 的 API Key 字段必须保持空字符串，不得提交真实凭据。桌面/Studio 设置保存密钥后立即生效无需重启；显式清除私有本地配置中的密钥后，如果环境变量存在非空值则立即回退到环境变量，否则回到未配置状态。配置读取视图仅暴露是否已配置和来源，绝不回显明文密钥；表单提交空输入保持现值，清除必须显式发起清除请求。
- **乐观锁、文件锁与请求收据**：
  - 任何配置写入、预设采用与已有模型采用均需先读取 `models settings get` 的 `revision`，提交时沿用该 `expectedRevision` 与稳定 `requestId`；网络响应丢失后重放原请求，不重新计算 `expectedRevision`。
  - `config.local.yaml` 更新只接受平面白名单字段，保留无关行、已有密钥和用户注释，拒绝控制字符。保存流程先冻结 `expectedRevision`，再在 `config.local.yaml.lock` 短临界区内重读最新文件（遗留死锁按空锁/错格式宽限期、owner PID 存活探测与文件 `dev/ino` 身份回收），最后以 `0600` 权限原子替换。
  - 请求收据存放在配置目录下的 `.lightweaver/<配置文件名>.sqlite3`（不混入 YAML），同一配置文件在不同数据目录间共用同一套收据。保存时先持久化请求指纹、配置前后摘要及不含明文密钥的首次结果，再原子替换 YAML 文件并确认完成；若写入后进程意外中断，重启时按配置摘要恢复完成状态（旧版内嵌 YAML 注释收据会自动转存并清除，且保持配置逻辑 `revision` 不变）。相同请求重放首次结果，不同参数复用 `requestId` 返回 `REQUEST_ID_REUSED`。

### 能力与配置映射

| 能力 | 当前适配 | 配置键（`config.local.yaml`）与环境变量 |
| --- | --- | --- |
| TTS、音色设计 | ModelBest VoxCPM2 SSE 音频事件 | `modelbest_api_key` / `MODELBEST_API_KEY`、`tts_model` / `LIGHTWEAVER_TTS_MODEL` |
| VLM | ModelBest MiniCPM-V 或 DeepSeek flash | `modelbest_api_key` / `MODELBEST_API_KEY`、`deepseek_api_key` / `DEEPSEEK_API_KEY`、`vlm_provider` / `LIGHTWEAVER_VLM_PROVIDER`、`vlm_model` / `LIGHTWEAVER_VLM_MODEL`、`deepseek_model` / `LIGHTWEAVER_DEEPSEEK_MODEL`、`analyze --provider` |
| VAD 与 ASR | TEN VAD native ABI、Qwen3 GGUF transcribe ABI | `asr_model` / `LIGHTWEAVER_ASR_MODEL` |
| 精确对齐 | Qwen3 ForcedAligner，固定使用 Torch | `alignment_model` / `LIGHTWEAVER_ALIGNMENT_MODEL` |
| 文本和视觉向量 | EmbeddingGemma 2 GGUF 与 `mmproj`，mean pooling | `visual_model` / `LIGHTWEAVER_VISUAL_MODEL`、`visual_mmproj` / `LIGHTWEAVER_VISUAL_MMPROJ` |
| 重排 | Qwen3 Reranker GGUF，rank pooling | `reranker_model` / `LIGHTWEAVER_RERANKER_MODEL`、`search --rerank` |
| 本地语音 | VoxCPM2 Torch | `local_tts_model` / `LIGHTWEAVER_LOCAL_TTS_MODEL` |
| 字幕翻译 | Hy-MT2 GGUF | `translation_model` / `LIGHTWEAVER_TRANSLATION_MODEL` |
| 说话人分段 | MOSS Transcribe Diarize GGUF（加 ASR 原生运行时） | `diarization_model` / `LIGHTWEAVER_DIARIZATION_MODEL` |

### 运行隔离与诊断语义

- **受管组件与开发覆盖**：运行组件路径由引擎安装清单统一解析，不写入模型配置文件（`config.local.yaml` 与设置写入接口均拒绝运行组件字段）。默认使用工作区 `data/engines/` 中安装的组件，所有 Python 能力共用同一个 `python-runtime` 虚拟环境；ASR 使用 TEN VAD、transcribe 运行库与 Python bindings；检索、重排与翻译共用同一个 `llama_server` 绑定。特殊构建或开发调试可通过环境变量覆盖（不进入模型配置）：`LIGHTWEAVER_ENGINE_ROOT`、各组件变量（如 `LIGHTWEAVER_LLAMA_SERVER`、`LIGHTWEAVER_PYTHON`、`LIGHTWEAVER_ASR_BINDINGS`、`LIGHTWEAVER_VAD_LIBRARY`），以及设备与后端选择 `LIGHTWEAVER_ALIGNMENT_DEVICE`（`cpu`、`cuda[:index]`）和 `LIGHTWEAVER_DIARIZATION_BACKEND`。
- **本地 GGUF 进程隔离**：每次 GGUF 推理绑定临时 loopback 端口（`127.0.0.1`）与随机凭据，屏蔽代理环境变量，完成或失败后立即回收子服务；共享 Python 与子服务同属作业进程组，作业取消时一并终止。
- **就绪语义与缓存策略**：`weaver doctor` 仅检查工具、依赖、配置与目标剪映版本，不加载权重也不发送推理请求，因此 `ready` 只代表配置与依赖条件满足。本地模型文件摘要进入缓存绑定；远端模型输出具有不确定性，缓存默认复用已验证的实际输出字节，`--regenerate` 使用新 `generation` 重新生成。远端接口不支持幂等，取消只中止本地等待，远端执行结果可能未知。

模型预设与安装验收证据见[模型预设与本地安装验收](acceptance-model-setup.md)；各类模型功能确认见[架构升级验收](acceptance-v2.md)、[强制对齐和检索验收](acceptance-alignment-search.md)、[能力落地验收](acceptance-coverage.md)、[连续影视素材验收](acceptance-long-form.md)与[全片精确对齐根因与验收](acceptance-alignment-root-cause.md)。

## 引擎运行时

```bash
npx weaver engines setup --expected-revision CONFIG_REV --wait --json
npx weaver engines setup --with-models --expected-revision CONFIG_REV --wait --json
npx weaver engines list --json
# 高级或自动化：单独处理某个组件
npx weaver engines install transcribe-native --wait --json
npx weaver engines verify transcribe-native --json
```

### 模型一站式准备与启用（`models install`）

- **安装计划与来源判定**：调用 `weaver models install ID --expected-revision CONFIG_REV --wait`（或 `POST /api/models/:id/install`）前，可通过 `GET /api/models/:id/install-plan` 获取平台兼容性、模型剩余下载字节、依赖预计体积与文件来源 `source.kind`：
  - `configured`：当前已配置的完整模型（附冻结路径与文件快照）。
  - `downloaded`：下载目录内已有完整校验文件。
  - `download`：需要下载模型文件。
- **执行流程**：已有完整模型文件时不创建下载节点；单个 `model-setup` 作业只安装缺失运行组件并完整校验已有文件，最后一个 `model-activate` 节点原子写入配置。仅需下载模型文件可使用 CLI `models download`。
- **Studio 交互与故障边界**：
  - Studio 设置分为 **模型与供应商 / 存储 / 诊断与修复** 三栏；模型详情页按状态给出对应按钮：未下载时显示 **下载并启用**，已有完整文件时显示 **启用**，已配置但缺组件时提示准备运行组件，已启用且就绪的模型不再显示准备按钮。
  - 提交准备作业时会携带当前所见的 `source`，服务端在入队前重新核对；若文件或路径在此期间发生变化，返回 `MODEL_FILES_CHANGED`，页面刷新后由用户重新确认，绝不把"启用"静默改为重新"下载"。
  - 采用当前已配置模型时保留全部已有模型绑定（路径或快照变化则拒绝启用）；依赖失败、取消或配置冲突时均不修改模型配置，且失败沿完整依赖链传播，成功完成的独立步骤在重试时可复用。

### 本地引擎一键配置与修复（`engines setup`）

Studio 的 **诊断与修复 → 运行组件检查与修复** 与 `weaver engines` 负责管理本地运行组件（`transcribe-native`、`transcribe-bindings`、`ten-vad`、`llama-server` 以及 `python-runtime`）。引擎是固定版本和平台的官方预编译产物或独立受管环境，与模型权重分开维护。WorkBuddy 也可通过 CLI 为接收方预先准备这些组件（源码压缩包本身只交付代码与内置资源）。

- **正常流程**：
  - `engines setup` 与高级修复面板按顺序安装：**`transcribe-native`**（必需）、**`transcribe-bindings`**（必需）、**`ten-vad`**（必需）、**`python-runtime`**（必需）以及 **`llama-server`**（可选），并在最后一个 `adopt` 节点确认全部就绪。
  - 用户无需理解"下载、校验、采用"的分步细节；已安装且校验通过的组件自动复用，安装完成后立即解析生效，不再需要额外"采用引擎"操作。
  - 传入 `--with-models`（API `includeModels`）可在同一次作业中准备 `qwen3-asr`、`embeddinggemma-2` 与 `qwen3-forced-aligner` 权重，并仅在此时于完成节点按 `expectedRevision` 写入模型路径。Studio 日常修复面板仅处理运行组件，模型权重由模型页选择。
  - 全部组件就绪且无更新时，面板按钮切换为 **刷新状态**（只读查询）；可用组件不再显示安装按钮，单组件文件校验与更新入口收在"组件详情"中。
- **必需 vs 可选失败策略**：
  - 必需组件失败时作业直接失败，且不写入任何配置。
  - 可选组件（如 `llama-server`）失败时仅将其记录在完成节点的 `skipped` 列表中并继续安装其余组件，界面提示 **部分运行组件仍不可用，可重试**（可通过 **继续修复** 重试）。

### 空间预检、状态分类与原子发布

- **磁盘空间预检**：安装或修复启动前按未安装组件的 `estimatedBytes` 加上待下载模型字节，并预留 **256 MiB** 安全余量估算所需空间；目标分区可用空间不足时直接返回 `DISK_SPACE_INSUFFICIENT`，不启动下载。
- **目录、更新与统一状态分类**：
  - 安装根目录由运行时选择，默认使用工作区 `data/engines/`（Git 忽略），开发时可用 `LIGHTWEAVER_ENGINE_ROOT` 覆盖。组件固定位于 `<根>/<引擎 ID>`，更改目录配置不会自动搬迁已有文件。
  - 已安装版本与 catalog 发布版本不一致时，`engines list` 与 `GET /api/engines` 会返回解析后的平台 catalog、更新列表 `updates`、可选模型下载计划 `models` 以及引擎根目录可用空间 `diskFreeBytes`；执行 `engines setup` 会下载新版并原子替换本应用管理的目录。
  - `engines list`、`doctor` 与 `capabilities` 共用服务端统一的 `usage` 分类：`managed`（本应用安装且自动生效）、`external`（显式环境变量覆盖且可用）、`unused`（未安装且未配置）、`partial`（路径属于受管目录但缺文件或元数据异常，不冒充外部组件）。其中 `engines.ready` 表示全部本地组件可用，`engines.coreReady` 要求 `transcribe-native`、`transcribe-bindings`、`ten-vad` 与 `python-runtime` 就绪。
- **来源锁定与安全发布**：
  - `transcribe-native` 与 `ten-vad` 锁定当前平台的官方发布摘要，`transcribe-bindings` 锁定 PyPI wheel 摘要，`llama-server` 锁定 `llama.cpp` 发布构建；不接受任意下载 URL，也不在用户机器上编译 C++。catalog 声明发布地址、归档大小与 SHA-256、归档内顶层目录以及解压后每个必需文件的路径、大小和 SHA-256。
  - 下载仅写入本次作业暂存区（`<root>/.lightweaver-staging/<token>`）：归档先按 SHA-256 校验，解压时拒绝绝对路径、`..` 与越界软链，解压后再逐一校验每个必需文件，最后通过目录重命名原子发布并写入 `.lightweaver-engine.json` 标记。若目标目录已存在但无该标记，拒绝覆盖（`ENGINE_TARGET_CONFLICT`），保留用户原有文件。

### 共享 Python 运行环境（`python-runtime`）

- 所有 Python 依赖统一声明在 `weaver/requirements.txt` 中（模型推理、VoxCPM2 合成、字幕翻译与项目交接共用同一个 `python-runtime`；强制对齐要求的 `transformers==4.57.6` 同时满足 VoxCPM2 的依赖声明）。
- 安装时查找并要求 **Python 3.12** 创建受管 venv（`LIGHTWEAVER_PYTHON` 是唯一的 Python 开发覆盖变量），作业采用 **6 小时**时限。取消操作会终止 `pip` 进程，首次新建失败时清除未完成环境，安装完成后校验各固定依赖版本。

引擎运行时安装的历史证据与平台范围见[引擎运行时安装验收](acceptance-engine-setup.md)。

## 库与交接

```bash
npx weaver library list --json
npx weaver library set --file /absolute/payload.json --media /absolute/reference.wav --json
npx weaver library show ITEM --version DIGEST --json
npx weaver library delete --id ITEM --expected-version DIGEST --json
npx weaver asset adopt --project demo --item ITEM --version DIGEST --expected-revision REV --json
npx weaver library import-builtin --package-version DIGEST --json
```

- 内置库包 `package-version` 摘要由 `weaver capabilities` 返回；方法条件来自 `MethodVersion`。
- 项目升级引用的库版本使用 `project apply` 的 `rebind` 操作。音色参考音频转写、音色设计与试听入库也可直接在 Studio 中完成。

```bash
npx weaver export --project demo --format otio --dest /absolute/empty-otio-dir --json
npx weaver export --project demo --format jianying --dest /absolute/empty-jianying-dir --json
npx weaver export verify --dir /absolute/package --json
npx weaver export install --dir /absolute/jianying-package --json
npx weaver export --project demo --format bundle --dest /absolute/package.zip --json
npx weaver import --file /absolute/package.zip --id imported-project --json
```

- **OTIO 与剪映导出**：
  - OTIO 使用官方 `opentimelineio` 库（0.18.1）生成与重载校验，随附 SRT、ASS 字幕与完整 metadata（各剪辑软件对字幕和特效的兼容性存在差异）。
  - 剪映导出锁定 macOS `11.7.0`、schema `360000`、`adapter v1`（`pyJianYingDraft` 0.3.1）。重叠字幕会自动分配到独立文本轨并保留原始文字与时间，方便作者在编辑器中核对；`export install` 会创建新草稿并先备份草稿索引。
- **媒体烘焙与项目包（`bundle`）**：
  - 交接包的画面适配、变速与定格支持烘焙。节目母带保留最终混音；独立备选音轨默认静音，并按同一计划烘焙裁剪、循环、变速、增益与淡变。原始媒体、映射关系与校验报告随包保存。
  - `bundle` 保存精确项目修订、素材/库版本及匹配的已验证物化依赖，排除活动数据库与 API 密钥，可直接导入其他工作区复现。

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
```

### 作业取消、进程树监督与恢复

- **状态隔离与时限**：单节点失败或作业取消会保留已完成的独立目标以及项目的上一份有效交付。普通作业节点受 **30 分钟**总时限约束，模型下载与引擎安装相关节点时限为 **6 小时**，超时返回 `DEADLINE_EXCEEDED`。用户取消记为 `cancelled`，worker 停止或租约过期断连记为 `interrupted`。
- **进程树监督**：工具探针直接接收节点取消信号；媒体监督进程通过父进程管道与 IPC 断连感知 worker 退出：
  - POSIX：直接终止目标进程组（`-targetGroup`）。
  - Windows：通过 PowerShell 宿主创建 Job Object 托管进程树（目标进程先挂起、加入 Job 后再恢复运行，确保宿主退出或停止时回收全部子孙进程）。
  - 终止信号发出后经过 **3 秒**宽限仍未退出的监督宿主将被强制结束（`SIGKILL`）。界面上的"取消"仅表示请求已提交，实际进程回收以监督结果为准。
- **租约、Fencing 与收据复用**：节点运行受租约（15 秒 `lease_until`，每秒心跳续期）、`attempt token` 与目标代次约束，确保失去所有权的晚返回无法写入结果或发布交付。完成收据同时写入 SQLite（`node_receipts`）并引用 CAS，整库备份恢复后仍可继续复用；节点工作目录中保存的本地 `receipt.json` 也支持崩溃后的恢复复用。

### 备份、恢复与垃圾回收

- **备份（`backup`）**：通过 SQLite 在线 backup API 创建数据库一致性快照，并复制快照引用的所有不可变 blob。
- **恢复（`restore`）**：校验备份数据库可读性与 `integrity_check`，核对数据库实际引用与 `backup.json` 清单集合及元数据是否一致，并逐个校验每个 blob 文件的大小与 SHA-256；全部通过后才原子发布到空目录，失败则自动清理暂存目录，绝不覆盖活动数据库。
- **垃圾回收（`gc`）**：默认执行 dry-run 检查，加 `--apply` 才会删除未引用对象。受保护范围覆盖所有项目修订、库版本、作业 `run`、完成收据、`pin` 与保留交付。

## 桌面客户端

```bash
make desktop          # Electron + Vite HMR + 动态端口服务
make source-zip       # 打包已提交源码
```

### 进程架构与安全边界

- `npm start` 与 `make desktop` 启动同一套源码桌面客户端：前端由 Vite 提供（桌面模式下动态分配端口；独立浏览器 Studio 默认端口为 `5175`，API 服务默认端口为 `5176`），API 与后台 worker 运行在独立的 Node 服务进程中。
- **回环与会话校验**：API 服务仅接受回环地址（`127.0.0.1`、`localhost`、`::1`）和已登记的来源（Origin），请求还需匹配当前会话令牌（`Bearer` token）。
- **配置与数据隔离**：CLI、浏览器 Studio 与桌面客户端共用仓库根目录的私有配置文件（`config.local.yaml`）；桌面自身的窗口偏好、主题设置与服务日志保留在系统用户目录，可通过 `LIGHTWEAVER_USER_DATA` 环境变量隔离桌面用户目录。协作桌面项目时，应使用界面中的 **复制给 agent** 获取绑定实际数据目录的完整命令。

### 草稿保存、多级恢复与冲突处理

- **保存与制作联动**：
  - Studio 的 **保存** 一次写入项目文档与待审创作方案；**保存并制作** 先完成该写入，再以服务端返回的精确 `expectedRevision` 提交制作（保存创作方案不会自动采用其场景）。
  - 等待保存响应期间若产生了新的文档或方案编辑，界面会保留新草稿并暂停后续制作；如果保存或提交制作的响应丢失，相同内容重试会自动复用原 `requestId`。
  - 离开项目弹窗中选择保存时使用同一写入通道；创建项目与导入项目包的失败重试同样保留请求身份，直到服务端确认成功后才结束操作。
- **客户端状态与桌面恢复 journal**：
  - 客户端状态（`client-state.json`）优先加载并与服务端同步，待保存操作按序重放（冲突时按最新状态重放，备份清除需等待服务端确认）。
  - 桌面端在每次编辑时会同步把草稿写入当前数据目录下的独立恢复 journal（`<dataDir>/.desktop-recovery/journal.json`），重启或退出前会等待写盘完成；未提交草稿会自动（或在离开弹窗选择 **保留草稿** 时）备份到当前数据目录的客户端状态（`client-state.json`），并在重新打开项目后显式恢复（备份可手动清除；选择 **放弃修改** 会删除本地草稿与草稿备份）。
  - 所有草稿恢复均严格保留原始修订基线（`base`），转换或加载期间的新编辑不会绕过并发校验，过期基线仍会进入正常的修订冲突处理。
- **冲突界面与加载保护**：
  - 发生修订冲突时，冲突界面完整保留本地草稿并提供 **查看差异** 对比。
  - 点击 **保留我的草稿并加载服务器内容**（确认弹窗点击 **备份草稿并加载**）时，系统会先备份本地草稿、清除对应恢复 journal，再重新读取服务器最新 `head`。如果等待备份或读取期间产生了新编辑，或者服务器又推进了新修订，系统会保留当前草稿并提示用户重新确认后再加载；并发保存推进修订后，旧加载操作也会自动失效。
  - 所有备份、读取与恢复回调均绑定项目 ID、会话代次与草稿序号，确保切换项目后旧回调不会清除新编辑，也不会向新项目展示旧项目的恢复 journal 错误。

### 窗口关闭与退出协调

- 桌面客户端在关闭窗口或通过菜单退出时，先向服务查询 `/api/runs/has-active` 检查是否存在排队、运行或正在取消中的任务（直接查库，不受作业列表最近 100 条历史记录限制）。
- **无活动任务**：先完成未保存草稿的提示与落盘，再安全停止后台 Vite 与 Node 服务并退出。
- **存在活动任务或服务状态暂不可读**：弹出确认提供 **后台运行**、**停止后台并退出**、**取消** 三项。选择 **后台运行** 时，主进程会先等待草稿写入恢复 journal、创建系统托盘恢复入口，再隐藏窗口（全屏窗口会先退出全屏）。
- 菜单退出沿用同一活动任务检查，隐藏在后台的窗口会先恢复显示再弹出确认；主进程通过串行队列协调所有关窗与退出流程。浏览器版 Studio 继续使用标准页面离站提示。

桌面客户端验收证据与平台限制见[桌面客户端验收](acceptance-desktop.md)。

### 源码打包与接收方准备

- 分享项目代码时使用 `make source-zip` 打包已提交源码（输出至 `out/LightWeaver-source.zip`）。压缩包包含配套 `.agents/skills/` 与 `package-lock.json`，排除私有配置、运行数据、模型权重、运行环境与构建产物。
- 接收方按开发指南安装依赖后，使用 `engines setup` 准备共享 Python 与原生运行组件，并按需下载安装模型即可使用，无需构建独立桌面安装包。项目首页支持直接导入成片项目的 `bundle` ZIP 或目录；界面会将模型文件完整性检查结果与真实推理作业结果分开展示。
