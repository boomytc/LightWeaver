# weaver

Stable shared core. Products import this package; they do not copy schema,
path rules, or job runners.

## Layout

```
src/schema.ts          Film / Asset / Scene / task types（`@lightweaver/weaver/schema`）
src/voices.ts          无 Node 的克隆源 / Hi-Fi / voiceSetId（`/voices`）
src/method.ts          无 Node 的 recipeIdOf（`/method`）
src/ingest.ts          上传进库（buffer，不吃 Express）
src/tasks/             TaskModule（renderer remotion|compose，surface cards|clips）
src/scenes.ts          add/rm/move/patch/card/voice
src/paths.ts           workspace roots（libraryRoot 与 recipeRoot 并列）
src/project.ts         list / load / save / create
src/project-paths.ts   project show 的 paths（禁止并进 project.ts）
src/recipes.ts         recipe list/show/apply
src/library-method.ts  方法插件 CRUD（写 library/methods + catalog）
src/library-material.ts 素材插件：按名称分配 element.* / reference.*
src/assets.ts          resolve refs, add assets
src/validate.ts        catalog + isRenderable
src/sync.ts            Remotion public links + catalog
src/tts.ts             VoxCPM2：speakLine（独立一句）与片子 lines job
src/asr.ts             Qwen3-ASR：asrAudio / runAsr（独立文件，wav 或视频）
src/transcribe.ts      源视频转写 → assets/transcripts（TranscriptResult；句/字时间）
src/describe.ts        源视频画面树 → assets/descriptions（场/镜/观察；不写 film.json）
src/vlm.ts             MiniCPM-V 描述 job（ModelBest；缺密钥失败）
src/probe.ts           ffprobe 时长 / 音轨 / 静音岛
src/sentences.ts       标点切句并铺到语音岛
src/match.ts           已剪片对齐原片，写出 clip 场（不自动 render）
src/voice-mint.ts      设计指令铸试听 / 收下为克隆源
src/compose.ts         footage-narration：ffmpeg 按 OST 裁段合成
src/render.ts          按 task 分流 Remotion 或 compose；publish
src/cli.ts             JSON/human CLI
src/capture.ts         截图作业入口
scripts/               tts.py / asr.py / vlm.py / capture.mjs（不跟 LIGHTWEAVER_ROOT）
```

## Rules

- Identifiers English. Operator logs and CLI errors Chinese.
- Fail visibly. No silent fallback to a sibling project or missing voice.
- Do not import `products/*`.
- No LLM in weaver. No model client, no `produce` / `plan`, no narration
  generator inside this package. Agent drafts `lines` in its own process;
  weaver only writes files and runs jobs (`tts.py`, `asr.py`, `vlm.py`, Remotion, ffmpeg compose / match / describe, `capture.mjs`).
  STT/TTS 原语（`weaver asr`、`weaver tts --text`）不依赖 film.json，给任意 agent 的 CLI 调用。
- `recipeRoot` is `library/methods` (method plugins live in the library).
  `LIGHTWEAVER_RECIPES` is test-fixture only. Never `skills/**/recipes/`.
- `project.ts` must not import `project-paths.ts`, `assets.ts`, or
  `validate.ts`. `project-paths.ts` must not import `validate.ts`
  (`assets.ts` already imports `saveAssets` from `project.ts`; a reverse
  import is a cycle). Put `projectPaths` only in `project-paths.ts`.
- Task instances live under `data/` (gitignored): `data/first-party/<task>/<recipe>/<id>/`
  and `data/projects/<task>/<recipe>/<id>/` (`none` when no method). Voices, elements, and methods live in `library/`.
  Film-level methods are catalogued as `kind: method`.
  `createLibraryMethod` / `updateLibraryMethod` write the catalog
  (name / when / expand / scenes) and a projection file under
  `library/methods/<recipePack>/`. Studio reads the catalog only.
  Apply / assert / `method list` / `recipe list` / `recipe show` 都只读 catalog：
  `fixed` 用 `scenes`，`list` 用 `--items`。`--kinds` 是 `--items` 的遗留别名。
  `library/methods/<recipePack>/` 只放 catalog 投影短文。要改场次用 Studio
  `/methods` 或 `weaver method set`，再 apply。
