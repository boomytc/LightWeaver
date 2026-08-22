---
name: lightweaver-assets
description: >
  Ingest LightWeaver library or project assets (voice, still, element,
  reference). Use when adding a timbre, still, logo, or reference image.
  Slash command: /lightweaver-assets.
---

# Ingest assets

Kinds: `voice` | `still` | `element` | `reference` | `method` | `line` | `output` | `video` | `transcript` | `description`.
`line` and `output` are produced by `weaver tts` / `weaver render`。
方法卡登记为 `library:method.*`，文件在 `library/methods/`。人只填名称 / 何时用 / 骨架，不要当图片上传。

Shared library (`library/`):

```bash
npx weaver asset add --library --id voice.prompt --kind voice --file voices/prompt-zh.wav
# 一套声一支克隆源。上传录音或写设计指令铸完再收，二选一。上传空文本会自动转写。
# 已有 wav 缺文本：npx weaver voice asr --id voice.prompt   或 --label 讲解女声
# 改名/改正文：npx weaver asset set --library --id voice.prompt --label 讲解女声 --text "…"
# 删除：npx weaver asset rm --library --label 讲解女声
# 出片 Hi-Fi clone。不要用 tts --seed 改库。不要在库卡上再铸或再传。
# 素材：npx weaver asset add --library --kind element --label 角标 --file elements/pack.svg
#       （不写 --id 时按名称分配 element.* / reference.*）
# 方法：npx weaver method add --label 对照练习 --text "有一份互斥模型清单" --expand list
#       npx weaver method add --label 规则卡 --text "先问题" --expand fixed --scenes problem:problem,rule:rule,contrast:contrast
#       npx weaver method set --id method.taxonomy-parade --text "…" --expand list
#       npx weaver method rm --label 对照练习
```

Project stills and source video:

```bash
npx weaver asset add --project <id> --id still.hero --kind still --file assets/stills/zh/hero.png
npx weaver asset add --project <id> --kind video --id video.edited --file /abs/edited.mp4
npx weaver asset add --project <id> --kind video --id video.ep01 --file /abs/ep01.mp4
```

项目外 video 会拷进 `assets/source/`。已在项目内的相对路径只登记。

Then set `scenes[].still` to `asset:still.hero`. Locale variants use
`files: { "zh": "...", "en": "..." }` in `assets.json`.

人在 Studio `/voices` 管音色（wav 是身份）、`/methods` 管成片骨架、`/library` 管素材（人只填名称，id 自动分配）。元素不强制进片。不要把通用文件柜做进这里。片子静帧仍是任务实例，不是共享库。制作循环中的 still 入库由 film skill 在阶段 4 调用本 skill，不要在这里教叙事。铸声平台：https://platform.modelbest.cn/console/login?ref=B08B4DDF
