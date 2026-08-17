---
name: lightweaver-film
description: >
  Produce a LightWeaver study-explainer film: pick a mode, write
  narration, fill FilmDoc via weaver CLI. Use when the user wants a
  讲解片 / 出片.
---

# 制作一部 study-explainer

先读 `AGENTS.md` 与 `docs/conventions.md`（现网存放图）。方法论细节按需读 `references/`。本仓做后处理出片。上游文案和静帧由任务自带，不要去翻、也不要描述别的仓库。

## 存放图（约定路径）

- 用户片理念：`data/projects/<id>/brief.md`
- 任务实例：`data/first-party/<id>/` 或 `data/projects/<id>/`。**不提交**
- 资产：`library/`；`<project>/assets.json` + `assets/stills/<locale>/`（文件名以 `assets.json` 为准）。元素是参考权能，不强制
- 产物：只在任务实例里。`data/projects/<id>/assets/outputs/` 或 `data/first-party/<id>/assets/outputs/`。旁白 `assets/lines/<locale>/*.wav`。**不要**写 `products/study-films/`
- 工作台说明若写「产物位置：未指定」，**开始前先问人**写到哪棵 data 树。人没另给拷贝位置，不要拷到仓库外
- 方法 / 音色 / 素材都在 `library/`，都是可选增强。方法是 `library:method.*`（文件在 `library/methods/`）。只 `list` / `show` / `apply`，不要新建或改卡
- 发现：`weaver project show --json` → `paths.stillFiles` / `lineFiles` / `outputFiles` / `brief` 与同级 `renderable`。先读 `film.langs`、`film.voices`、`film.kit`、`film.recipe`

## 结合规则

| 判据 | 动作 |
| --- | --- |
| `hasErrors(validate)` | **停全部生成**：不准 tts / render / capture。先修 FilmDoc |
| `!hasErrors` 且 `!isRenderable`（引用在、png 缺） | 允许 `tts`。**禁止** `render --project` |
| `capture.kind` 有适配器且某 `stillFiles` `exists === false` | `weaver capture --project` |
| `capture.kind === "manual"` 且 png 缺 | **停**。手截到 `assets.json` 已登记路径。**禁止** `weaver capture` |
| 某 `lineFiles` `exists === false` | `tts --project`（可 `--scene`） |
| wav 在且本会话未对该 scene `scene set --text` | **复用 wav** |
| wav 在但本会话刚 `scene set --text` | `tts --project --scene <id>` |
| `isRenderable` 且 `outputFiles[locale].exists` 且本会话未改旁白 / 未换 still | **不** render。人另给了拷贝位置且目标缺 → 只 `publish` |
| `isRenderable` 且 output 缺，或本会话刚 tts / 换了 png | `render --project` |
| 无 `publish.dir` | 只写 `assets/outputs/`；不要 `publish` |
| `brief.kind=project-brief` 且 `brief.files.brief.exists === false` | 先写 `brief.md`，再写 lines |
| `data/` 里已有该 id 且本会话未改旁白 | **不要**重写 lines。只补缺的静帧 / wav / mp4 |

## 先判模式

细节在 `references/modes.md`。`template` / `from-study` / `co-create`。未选就停。

## 十条原则

1. 按图存放。理念跟任务走；资产用 `library:` / `asset:`；产物进该片子在 `data/` 下的 `assets/lines` 与 `assets/outputs`。不发明顶层目录，不把产物写进理念目录或 `products/study-films/`，不把上游 idea 拷进片子。工作台没点产物位置就先问。
2. 脚本即片子。`film.json` 是编排合同。不手写 Remotion TSX。
3. 方法卡若按模型分场，一种模型一场。禁止合并。
4. 真静帧。不要手绘假 UI。
5. 只写 `film.langs` 点名的语言再 TTS。没点英文就不要硬写英文。
6. 先形状后媒体；能复用就不重生。`validate`  error 未清不得交付；`!isRenderable` 不得 `render`。人在 Studio `/voices` `/library` 监管库，在工作台复制说明，在 `/f/<id>` 复盘。`film.kit` 只是参考权能。`tts` 走 Hi-Fi clone，不用 `--seed` 改库。
7. 先名称 / 场景 / 规则，再谈外观。口播用听者的话。`validate` 对忌语出 warning。title/close 用 `points`。
8. 不发明 scene kind。只能 `title | still | close`。
9. 模式未定就停。缺静帧且无适配器就停。不要空转 `capture`。
10. 确定性 job。weaver 内无模型。

## 何时读哪个文件

| 时机 | 读 |
| --- | --- |
| 找齐三层 | 先按存放图；再 `weaver project show --json` |
| 选卡 | `npx weaver recipe list --task study-explainer`；一眼看 `library/methods/lightui-study-explainer/index.md`。对上后再 `npx weaver recipe show <id>` |
| 展开骨架 | `recipe apply`；补场才 `scene add`。`lines[locale] === <sceneId>` 是占位，阶段 3 必须 `scene set` |
| 手截 | `docs/conventions.md` |
| QA | `references/qa.md` |
| 阶段表 | `references/pipeline.md` |
| 资产入库 | 切到 lightweaver-assets |

## 动词

```bash
npx weaver project list --json
npx weaver project show <id> --json
npx weaver recipe list [--task study-explainer]
npx weaver recipe show <id>
npx weaver recipe apply --project <id> --recipe taxonomy-parade --kinds a,b,c --json
npx weaver recipe apply --project <id> --recipe problem-then-rule --json
npx weaver recipe use --project <id> --recipe taxonomy-parade
npx weaver project create <id> --task study-explainer [--title] [--source first-party] [--output] [--output-en]
npx weaver scene add --project <id> --id <scene> --kind still [--still asset:still.x] [--role contrast]
npx weaver scene rm --project <id> --id <scene>
npx weaver scene move --project <id> --id <scene> --after <id>
npx weaver scene set --project <id> --id <scene> --locale zh --text "..."
npx weaver card set --project <id> --locale zh --which title --headline "..." --lede "..." --points "要点一;要点二"
npx weaver voice set --project <id> --ref library:voice.prompt
npx weaver voice asr --id voice.prompt
npx weaver voice asr --label 讲解女声
npx weaver langs set --project <id> --langs zh
npx weaver kit set --project <id> --refs library:element.mark
npx weaver validate <id>
npx weaver tts --project <id>
npx weaver render --project <id>
npx weaver publish --project <id>
```

写操作 `--json` 信封是 `{ ok, project, film, issues, paths }`。不要手改 `film.json` 当日常路径。
