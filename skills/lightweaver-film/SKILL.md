---
name: lightweaver-film
description: >
  Author or edit a LightWeaver film project (film.json scenes + lines).
  Use when adding a film, changing narration, or running tts/render via CLI.
  Slash command: /lightweaver-film.
---

# Author a film

Read `docs/conventions.md`.

1. First-party LightUI film: `products/study-films/projects/<id>/`.
   User film: `weaver project create <id>` → `data/projects/<id>/`.
2. Edit `film.json` only. Scene ids and spoken lines live there.
3. Point `scenes[].still` at `asset:<id>` after the still is in `assets.json`.
4. Point `voices.<locale>` at `library:<id>`.
5. Validate and preview:

```bash
npx weaver validate <id>
npx weaver tts --project <id>
npx weaver render --project <id>
make remotion
```

Do not revive `scripts/narration.json` or `src/lib/catalog.ts`.
