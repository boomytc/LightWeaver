# 制作阶段 0–7

讲解片画面语言是 title 卡 + still + close 卡。原片解说是 clip 时间轴。阶段 5 是 TTS，不是写 Remotion TSX。

原片有四条路：`plot-then-match` 手写解说；`copy-then-match` 文案先行再对画面；`clone-from-edit` 用 `weaver match` 铺 `ost: original` 场，跳过阶段 3 和 5；`see-then-narrate` 用 `weaver describe` 铺场界，阶段 3 按场写旁白。`highlight-mix` 转写抽点，跳过阶段 5。

## 结构怎么选

| | 阶段 1 抽卡 | 阶段 2 展开骨架 |
| --- | --- | --- |
| **当前** | `weaver method list`（成片方法）。看 catalog，不要扫 `library/methods/` 当目录 | `project create` + `weaver recipe apply --project <id> --recipe <id> [--items a,b,c]`。必要时再 `scene add` / `rm`。apply 留下的 `lines[locale]` 是 scene id 占位，阶段 3 必须 `scene set` 换成真旁白。 |

## 阶段

| 阶段 | 名称 | 谁做 | weaver 动词 | 产出 |
| --- | --- | --- | --- | --- |
| 0 | Brief | Agent 只读理念 | `project show` → `paths.brief` | 读任务自带的 brief / 指针。输出名以片子登记为准，不猜。不要去翻别的仓库 |
| 1 | Recipe | Agent 抽卡 | `weaver method list`；`recipe apply --recipe <id>` | 选定问题-规则或对照表阅兵 |
| 2 | Structure | Agent 调 CLI | `project create` + `weaver recipe apply --project <id> --recipe <id> [--items a,b,c]`。必要时再 `scene add` / `rm`。apply / addScene 把每场 `lines[locale]` 写成 scene id 占位；阶段 3 必须 `scene set` 换成真旁白。 | 无 `hero` 的场景列表 + still stub + 占位旁白 |
| 3 | Script | Agent 写文案 | `scene set` / `card set` | 只写 `film.langs` 点名的语言。必须替换 `addScene` 的 id 占位。idea.md 的实现词译成动作和后果；一场只留一个名字；lede 不要整段复述旁白 |
| 4 | Stills | Agent 或人 | 仅 lab+adapter 时 `capture --project`；manual 只手截 + `asset add` | `assets.json` 登记的 png |
| 5 | Voice | Job | `tts --project`（只出 `film.langs`；允许缺 png） | `assets/lines/<lang>/*.wav` |
| 6 | QA | Agent 必跑 | `validate --json`；读 `renderable` | error 或 `!isRenderable` → 不得进 7 的 render |
| 7 | Deliver | Job | `render --project`；有 `publish.dir` 才 `publish` | 只写该片子在 `data/` 下的 `assets/outputs/<output>`。不要写 `products/study-films/` |

`clone-from-edit`：阶段 2 是 `asset add --kind video`（已剪片 `video.edited` + 原片）然后 `weaver match --edited asset:video.edited`。不要 `recipe apply`。match 之后直接阶段 6–7。

`see-then-narrate`：阶段 2 是 `asset add --kind video` 然后 `weaver describe --ref asset:video.origin`。不要 `recipe apply`。阶段 3 按 `sequences` 一场一 clip 写旁白（观察只当素材）。没有描述树禁止写解说。

`highlight-mix`：阶段 2 转写后写 `ost: original` clip。不要 tts。阶段 6–7。
