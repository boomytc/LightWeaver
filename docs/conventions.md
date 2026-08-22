# How to add a film

一部片子是一个 **任务实例**。已实现 `study-explainer`（静帧讲解）和 `footage-narration`（原片时间轴解说）。LightWeaver 做后处理出片：编排、配音、渲染。上游文案和画面由任务自带，不在本仓描述别的仓库。

## Project layout

```
film.json                 task、scenes、locale copy、voice、publish
assets.json               项目资产登记
assets/stills/<locale>/   静帧（study-explainer）
assets/source/            源视频（footage-narration）
assets/transcripts/       句级转写
assets/descriptions/      画面描述树（场/镜/观察）
assets/lines/<locale>/    旁白 wav
assets/clips/<locale>/    中间裁段（不提交）
assets/outputs/           渲染 mp4（不提交）
```

任务实例都在 `data/`（整树 gitignore），**不提交**。两棵树：`data/projects/<id>/`，以及现网已有的 `data/first-party/<id>/`。`film.id` 等于目录名。

仓库只留可复用物：`weaver/`、`library/`（含 `library/methods/`）、`products/study-films/`（渲染器，不含片子、不含成片）、`products/studio/`、`skills/`。

## 三层存放

片子目录里的 `film.json` 是编排合同，不是理念源，也不是媒体文件。先按层找对象，再跑 weaver。

| 层 | 住哪 | 不往哪写 |
| --- | --- | --- |
| **理念** | 任务自带：用户片 `data/projects/<id>/brief.md`（可选 `brief.en.md`）。若片子写了 `study.slug`，只当指针，不要把上游文案拷进片子目录 | 不把上游 idea 拷进片子。不把 wav/mp4 写进理念目录 |
| **资产** | `library/`（`library:` 音色 / 元素 / 参考）+ 项目 `assets.json` + `assets/stills/<locale>/`。元素是参考权能，不强制 | `library/` 不是文件柜。不发明第三套 ref |
| **产物** | 旁白 `assets/lines/<locale>/<scene>.wav`；成片 `assets/outputs/<output>`。整份任务实例在 `data/` | 不把 `data/` 提交进本仓。不把成片写进 `products/study-films/`。人没另给拷贝位置，就不要拷到仓库外 |

**用户片 brief：** 理念写在 `data/projects/<id>/brief.md`。Agent 写正文；`createProject` **不**代写。weaver **不**解析 brief。没有 brief 就先写 brief，再写 `lines`。

**静帧文件名：** 盘上路径以该项目 `assets.json` 里 `files.<locale>` 为准，**不要**从 `scenes[].id` 或 `asset:still.<id>` 推导。`stillRelPath` 不自动加 `.png`。必须先写进 `assets.json` 再落盘。

**可选增强（方法 / 音色 / 素材）：** 三套都在 `library/`，同一套可增删改的插件。工作台点了才约束 agent，没点就让它自己定，不要代点。方法资产 `library:method.*`，人只填名称 / 何时用 / 铺场（`expand: fixed|list`，固定场次自带 `scenes`）。apply / list / show 都按 catalog。`library/methods/<pack>/` 只放 catalog 投影短文，不是第二套库。音色、素材同样登记在 `library/assets.json`。素材人只填名称，id 自动分配。出片时不要为这一部片子新建方法。库的增删改在 Studio `/methods` `/voices` `/library`，或 `weaver method` / `weaver asset`。禁止把方法写进 `skills/`。

发现三层路径与文件是否存在：`npx weaver project show <id> --json` 的 `paths`（`brief` / `stillFiles` / `sourceFiles` / `lineFiles` / `outputFiles`）和 `renderable`。不要扫仓库。

## 感知 / 合成原语（任意 agent）

STT / TTS 是 weaver 可调用的基础模块，**不需要片子**。OpenClaw、QwenPaw、Codex、Claude Code、Grok Build 等只调 CLI，不要去 import `tts.py` / `asr.py`，不要为转写或合成新建 `film.json`。

```bash
npx weaver asr --file clip.wav --json
npx weaver asr --file origin.mp4 --language zh --json
npx weaver tts --text "这一下她没再退。" --voice library:voice.prompt --dest /tmp/line.wav --json
```

- `asr`：wav 或带音轨的视频 → `{ text, language, seconds, sentences? }`。不写项目资产。
- `tts --text`：一句旁白 + `library:voice.*` 克隆源 → wav。Hi-Fi：克隆源 wav + 逐字稿。
- 片子作业仍是 `transcribe --project`（写 `assets/transcripts`）和 `tts --project`（写 `assets/lines`）。
- `voice asr --id` 只给库里的克隆源补文本，不是通用 STT。
- 缺 ASR 模型或 ModelBest 密钥时失败，不要换引擎、不要装成空结果。

## study-explainer

- `task: "study-explainer"`
- 场景形状：title 在首、close 在末、至少一场 still
- 旁白写在 `scenes[].lines`
- **口播通俗：** 上游文案可以写实现词；片子 `lines` 与 title/close 卡片必须改成听者的话。一场只留一个要记住的名字。`validate` 对忌语出 warning。「路径」可以留
- **点名：** `film.langs` 是要出的语言。方法、音色、素材都是可选增强：`film.recipe` / `film.voices` / `film.kit` 点了按点的用。Studio 工作台复制说明；`/f/<id>` 只复盘
- **要点板：** title / close 的正文是 `points`（2–4 条）。lede 只留一句。对照条写成 `左 || 右`
- 静帧：`scenes[].still = "asset:still.<id>"`
- 音色套：克隆源二选一。上传后自动转写「文本」。出片固定 Hi-Fi clone。人在 `/voices` 铸、听、留。`tts` 不改库，不加 `--seed`
- 工作台必须写产物位置。没点名就让 agent 开始前先问写到 `data/projects` 还是 `data/first-party`。人没另给拷贝位置，不要拷到仓库外
- `film.publish.dir` 若已有值，`render` 才拷一份出去。工作台不点名仓库外路径

```bash
npx weaver project create my-film --title "演示" --task study-explainer
npx weaver recipe apply --project my-film --recipe taxonomy-parade --items shot
npx weaver langs set --project my-film --langs zh
npx weaver validate my-film
npx weaver tts --project my-film
npx weaver render --project my-film
```

`make films` / `weaver tts|render` 无 `--project` 时跳过 **不可渲** 片子。指定 `--project` 渲染缺 png（讲解片）或缺源视频/旁白（原片解说）会报错。

## footage-narration

- `task: "footage-narration"`
- 场景形状：一场或多场 `clip`。每场 `source`（`asset:video.*`）、`in` / `out`（秒）、`ost`（`narration` | `original` | `mix`）
- 源视频登记在 `assets.json`，文件放 `assets/source/`。路径以 catalog 为准，不从 scene id 推导
- CLI：`project create --source user|first-party`；场次源视频用 `--video asset:video.*`，不要用 `--source`
- `ost: original` 不配旁白、tts 跳过，成片时长 = `out - in`
- `ost: narration|mix` 需要 `lines` 和 wav；合成从 `in` 起切 **旁白时长**（`out` 是画面窗，不决定成片秒数）
- `create` 必须 `--task footage-narration`。不要写 `study` / `publish.dir`
- `render` 走 ffmpeg 合成，不走 Remotion
- 方法卡 `plot-then-match`：先弄清时间轴，再写解说并对齐 in/out。有转写先靠句子；静音场再读描述树。weaver 不跑规划 LLM
- 方法卡 `clone-from-edit`：有已剪参考片和原片。不要 `recipe apply` 铺场。`asset add --kind video` 把项目外文件拷进 `assets/source/`，再 `weaver match --edited asset:video.edited`。match 写出 `ost: original` 的 clip，不自动 render
- 方法卡 `see-then-narrate`：无对白先 `weaver describe`。按 `assets/descriptions/` 一场一 clip。观察不当旁白原文
- 方法卡 `copy-then-match`：人先过解说，再对画面。原片占比是铺场目标
- 方法卡 `highlight-mix`：转写抽点，clip `ost: original`，不要 tts
- 诊断：`assets/match/report.json`（分数与候选）、`assets/subtitles/<locale>.srt`（成片时间轴，不烧进 mp4）、`assets/descriptions/<videoId>.json`（场/镜/观察）。视觉对齐沿上一场源点续搜，不复用已占用的源窗；源段短于 `minPiece` 的碎段丢掉，时长比过低则按参考窗拉回

- `project show` 的 `paths.matchReport` / `paths.subtitleFiles` / `paths.descriptionFiles` / `paths.sourceFiles`（含未上场的 video 资产）

```bash
npx weaver project create my-cut --title "工地" --task footage-narration --source user
npx weaver scene add --project my-cut --id beat --kind clip --video asset:video.origin --in 12.4 --out 18.1 --ost narration
npx weaver scene set --project my-cut --id beat --locale zh --text "这一下她没再退。"
npx weaver tts --project my-cut
npx weaver render --project my-cut
```

按已剪片复刻：

```bash
npx weaver project create site-clone --task footage-narration --source user
npx weaver asset add --project site-clone --kind video --id video.edited --file /abs/edited.mp4
npx weaver asset add --project site-clone --kind video --id video.ep01 --file /abs/ep01.mp4
npx weaver match --project site-clone --edited asset:video.edited
npx weaver validate site-clone
npx weaver render --project site-clone
```

无对白先看见：

```bash
npx weaver project create site-see --task footage-narration --source user
npx weaver asset add --project site-see --kind video --id video.origin --file /abs/silent.mp4
npx weaver describe --project site-see --ref asset:video.origin
# agent 按 sequences 一场一 clip，观察只当素材
npx weaver tts --project site-see
npx weaver validate site-see
npx weaver render --project site-see
```

## 手截

1. 用任务自己的预览面取静帧（视口 1440×1100，设备像素比 2）。要出的语言各一遍。
2. 写入该项目 `assets.json` 已登记的 `files.<locale>`。
3. 静帧/wav 留在该片子 `data/.../assets/`。

`weaver capture` 仅当片子配了适配器时，才把截图写进该片子的 `assets/stills/`。

## After changing scenes

```bash
npx weaver validate <id>
make remotion
```
