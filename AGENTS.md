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
library/                        可选增强：voices / elements / methods
data/                           任务实例（gitignore）：data/first-party + data/projects
products/study-films/           Remotion 渲染器
products/studio/                local WebUI
skills/                         agent skills
```

Root Makefile orchestrates. Do not put app `src/` at the repository root.

## Where to put work

| Change | Put it here |
| --- | --- |
| Film / asset / job model, CLI | `weaver/` |
| Shared voice / element / method | `library/`（方法在 `library/methods/`） |
| Task instance | `data/projects/<id>/` or `data/first-party/<id>/`（不提交） |
| Remotion cards | `products/study-films/` |
| TTS / ASR / capture scripts | `weaver/scripts/` |
| Control site | `products/studio/`（`/` `/methods` `/voices` `/library` `/films`） |
| Agent procedure | `skills/lightweaver*` |
| 现网存放图 | `docs/conventions.md` |

`study-explainer` is still-card films. `footage-narration` cuts source
video along `film.json` time ranges (ffmpeg compose). `weaver match`
writes those clip ranges from an edited reference plus source videos.
`weaver describe` writes a shot/sequence observation tree; the agent
writes clip fields. Do not treat observations as narration.
`weaver asr` / `weaver tts --text` are standalone STT/TTS for any agent
CLI. They do not require a film. `transcribe --project` / `tts --project`
still write project assets.
Do not turn
`library/` into a generic file cabinet. Method plugins live in
`library/methods/`, not `skills/`. Do not describe other repositories as
part of this product. Stills or source video arrive with the task.

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
