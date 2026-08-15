# QA 门禁

前 5 条是 weaver 已实现的事实，去 **读**，不要在 agent 里重写一套校验。

| # | 门 | 证据 | 不过则 |
| --- | --- | --- | --- |
| Q1 | `validate` 无 error | `weaver validate <id> --json` | 停。修形状 / 旁白空 / 缺 still 引用 |
| Q2 | title 在 `[0]`、close 在末、恰好各一 | study-explainer validate | 已是 error |
| Q3 | 每 locale 每场 `lines` 非空 | `scenes.*.lines.<locale>` trim 后为空 → error。`addScene` 的 id 占位也算非空，阶段 3 仍须替换 | error |
| Q4 | first-party：`SOURCE.md` 点名 `copy.output` | 若 SOURCE.md 存在且正文不含该 locale 的 `copy.output` → warning | warning；对齐后再 publish |
| Q5 | 若写了任一 `role`：problem+contrast 或全 still=contrast | D11 | warning |
| Q6 | 双语对等 | 每个 scene 的 zh/en 都针对同一事实；en 读 `idea.en.md` | 停，改稿。不进 weaver |
| Q7 | 无种子 `hero`（first-party） | `project show` | `scene rm --id hero` |
| Q8 | taxonomy 片：scene id 集合 = kinds 集合 | 与 kinds.ts 对一下 | 补场，不合并 |
| Q9 | `isRenderable === true` | `project show` 的 `renderable` | **禁止 `render --project`** |
| Q10 | 成片文件名不是猜的 | 与 SOURCE.md 逐字相同 | 用手写 `--output` |
| Q11 | 口播/卡片无「叶子」「提交模型」等忌语 | `validate` warning：`口播忌术语` / `卡片忌术语` | 改成听者的话再 tts |
