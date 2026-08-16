---
name: lightweaver-assets
description: >
  Ingest LightWeaver library or project assets (voice, still, element,
  reference). Use when adding a timbre, still, logo, or reference image.
  Slash command: /lightweaver-assets.
---

# Ingest assets

Kinds: `voice` | `still` | `element` | `reference` | `line` | `output`.
`line` and `output` are produced by `weaver tts` / `weaver render`.

Shared library (`library/`):

```bash
npx weaver asset add --library --id voice.prompt --kind voice --file voices/prompt-zh.wav
# 一套声一支克隆源。上传录音或写设计指令铸完再收，二选一。出片 Hi-Fi clone。不要用 tts --seed 改库。
```

Project stills:

```bash
npx weaver asset add --project <id> --id still.hero --kind still --file assets/stills/zh/hero.png
```

Then set `scenes[].still` to `asset:still.hero`. Locale variants use
`files: { "zh": "...", "en": "..." }` in `assets.json`.

人在 Studio `/voices` 管音色（wav 是身份）、`/library` 管元素和参考图。不要把通用 DAM 做进这里。片子静帧仍是任务实例，不是共享库。制作循环中的 still 入库由 film skill 在阶段 4 调用本 skill，不要在这里教叙事。铸声平台：https://platform.modelbest.cn/console/login?ref=B08B4DDF
