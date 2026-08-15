---
name: lightweaver
description: >
  Route LightWeaver work to the scene-film product (films JSON, Remotion,
  capture, TTS, render/publish). Use when adding or editing an explainer
  film, moving video work out of LightUI, or the user mentions LightWeaver
  / study-films / 讲解片 / 场景编排. Slash command: /lightweaver.
---

# LightWeaver workspace router

Read `AGENTS.md` first, then `docs/conventions.md`.

## Put work here

| Ask | Go to |
| --- | --- |
| Scene cards, Remotion, subtitles, theme | `products/study-films/src/` |
| New or edited explainer film | `products/study-films/films/<id>.json` + `scripts/narration.json` + `src/lib/catalog.ts` |
| Lab screenshots | `products/study-films/scripts/capture.mjs` |
| Voice clone / narration wavs | `products/study-films/scripts/tts.py` |
| Render + publish to LightUI references | `products/study-films/scripts/render.mjs` |
| How a film is declared | `docs/conventions.md` |

Root Makefile is an orchestrator only. Do not add app `src/` at repo root.
Do not create empty product folders.

Do not put this work back in LightUI `tools/study-films` — that folder is
a shim. Do not fold it into CineWeaver (auto-cut existing footage) or
LightTTS (model exploration).

## Default commands

```bash
make install
make typecheck
make test
make studio
make films                 # lab must be up; LIGHTUI_ROOT=../LightUI
```
