# 何时停、何时跑

未选模式 → **停**。三种模式：`template` / `from-study` / `co-create`。点名「按 dropdown / intent 那套」视为已选 `template`。

## 必须停

| 条件 | 问什么 |
| --- | --- |
| 没选模式，也没点名 canon 片 | 三种模式 + 推荐一句 |
| 找不到 `study.json` 且用户片没有 `brief.md` | slug 是否错、是否先写 `brief.md` |
| 四则 first-party `film.json` 对不上用户要的形状 | 是新形状（先 `co-create`）还是硬套 |
| `capture.kind=manual` 且 png 不在 | 手截；**不要** `weaver capture` |
| `hasErrors(validate)` | 先修形状。停全部生成 |
| 将要 render 且 `!isRenderable` | 列出缺的 png；禁止 render。仅缺 png 仍可 tts |
| first-party 且 SOURCE.md 点名的 output 与 `locales.*.output` 不一致 | 用手写 `--output` 修正；禁止按 slug 猜 `nav-taxonomy.mp4` |
| 用户要把 kind 合并成一场 | 拒绝 |

## 直接跑

- `project create`（参数齐）
- `scene add`（结构已定）
- `scene set` / `card set`（模式允许时）
- `validate`
- `tts`（仅 `!hasErrors`）
- `capture`（仅 lab+adapter）
- `render`（当且仅当 `isRenderable`）
- `publish`（当且仅当 `publish.dir` 且 `outputFiles[locale].exists`）
