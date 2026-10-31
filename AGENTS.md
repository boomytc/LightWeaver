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
| Task instance | `data/projects/<task>/<recipe>/<id>/` or `data/first-party/<task>/<recipe>/<id>/`（不提交；未点方法时 recipe 为 `none`） |
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

本仓采用 `confident-development-conventions`：先保证实现逻辑闭环，完成与改动相称的有限验收后交付。不保留常驻测试套件；临时验证文件放系统临时目录，完成即清理。产品校验、连接诊断与类型检查继续保留。

```bash
make install
make typecheck
npm run build -w @lightweaver/studio
make studio          # http://127.0.0.1:5175/
make remotion        # Remotion preview
```

按改动选择必要检查；同一份改动验收通过后不重复运行，未验证的实际服务或渲染路径在交付时说明。

## Cleanup

Remove transient `out/`, `.cache/`, leftover `data/voice-candidates/`, and leftover `data/` task instances.
