---
name: lightweaver
description: >
  Route LightWeaver work to weaver core, study-films, studio, or library.
  Use when the user mentions LightWeaver / 讲解片 / 场景编排 / Studio.
  Slash command: /lightweaver.
---

# LightWeaver workspace router

Read `AGENTS.md` and `docs/conventions.md` first.

| Ask | Go to |
| --- | --- |
| Schema, CLI, validate, tts/render/match jobs | `weaver/` |
| Shared voice / element / method | `library/`（方法在 `library/methods/`） |
| Task instance | `data/first-party/<id>/` or `data/projects/<id>/`（gitignore） |
| Remotion cards | `products/study-films/` |
| TTS / ASR / capture jobs | `weaver/scripts/` |
| Control site（工作台复制说明，片子页复盘） | `products/studio/` `http://127.0.0.1:5175/` |
| How to author a film | **lightweaver-film** |
| 制作一部讲解片 / 选配方 / 出片 | **lightweaver-film** |
| Task type / study-explainer / footage-narration | **lightweaver-film** |
| How to ingest assets | **lightweaver-assets** |

```bash
make install
make typecheck
make test
make studio
```

Do not copy schema into a product — import `@lightweaver/weaver`.
Do not describe other repositories as part of this product.
