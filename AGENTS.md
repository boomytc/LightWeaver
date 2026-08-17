# LightWeaver Workspace Instructions

## Scope

LightWeaver is the workspace for **post-processed, scene-orchestrated films**.
Shared objects live in `weaver/`. Products consume that package.

- Treat `weaver/` as the core library before adding a second copy of schema,
  path rules, or job runners.
- Treat each `products/<name>/` as a product root. Read its `AGENTS.md`.

## Layout

```
weaver/                         schema, projects, assets, CLI, jobs
library/                        shared voices / elements / references
recipes/                        method cards（怎么结合，不是媒体）
data/                           任务实例（gitignore）：data/first-party + data/projects
products/study-films/           Remotion 渲染器 + 可选截图脚本
products/studio/                local WebUI
skills/                         agent skills
```

Root Makefile orchestrates. Do not put app `src/` at the repository root.

## Where to put work

| Change | Put it here |
| --- | --- |
| Film / asset / job model, CLI | `weaver/` |
| Shared voice / element / reference | `library/` |
| Recipe / 方法卡 | `recipes/lightui-study-explainer/` |
| Task instance | `data/projects/<id>/` or `data/first-party/<id>/`（不提交） |
| Remotion cards / capture adapter | `products/study-films/` |
| Control site | `products/studio/`（`/` `/methods` `/voices` `/library` `/films`） |
| Agent procedure | `skills/lightweaver*` |
| 现网存放图 | `docs/conventions.md` |

Do not fold auto-cutting of existing footage into this repo. Do not turn
`library/` into a generic file cabinet. Do not put recipe markdown under
`library/` or `skills/`. Do not describe other repositories as part of
this product. Upstream copy and stills arrive with the task.

## Skills

- `skills/lightweaver` — workspace router
- `skills/lightweaver-film` — author a film via CLI / project files
- `skills/lightweaver-assets` — ingest library / project assets

## Validation

```bash
make install
make typecheck
make test
make studio          # http://127.0.0.1:5175/
make remotion        # Remotion preview
```

## Cleanup

Remove transient `out/`, `.cache/`, leftover `data/voice-candidates/`, and leftover `data/` task instances.
