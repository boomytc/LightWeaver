# 制作阶段 0–7

画面语言已冻结为 title 卡 + still + close 卡。阶段 5 是 TTS，不是写 Remotion TSX。

## 结构怎么选（PR1）

| | 阶段 1 抽卡 | 阶段 2 展开骨架 |
| --- | --- | --- |
| **PR1** | 对照 first-party `film.json`：intent-cascade → 问题-规则；dropdown / nav / sidebar → 一种 kind 一场 | `project create` + `scene add` / `scene rm --id hero` |

## 阶段

| 阶段 | 名称 | 谁做 | weaver 动词 | 产出 |
| --- | --- | --- | --- | --- |
| 0 | Brief | Agent 只读理念 | `project show` → `paths.brief` | 读 idea/study/kinds/SOURCE；用户片读或先写 `brief.md`。输出名来自 SOURCE.md，不猜 |
| 1 | Recipe | Agent 抽卡 | 对照 first-party `film.json` | 选定问题-规则或对照表阅兵 |
| 2 | Structure | Agent 调 CLI | `project create` + `scene add`/`rm` | 无 `hero` 的场景列表 + still stub |
| 3 | Script | Agent 写文案 | `scene set` / `card set` | 双语旁白。必须替换 `addScene` 的 id 占位 |
| 4 | Stills | Agent 或人 | 仅 lab+adapter 时 `capture --project`；manual 只手截 + `asset add` | `assets.json` 登记的 png |
| 5 | Voice | Job | `tts --project`（允许缺 png） | `assets/lines/{zh,en}/*.wav` |
| 6 | QA | Agent 必跑 | `validate --json`；读 `renderable` | error 或 `!isRenderable` → 不得进 7 的 render |
| 7 | Deliver | Job | `render --project`；有 `publish.dir` 才 `publish` | `assets/outputs/<output>` |
