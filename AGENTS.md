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
data/projects/                  user projects (gitignored)
products/study-films/           Remotion renderer + LightUI capture
products/study-films/projects/  first-party LightUI films
products/studio/                local WebUI
skills/                         agent skills
```

Root Makefile orchestrates. Do not put app `src/` at the repository root.

## Where to put work

| Change | Put it here |
| --- | --- |
| Film / asset / job model, CLI | `weaver/` |
| Shared voice / element / reference | `library/` |
| New first-party LightUI film | `products/study-films/projects/<id>/` |
| User film | `data/projects/<id>/` or Studio「新建」 |
| Remotion cards / capture adapter | `products/study-films/` |
| Workbench UI | `products/studio/` |
| Agent procedure | `skills/lightweaver*` |

Do not re-home the engine under LightUI. Do not fold auto-cutting of
existing footage into this repo (CineWeaver). Do not turn `library/` into
a generic DAM (LightAsset).

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

Remove transient `out/`, `.cache/`, and `data/projects/` leftovers that
are not deliberate first-party fixtures.
