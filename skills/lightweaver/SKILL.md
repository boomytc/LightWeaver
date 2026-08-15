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
| LightUI / 顾客片实例 | `data/first-party/<id>/`（gitignore） |
| Remotion cards, LightUI capture | `products/study-films/` |
| Control site（人管音色/素材，复核片子） | `products/studio/` `http://127.0.0.1:5175/` |
| How to author a film | **lightweaver-film** |
| 制作一部讲解片 / 选配方 / 从 study 出片 | **lightweaver-film** |
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
