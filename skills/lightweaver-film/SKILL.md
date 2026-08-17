---
name: lightweaver-film
description: >
  Produce a LightWeaver study-explainer film: pick a mode, match a
  first-party film.json structure, write bilingual narration, fill
  FilmDoc via weaver CLI. Use when the user wants a LightUI study
  film, or says 讲解片 / 出片.
---

# 制作一部 study-explainer

先读 `AGENTS.md` 与 `docs/design-study-explainer.md` 的 D1–D13（核）。
先读存放图：理念 / 资产 / 产物。方法论细节按需读 `references/`。

## 存放图（约定路径）

- first-party 理念：`$LIGHTUI_ROOT/studies/<slug>/idea.md`（及 `idea.en.md` / `study.json`；taxonomy 另有 `kinds.ts`；intent-cascade **没有** kinds.ts）
- 用户片理念：`data/projects/<id>/brief.md`
- 任务实例：LightUI 顾客片 `data/first-party/<id>/`；用户片 `data/projects/<id>/`。**不提交**
- 资产：`library/`；`<project>/assets.json` + `assets/stills/<locale>/`（文件名以 `assets.json` 为准）
- 产物：只在任务实例里。用户片 `data/projects/<id>/assets/outputs/`；顾客片 `data/first-party/<slug>/assets/outputs/`。旁白 `assets/lines/<locale>/*.wav`。**不要**写 `products/study-films/out` 或 `products/study-films/projects`
- 工作台说明若写「产物位置：未指定」，**开始前先问人**（用户片还是顾客片，要不要再拷到 LightUI）。问清再 `create` / `render`
- 方法：`recipes/lightui-study-explainer/`（可复用骨架，不是某一张片子。`weaver recipe list --task study-explainer` / `show` / `apply`）
- 发现：`weaver project show --json` → `paths.stillFiles` / `lineFiles` / `outputFiles` / `brief` 与同级 `renderable`。先读 `film.langs`、`film.voices`、`film.kit`、`film.recipe`：人点名要出的语言、音色、素材、方法卡，不要自己换。

## 结合规则

| 判据 | 动作 |
| --- | --- |
| `hasErrors(validate)` | **停全部生成**：不准 tts / render / capture。先修 FilmDoc |
| `!hasErrors` 且 `!isRenderable`（引用在、png 缺） | 允许 `tts`。**禁止** `render --project` |
| `capture.kind === "lightui-lab"` 且 slug 有 adapter 且某 `stillFiles` `exists === false` | `weaver capture --project` |
| `capture.kind === "manual"` 且 png 缺 | **停**。手截到 `assets.json` 已登记路径。**禁止** `weaver capture` |
| 某 `lineFiles` `exists === false` | `tts --project`（可 `--scene`） |
| wav 在且本会话未对该 scene `scene set --text` | **复用 wav** |
| wav 在但本会话刚 `scene set --text` | `tts --project --scene <id>` |
| `isRenderable` 且 `outputFiles[locale].exists` 且本会话未改旁白 / 未换 still | **不** render。要发布且目标缺 → 只 `publish` |
| `isRenderable` 且 output 缺，或本会话刚 tts / 换了 png | `render --project` |
| 无 `publish.dir` | 只写 `assets/outputs/`；不要 `publish` |
| `brief.kind=project-brief` 且 `brief.files.brief.exists === false` | 先写 `brief.md`，再写 lines |
| `data/` 里已有该 slug 且本会话未改旁白 | **不要**重写 lines。只补缺的静帧 / wav / mp4 |

## 先判模式

细节在 `references/modes.md`。`template` / `from-study` / `co-create`。未选就停。点名「按 dropdown / intent 那套」视为已选 `template`。

## 十条原则

1. 按图存放。理念跟主题走；资产 `library:` / `asset:`；产物进该片子在 `data/` 下的 `assets/lines` 与 `assets/outputs`。不发明顶层目录，不把产物写进理念目录或 `products/study-films/`，不把 `idea.md` 拷进片子。工作台没点产物位置就先问。
2. 脚本即片子。`film.json` 是编排合同。不手写 Remotion TSX。
3. 一种 LightUI kind 一场 still。禁止合并。
4. 真 lab 静帧。不要手绘假 UI。
5. 双语成对写完再 TTS。
6. 先形状后媒体；能复用就不重生。`validate` error 未清不得交付；`!isRenderable` 不得 `render`。人在 Studio `/voices` `/library` 监管库，在 `/f/<id>` 点名 `voices` / `kit`。agent 只按点名用。`tts` 走 Hi-Fi clone（克隆源 + 逐字稿），不用 `--seed` 改库。
7. 先名称 / 场景 / 规则，再谈外观。口播用听者的话：一场只留一个要记住的名字，解释用动作和后果。`idea.md` 可以写「叶子」「安全三角」「sticky」「观察器」，片子里改成「不能再往下点的那一级」「斜着走过去先别换菜单」「跟着页面走、停在靠近顶部」「先别跟着滚动来回改高亮」。`validate` 对忌语出 warning。title/close 用 `points` 做要点板，不要空海报。
8. 不发明 scene kind。只能 `title | still | close`。
9. 模式未定就停。缺静帧且无 adapter 就停。不要空转 `capture`。
10. 确定性 job。weaver 内无模型。

## 何时读哪个文件

| 时机 | 读 |
| --- | --- |
| 找齐三层 | 先按存放图；再 `weaver project show --json` |
| 选卡 | `npx weaver recipe list --task study-explainer`；一眼看 `recipes/lightui-study-explainer/index.md`。对上后再 `npx weaver recipe show <id>` |
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
npx weaver project create <id> --task study-explainer [--title] [--source first-party] [--study-slug] [--output] [--output-en]
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
