---
name: lightweaver
description: >
  Route LightWeaver work to weaver core, study-films, studio, or library.
  Use when the user mentions LightWeaver / 讲解片 / 场景编排 / Studio.
  Slash command: /lightweaver.
---

# LightWeaver workspace router

Read `AGENTS.md` first.

| Ask | Go to |
| --- | --- |
| Schema, CLI, validate, tts/render jobs | `weaver/` |
| Shared voice / element / reference | `library/` |
| First-party LightUI film files | `products/study-films/projects/<id>/` |
| Remotion cards, LightUI capture | `products/study-films/` |
| Workbench UI | `products/studio/` |
| How to author a film | **lightweaver-film** |
| Task type / 第三部片子 / study-explainer | **lightweaver-film** |
| How to ingest assets | **lightweaver-assets** |

```bash
make install
make typecheck
make test
make studio
```

Do not put this work back in LightUI `tools/study-films`.
Do not copy schema into a product — import `@lightweaver/weaver`.
