# weaver

Stable shared core. Products import this package; they do not copy schema,
path rules, or job runners.

## Layout

```
src/schema.ts      Film / Asset / Scene / task types
src/tasks/         TaskModule（只实现 study-explainer）
src/scenes.ts      add/rm/move/patch/card/voice
src/paths.ts       workspace roots
src/project.ts     list / load / save / create
src/assets.ts      resolve refs, add assets
src/validate.ts    catalog + isRenderable
src/timeline.ts    duration estimate
src/sync.ts        Remotion public links + catalog
src/tts.ts         VoxCPM2 job
src/render.ts      Remotion + publish
src/cli.ts         JSON/human CLI
```

## Rules

- Identifiers English. Operator logs and CLI errors Chinese.
- Fail visibly. No silent fallback to a sibling project or missing voice.
- Do not import `products/*`.
- User projects live in `data/projects/`. First-party LightUI films live in
  `products/study-films/projects/`. Shared voices/elements live in `library/`.
