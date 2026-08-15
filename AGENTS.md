# LightWeaver Workspace Instructions

## Scope

LightWeaver is the workspace for **scene-orchestrated explainer films**:
title / still / close cards, narration, subtitles, Remotion preview and
render. It is not a long-form auto-editor and not a TTS model lab.

The repository root is not an application. It holds catalog, conventions,
aggregate commands, and project skills.

- Treat each `products/<name>/` as a product root before editing that product.
- Read this file first, then the local `AGENTS.md`.

## Layout

```
skills/                      agent workflows for this repo
docs/                        film contract and workspace notes
products/study-films/        first product: scene films (from LightUI)
```

Root Makefile is an orchestrator only. Do not put app `src/` at the
repository root.

## Where to put work

| Change | Put it here |
| --- | --- |
| Scene film engine, Remotion, TTS, capture | `products/study-films/` |
| New explainer film | `products/study-films/films/<id>.json` + narration |
| How a film is declared | `docs/conventions.md` |
| Agent procedure | `skills/lightweaver` |

Do not create empty product folders. Do not start a timeline editor or
shared component library until a second product needs one.

## Family boundaries

- **CineWeaver** owns AI commentary and automated cutting of existing footage.
- **LightTTS** owns TTS model exploration. This repo calls a speech API.
- **LightCanvas** owns asset libraries and relation canvases.
- **LightUI** owns UI studies and the lab. Capture may talk to the lab;
  published stills and mp4s still land in LightUI `studies/*/references/`.
  Do not re-home the film engine under LightUI.

## Skills

Repository agent skills live under root-level `skills/<name>/SKILL.md`.
Do not put them in `.grok/skills/`.

- `skills/lightweaver` — where a change belongs

## Validation

```bash
make install
make typecheck
make test
make studio
```

Studio: Remotion at the default studio port from `products/study-films`.

## Cleanup

Remove transient `out/`, `.cache/`, and one-off renders that are not
deliberate fixtures under `public/`.
