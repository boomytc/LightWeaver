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

## 三层存放

片子目录里的 `film.json` 是编排合同，不是理念源，也不是媒体文件。先按层找对象，再跑 weaver。

| 层 | 住哪 | 不往哪写 |
| --- | --- | --- |
| **理念** | first-party：`$LIGHTUI_ROOT/studies/<slug>/`（`idea.md`、`idea.en.md`、`study.json`；taxonomy 另有 `src/lib/kinds.ts`；成片文件名看 `references/SOURCE.md`）。用户片：`data/projects/<id>/brief.md`（可选 `brief.en.md`） | 不把 `idea.md` / `kinds.ts` 拷进片子目录。不把 wav/mp4 写进理念目录 |
| **资产** | `library/`（`library:` 音色 / 元素）+ 项目 `assets.json` + `assets/stills/<locale>/` | `library/` 不是 DAM。不把 stills 写进 LightUI `references/`。不发明第三套 ref |
| **产物** | 旁白 `assets/lines/<locale>/<scene>.wav`；成片 `assets/outputs/<output>`（gitignore）。有 `publish.dir` 才拷 **mp4** 到 LightUI `references/` | 不提交 `assets/outputs/`。不把 wav/mp4 写进 study 源码树 |

**用户片 brief：** 没有 LightUI study 时，理念写在 `data/projects/<id>/brief.md`。Agent 写正文；`createProject` **不**代写。weaver **不**解析 brief。没有 brief 就先写 brief，再写 `lines`。用户片若同时带了 `study.slug`，主理念仍读 LightUI idea（文件在的话），否则用 brief；**不要**把 idea 拷进项目。

**静帧文件名：** 盘上路径以该项目 `assets.json` 里 `files.<locale>` 为准，**不要**从 `scenes[].id` 或 `asset:still.<id>` 推导。`stillRelPath` 不自动加 `.png`。

- 反例：intent 的 `asset:still.problem` → `assets/stills/zh/desktop-full.png`，不是 `problem.png`。dropdown 的 `still.select` → `select-open.png`，`still.multi` → `comp-02.png`。
- 新 taxonomy / manual 片约定 `<kind>.png`（与 `scenes[].id` 相同），仍必须先写进 `assets.json` 再落盘。
- 历史文件名保留，不要回写成 `<kind>.png`。

**方法资产：** `recipes/study-explainer/`（与 `library/` 平级）。选卡：`npx weaver recipe list --task study-explainer`，再 `recipe show <id>`。禁止 `library/recipes/`，禁止 `skills/**/recipes/`。

发现三层路径与文件是否存在：`npx weaver project show <id> --json` 的 `paths`（`brief` / `stillFiles` / `lineFiles` / `outputFiles`）和 `renderable`。不要扫仓库。

## study-explainer

- `task: "study-explainer"`
- 场景形状：title 在首、close 在末、至少一场 still
- 旁白写在 `scenes[].lines`
- 静帧：`scenes[].still = "asset:still.<id>"`
- 音色：`voices.<locale> = "library:voice.prompt-zh"`
- 有 `publish.dir` 才发布到 LightUI `studies/<slug>/references/`

```bash
npx weaver project create my-film --title "演示"
npx weaver recipe apply --project my-film --recipe taxonomy-parade --kinds shot
# 或 scene add --project my-film --id shot --kind still --still asset:still.shot
# 按 assets.json 的 files.<locale> 写入（新片约定 shot.png；不要从 id 猜）
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
5. 写入该项目 `assets.json` 已登记的 `files.<locale>`。新片约定 `assets/stills/{zh,en}/<kind>.png`（文件名 = kind id，不要新造 `comp-01.png`）。intent / dropdown 的历史名（`desktop-full.png`、`select-open.png`、`comp-02.png`、`date-cal.png` 等）以 `assets.json` 为准，不要改名。
6. LightUI `references/` **只收 mp4**，不收这些 png。`make films` 用已提交进 LightWeaver 的 stills+wav 重渲 mp4。

`capture.mjs` 只服务 `intent-cascade` 与 `dropdown-taxonomy`。没有 adapter 的片子不要等 `make films-capture`。

## After changing scenes

```bash
npx weaver validate <id>
make remotion
```
