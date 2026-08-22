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
| Schema, CLI, validate, tts/render/match/describe jobs | `weaver/` |
| 独立 STT / TTS（不需要片子） | `weaver asr` / `weaver tts --text`（见下） |
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

感知 / 合成原语（任意 agent，不建片子）：

```bash
npx weaver asr --file clip.wav --json
npx weaver tts --text "这一下她没再退。" --voice library:voice.prompt --dest /tmp/line.wav --json
```

片子里的转写/旁白仍走 `transcribe --project` / `tts --project`。不要 import `weaver/scripts/*.py`。

Do not copy schema into a product — import `@lightweaver/weaver`.
Do not describe other repositories as part of this product.
