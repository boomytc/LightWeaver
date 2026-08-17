# How to add a film

一部片子是一个 **任务实例**。当前只实现 `study-explainer`。LightWeaver 做后处理出片：编排、配音、渲染。上游文案和静帧由任务自带，不在本仓描述别的仓库。

## Project layout

```
film.json                 task、scenes、locale copy、voice、publish
assets.json               项目资产登记
assets/stills/<locale>/   静帧
assets/lines/<locale>/    旁白 wav
assets/outputs/           渲染 mp4（不提交）
```

任务实例都在 `data/`（整树 gitignore），**不提交**。两棵树：`data/projects/<id>/`，以及现网已有的 `data/first-party/<id>/`。`film.id` 等于目录名。

仓库只留可复用物：`weaver/`、`library/`（含 `library/methods/`）、`products/study-films/`（渲染器，不含片子、不含成片）、`products/studio/`、`skills/`。

## 三层存放

片子目录里的 `film.json` 是编排合同，不是理念源，也不是媒体文件。先按层找对象，再跑 weaver。

| 层 | 住哪 | 不往哪写 |
| --- | --- | --- |
| **理念** | 任务自带：用户片 `data/projects/<id>/brief.md`（可选 `brief.en.md`）。若片子写了 `study.slug`，只当指针，不要把上游文案拷进片子目录 | 不把上游 idea 拷进片子。不把 wav/mp4 写进理念目录 |
| **资产** | `library/`（`library:` 音色 / 元素 / 参考）+ 项目 `assets.json` + `assets/stills/<locale>/`。元素是参考权能，不强制 | `library/` 不是文件柜。不发明第三套 ref |
| **产物** | 旁白 `assets/lines/<locale>/<scene>.wav`；成片 `assets/outputs/<output>`。整份任务实例在 `data/` | 不把 `data/` 提交进本仓。不把成片写进 `products/study-films/`。人没另给拷贝位置，就不要拷到仓库外 |

**用户片 brief：** 理念写在 `data/projects/<id>/brief.md`。Agent 写正文；`createProject` **不**代写。weaver **不**解析 brief。没有 brief 就先写 brief，再写 `lines`。

**静帧文件名：** 盘上路径以该项目 `assets.json` 里 `files.<locale>` 为准，**不要**从 `scenes[].id` 或 `asset:still.<id>` 推导。`stillRelPath` 不自动加 `.png`。必须先写进 `assets.json` 再落盘。

**可选增强（方法 / 音色 / 素材）：** 三套都在 `library/`，同一套可增删改的插件。工作台点了才约束 agent，没点就让它自己定，不要代点。方法资产 `library:method.*`，人只填名称 / 何时用 / 骨架；文件在 `library/methods/<pack>/`。音色、素材同样登记在 `library/assets.json`。出片时不要为这一部片子新建方法。库的增删改在 Studio `/methods` `/voices` `/library`，或 `weaver method` / `weaver asset`。禁止把方法写进 `skills/`。

发现三层路径与文件是否存在：`npx weaver project show <id> --json` 的 `paths`（`brief` / `stillFiles` / `lineFiles` / `outputFiles`）和 `renderable`。不要扫仓库。

## study-explainer

- `task: "study-explainer"`
- 场景形状：title 在首、close 在末、至少一场 still
- 旁白写在 `scenes[].lines`
- **口播通俗：** 上游文案可以写实现词；片子 `lines` 与 title/close 卡片必须改成听者的话。一场只留一个要记住的名字。`validate` 对忌语出 warning。「路径」可以留
- **点名：** `film.langs` 是要出的语言。方法、音色、素材都是可选增强：`film.recipe` / `film.voices` / `film.kit` 点了按点的用。Studio 工作台复制说明；`/f/<id>` 只复盘
- **要点板：** title / close 的正文是 `points`（2–4 条）。lede 只留一句。对照条写成 `左 || 右`
- 静帧：`scenes[].still = "asset:still.<id>"`
- 音色套：克隆源二选一。上传后自动转写「文本」。出片固定 Hi-Fi clone。人在 `/voices` 铸、听、留。`tts` 不改库，不加 `--seed`
- 工作台必须写产物位置。没点名就让 agent 开始前先问写到 `data/projects` 还是 `data/first-party`。人没另给拷贝位置，不要拷到仓库外
- `film.publish.dir` 若已有值，`render` 才拷一份出去。工作台不点名仓库外路径

```bash
npx weaver project create my-film --title "演示"
npx weaver recipe apply --project my-film --recipe taxonomy-parade --kinds shot
npx weaver langs set --project my-film --langs zh
npx weaver validate my-film
npx weaver tts --project my-film
npx weaver render --project my-film
```

`make films` / `weaver tts|render` 无 `--project` 时跳过 **不可渲** 片子。指定 `--project` 渲染缺 png 会报错。

## 手截

1. 用任务自己的预览面取静帧（视口 1440×1100，设备像素比 2）。要出的语言各一遍。
2. 写入该项目 `assets.json` 已登记的 `files.<locale>`。
3. 静帧/wav 留在该片子 `data/.../assets/`。

`weaver capture` 仅当片子配了适配器时，才把截图写进该片子的 `assets/stills/`。

## After changing scenes

```bash
npx weaver validate <id>
make remotion
```
