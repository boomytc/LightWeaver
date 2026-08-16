# weaver

Stable shared core. Products import this package; they do not copy schema,
path rules, or job runners.

## Layout

```
src/schema.ts          Film / Asset / Scene / task types
src/tasks/             TaskModule（只实现 study-explainer）
src/scenes.ts          add/rm/move/patch/card/voice
src/paths.ts           workspace roots（libraryRoot 与 recipeRoot 并列）
src/project.ts         list / load / save / create
src/project-paths.ts   project show 的 paths（禁止并进 project.ts）
src/recipes.ts         recipe list/show/apply
src/assets.ts          resolve refs, add assets
src/validate.ts        catalog + isRenderable
src/sync.ts            Remotion public links + catalog
src/tts.ts             VoxCPM2 line job（Hi-Fi：试听优先）
src/voice-mint.ts      铸试听 / 收下试听或克隆源
src/render.ts          Remotion + publish
src/cli.ts             JSON/human CLI
```

## Rules

- Identifiers English. Operator logs and CLI errors Chinese.
- Fail visibly. No silent fallback to a sibling project or missing voice.
- Do not import `products/*`.
- No LLM in weaver. No model client, no `produce` / `plan`, no narration
  generator inside this package. Agent drafts `lines` in its own process;
  weaver only writes files and runs jobs (`tts.py`, Remotion, `capture.mjs`).
- `recipeRoot` lives in `paths.ts` next to `libraryRoot`. Product default is
  the repo-root `recipes/` directory. Never `library/recipes/` or
  `skills/**/recipes/`. `LIGHTWEAVER_RECIPES` is test-fixture only — do not
  put scratch paths in this file.
- `project.ts` must not import `project-paths.ts`, `assets.ts`, or
  `validate.ts`. `project-paths.ts` must not import `validate.ts`
  (`assets.ts` already imports `saveAssets` from `project.ts`; a reverse
  import is a cycle). Put `projectPaths` only in `project-paths.ts`.
- Task instances live under `data/` (gitignored): LightUI jobs in
  `data/first-party/`, user films in `data/projects/`. Shared voices live in
  `library/`. Method cards live in `recipes/lightui-study-explainer/`
  (`TaskModule.recipePack`; task id remains `study-explainer`).
