---
name: lightweaver-film
description: >
  Author a LightWeaver study-explainer film via CLI (scenes, cards, voice).
  Slash command: /lightweaver-film.
---

# Author a study-explainer

Read `docs/conventions.md` and `docs/design-study-explainer.md`.

## Verbs

```bash
npx weaver task list
npx weaver project create <id> --task study-explainer [--title] [--source first-party] [--study-slug] [--output] [--output-en]
npx weaver scene add --project <id> --id <scene> --kind still [--still asset:still.x] [--role contrast]
npx weaver scene rm --project <id> --id <scene>
npx weaver scene move --project <id> --id <scene> --after <id>
npx weaver scene set --project <id> --id <scene> --locale zh --text "..."
npx weaver scene set --project <id> --id <scene> --still asset:still.x --fit contain
npx weaver card set --project <id> --locale zh --which title --headline "..." --lede "..."
npx weaver voice set --project <id> --locale zh --ref library:voice.prompt-zh
npx weaver validate <id>
npx weaver tts --project <id>
npx weaver render --project <id>
npx weaver publish --project <id>
```

`--json` 写操作返回 `{ ok, project, film, issues }`。

## Loop

1. User 片：`project create`（落到 `data/projects/`，无 publish.dir，只渲本地）。
2. First-party：`--source first-party --study-slug <slug>`，再 `scene add` 齐 kind，`scene rm --id hero`，手写 `--output` 对齐 SOURCE.md。
3. 手截或 `weaver capture --project`（仅 intent / dropdown）。
4. 绑 still → card/voice → validate → tts → render → 有 dir 才 publish。

不要手改 `film.json` 当日常路径。不要等 MCP / Remotion Player。没有 lab adapter 就手截，不要复制 `capture.mjs`。
