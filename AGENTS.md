# LightWeaver Workspace Instructions

## Scope

LightWeaver is the workspace for **scene-orchestrated explainer films**.
Shared objects live in `weaver/`. Products consume that package.

- Treat `weaver/` as the core library before adding a second copy of schema,
  path rules, or job runners.
- Treat each `products/<name>/` as a product root. Read its `AGENTS.md`.

## Layout

```
weaver/                         schema, projects, assets, CLI, jobs
library/                        shared voices / elements / references
recipes/                        method cards（lightui-study-explainer；怎么结合，不是媒体）
data/                           任务实例（gitignore）：first-party 顾客片 + 用户片 + 静帧/wav/mp4
products/study-films/           Remotion 渲染器 + stage 截图脚本
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
| LightUI / 顾客片实例 | `data/first-party/<id>/`（不提交） |
| User film | `data/projects/<id>/` or Studio「新建」（不提交） |
| Remotion cards / capture adapter | `products/study-films/` |
| Review surface | `products/studio/` |
| Agent procedure | `skills/lightweaver*` |
| 存放契约 / 按图出片 | `docs/design-placement-contract.md`、`docs/conventions.md` |

Do not re-home the engine under LightUI. Do not fold auto-cutting of
existing footage into this repo (CineWeaver). Do not turn `library/` into
a generic DAM (LightAsset). Do not put recipe markdown under `library/`
or `skills/`.

## Family boundaries

- **CineWeaver** — AI commentary and automated cutting of existing footage.
- **LightTTS** — TTS model exploration. This repo calls a speech API.
- **LightCanvas** — asset libraries and relation canvases.
- **LightUI** — UI studies. Capture may HTTP the lab; publish may copy
  into `LIGHTUI_ROOT`.
- **LightAsset** — cross-folder file management.

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

Remove transient `out/`, `.cache/`, and leftover `data/` task instances.
