# How to add a film

一部片子是一个 **任务实例**。当前只实现 `study-explainer`（LightUI study 教学讲解片）。

## Project layout

```
film.json                 task、scenes、locale copy、voice、publish
assets.json               项目资产登记
assets/stills/<locale>/   静帧
assets/lines/<locale>/    旁白 wav
assets/outputs/           渲染 mp4（不提交）
```

First-party：`products/study-films/projects/<slug>/`，且 `film.id === study.slug === 目录名`。
User：`data/projects/<id>/`。

## study-explainer

- `task: "study-explainer"`
- 场景形状：title 在首、close 在末、至少一场 still
- 旁白写在 `scenes[].lines`
- 静帧：`scenes[].still = "asset:still.<id>"`
- 音色：`voices.<locale> = "library:voice.prompt-zh"`
- 有 `publish.dir` 才发布到 LightUI `studies/<slug>/references/`

```bash
npx weaver project create my-film --title "演示"
npx weaver scene add --project my-film --id shot --kind still --still asset:still.shot
# 放入 assets/stills/{zh,en}/shot.png
npx weaver validate my-film
npx weaver tts --project my-film
npx weaver render --project my-film
```

`make films` / `weaver tts|render` 无 `--project` 时跳过 **不可渲** 片子（形状绿但缺 png）。指定 `--project` 渲染缺 png 会报错。

## 手截配方（nav / sidebar 等 manual 片）

1. lab：`http://127.0.0.1:5173/s/<slug>`，light 主题。
2. 视口 1440×1100，设备像素比 2。中英各一遍。
3. 点 `[data-kind=<kind>]`，等 `[data-film=fixture]`。
4. shrink：在 fixture **内部**滚过约 40px。
5. 写入 `assets/stills/{zh,en}/<kind>.png`（文件名 = kind id，不用 `comp-01.png`）。
6. LightUI `references/` **只收 mp4**，不收这些 png。`make films` 用已提交进 LightWeaver 的 stills+wav 重渲 mp4。

`capture.mjs` 只服务 `intent-cascade` 与 `dropdown-taxonomy`。没有 adapter 的片子不要等 `make films-capture`。

## After changing scenes

```bash
npx weaver validate <id>
make remotion
```
