# LightWeaver 实施规格

本目录是 [`docs/design-placement-contract.md`](../docs/design-placement-contract.md) 的 **可执行实施方案**。设计文档定产品形状；这里定每个 PR 改哪些文件、类型长什么样、测什么、怎么验收。

任务核（已落地的 study-explainer CRUD）仍以 [`docs/design-study-explainer.md`](../docs/design-study-explainer.md) 为准，本目录不重做。

## 读序

| 文件 | 对应 | 内容 |
| --- | --- | --- |
| [00-overview.md](./00-overview.md) | 整条线 | 目标、DAG、验收、明确不做 |
| [01-pr1-project-paths.md](./01-pr1-project-paths.md) | PR1 | `projectPaths` + `project show` 的 `paths` + skill 约定表 |
| [02-pr2-recipe-discover.md](./02-pr2-recipe-discover.md) | PR2 | 6 张 recipe + `recipe list\|show` |
| [03-pr3-recipe-apply.md](./03-pr3-recipe-apply.md) | PR3 | `recipe apply`（确定性骨架） |
| [04-pr4-studio-review.md](./04-pr4-studio-review.md) | PR4 | Studio 复核面 + `/api/media` 播 mp4 |
| [05-pr5-docs.md](./05-pr5-docs.md) | PR5 | AGENTS / conventions 指针 |

PR6（nav/sidebar 手截出片）**不在本目录**。Q-media 已拍板 M2。

## 约束（所有 spec 共用）

- 不改 `FilmDoc`。不加 `film.recipeId`。
- `projectPaths` 不进 `project.ts`。weaver 不 import `products/*`。
- 无 MCP、无 `weaver produce`、无核内 LLM、无 Remotion 逐片 TSX、无 drama-plot 空模块。
- Studio `<video src>` 只用 `/api/media`（`projectMedia(id, rel)`），不用磁盘绝对路径。
- CLI 错误与操作者日志用中文；标识符用英文。
- 一种 LightUI kind 一场 still；`film.id === study.slug ===` 目录名。

## 落地顺序

```
PR1 ──┬── PR2 ── PR3
      └── PR4
PR2 ────────── PR5
```

每条 PR 合入后应能独立通过 `make typecheck` 与 `make test`。

## 怎么用这些 spec

1. 先读 [`00-overview.md`](./00-overview.md) 的 DAG 与硬约束。
2. 只开当前 PR 对应的那一份；不要提前写下一份里的命令（尤其 PR1 禁止 `recipe list`/`apply`）。
3. 类型、测试名、禁串以该 PR spec 为准；产品动机以 [`docs/design-placement-contract.md`](../docs/design-placement-contract.md) 为准。

开工命令：

```bash
make typecheck && make test && npx weaver project show nav-taxonomy --json
```

今日 show JSON 还没有 `paths` / `renderable`。那是 PR1 的 before 夹具。
