# 何时停、何时跑

未选模式 → **停**。三种模式：`template` / `from-study` / `co-create`。点名「按 dropdown / intent 那套」视为已选 `template`。

## 必须停

| 条件 | 问什么 |
| --- | --- |
| 没选模式，也没点名 canon 片 | 三种模式 + 推荐一句 |
| 找不到 `study.json` 且用户片没有 `brief.md` | slug 是否错、是否先写 `brief.md` |
| `recipe list` 没有 `when` 能对上的 **film** 卡 | 是新形状（先 `co-create` 定结构）还是硬套 |
| `capture.kind=manual` 且 png 不在 | 手截；**不要** `weaver capture` |
| `hasErrors(validate)` | 先修形状。停全部生成 |
| 将要 render 且 `!isRenderable` | 列出缺的 png；禁止 render。仅缺 png 仍可 tts |
| 任务自带输出名清单且与 `locales.*.output` 不一致 | 用手写 `--output` 修正；禁止按 id 猜文件名 |
| 用户要把 kind 合并成一场 | 拒绝 |

## 直接跑

- `project create`（参数齐）
- `recipe apply`（结构已定；占位旁白阶段 3 再写）。补场才 `scene add`
- `scene set` / `card set`（模式允许时）
- `validate`
- `tts`（仅 `!hasErrors`）
- `capture`（仅片子配了适配器）
- `render`（当且仅当 `isRenderable`）
- `publish`（当且仅当 `publish.dir` 且 `outputFiles[locale].exists`）
