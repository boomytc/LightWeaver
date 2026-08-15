# 05 · PR5 文档指针

| 字段 | 值 |
| --- | --- |
| 对应设计 | [`docs/design-placement-contract.md`](../docs/design-placement-contract.md) **PR5**（核文档指针 + 约定） |
| 与任务核的分工 | [`docs/design-study-explainer.md`](../docs/design-study-explainer.md) 是 TaskModule / CRUD / 形状·媒体；本文档只钉「两份设计怎么读、仓内约定写哪」 |
| 标题 | `docs: placement contract pointer; study-explainer remains the job API` |
| 依赖 | **PR2**（`recipeRoot` 已在 `weaver/src/paths.ts`，仓库根 `recipes/study-explainer/` 已提交 6 张真卡 + `index.md`）。PR1 的 `project-paths.ts` 亦应已在 |
| 类型 | **只改文档**。零 TypeScript、零 skill 正文、零 `film.json`、零 LightUI |
| 行号基线 | 本仓 2026-08-15 工作区快照。合入前按「锚段落」对一下，不要死盯行号若 PR2 已先改过 `conventions.md` |

---

## 范围 / 非目标

### 范围（只这四个文件）

| 文件 | 本 PR 必须落地的句子 |
| --- | --- |
| [`docs/design-study-explainer.md`](../docs/design-study-explainer.md) | 文首指针**已在**；补 **分工表**。两份设计 **不要合并** |
| [`docs/conventions.md`](../docs/conventions.md) | **三层存放短表**；用户片 `brief.md`；静帧文件名以 `assets.json` 为准、禁止从 scene id 猜；方法路径 `recipes/study-explainer/` |
| [`weaver/AGENTS.md`](../weaver/AGENTS.md) | weaver **无 LLM**；`recipeRoot` 与 `libraryRoot` 并列；`project-paths.ts` **循环禁令**（`project.ts` 不得 import 它）；layout 补 `project-paths.ts`、`recipes.ts` |
| [`AGENTS.md`](../AGENTS.md) | layout 树已有 `spec/`；**补 `recipes/` 目录行**。同文件「Where to put work」加一行，避免方法卡被塞进 `library/` |

### 非目标

- 不改 `README.md`、三个 `skills/**/SKILL.md`、`references/{pipeline,modes,qa}.md`（PR1 / PR2 / PR3 的活）。
- 不改 `docs/design-placement-contract.md`（它已是产品形状源；本 PR 是它的落地指针，不是再写一稿）。
- 不改 `weaver/src/**`、不改 Studio、不改 first-party `film.json` / `assets.json`。
- **不碰 LightUI 任何文件。** 本仓文档继续可以写 `LIGHTUI_ROOT` / `studies/<slug>/`；**禁止**在本 PR 新增「去改 LightUI 公开 README / lab」的句子，也禁止把兄弟私有仓名写进任何将拷到 LightUI 的说明。
- 不把 `/tmp/…`、`/var/folders/…`、本机 scratch、`LIGHTWEAVER_RECIPES=/tmp/…` 写进永久文档。测试夹具环境变量只允许在 `weaver/AGENTS.md` 写一句「仅测试用」，不给具体 scratch 路径。
- 不重开 D1–D13，不重写存放契约的 mermaid / 6 张 recipe 正文 / skill 阶段表。
- 不把 `docs/design-study-explainer.md` 自己的 **PR Plan § PR5**（nav/sidebar 骨架，核侧编号）改写成存放契约 PR5。两套 PR 编号并存，不要「统一」。

---

## 现网文档现状

### `docs/design-study-explainer.md`

**文首指针已经存在**，第 12 行（元信息表后、`---` 前）：

```
产品形状（理念 / 资产 / 产物 存放契约，agent 按图出片）见 [`design-placement-contract.md`](./design-placement-contract.md)。本文是任务核（TaskModule、FilmDoc、形状/媒体、CLI/HTTP），不重开。
```

缺的不是再加一句「见另一篇」，而是：

1. **没有分工表。** 读者仍会把存放图、recipe、LLM 归属、Studio 产品故事往这篇 D1–D13 里塞，或反过来把 TaskModule 细节抄进 placement。
2. Overview（第 16 行起）仍是核落地前的「Studio 工作台 + 第三部片子必须手改 JSON」叙事。那是任务核文档的历史动机，**本 PR 不改 Overview、不把 recipes mermaid 贴进来**。
3. 文末 PR Plan（约第 947 行起）里的「PR5 — nav / sidebar 骨架」是 **study-explainer 核计划的 PR5**，现网 `nav-taxonomy` / `sidebar-taxonomy` 目录已在。存放契约 PR Plan 的 PR5 才是本 spec。两套编号不要对打、不要改名。
4. References（第 934 行）未点名 `design-placement-contract.md`。

**结论：** 保留第 12 行指针；在它后面插入分工表 +「不要合并」；References 补一条。不要把两篇合成一篇。

### `docs/conventions.md`（全文 55 行）

现网只有项目内 layout，没有仓级三层图：

| 行 | 现状 | 缺口 |
| --- | --- | --- |
| 1–3 | 「一部片子是一个任务实例」 | 未说理念 / 资产 / 产物分家 |
| 5–16 | `film.json` / `assets.json` / `stills` / `lines` / `outputs`；first-party 与 user 目录 | 未写用户片 `brief.md`；未写 `recipes/study-explainer/` |
| 18–25 | still 引用写成 `asset:still.<id>` | 未写盘上文件名以 `assets.json` `files.<locale>` 为准 |
| 30 | 注释 `# 放入 assets/stills/{zh,en}/shot.png` | 会诱使从 id 猜文件名（intent 的 `still.problem` 实际是 `desktop-full.png`） |
| 38–47 | 手截配方：新片 `<kind>.png`，不用 `comp-01.png` | 对 **新** taxonomy 仍对；未声明历史片保留 `assets.json` 旧名 |
| 全文 | 无 recipe 路径 | PR2 落地后 agent 会在 `library/` 或 `skills/` 下找卡 |

[`docs/design-placement-contract.md`](../docs/design-placement-contract.md) PR2 影响面写过「`docs/conventions.md` 加存放图短表」。**本 PR 是这张短表的完整业主。** 若 PR2 已先插入一小节，**替换成下面的完整短表**，禁止叠两张表。

### `weaver/AGENTS.md`（全文 30 行）

Layout（第 7–21 行）停在 `src/cli.ts`，没有 `project-paths.ts` / `recipes.ts`。`src/paths.ts` 注释只写 `workspace roots`，未点名 `recipeRoot`。

Rules（第 23–29 行）有「不要 import `products/*`」和三处根目录，没有：

- LLM / `produce` / 旁白生成器禁令（P6）
- `recipeRoot` 与 `libraryRoot` 并列、禁止 `library/recipes/`
- `project.ts` ⇄ `project-paths.ts` / `assets.ts` 环（`assets.ts` 第 7 行已 `import { saveAssets } from "./project.ts"`）

现网 `weaver/src/` **尚无** `project-paths.ts` / `recipes.ts` / `recipeRoot`（PR1/PR2 未合）。本 PR **依赖它们已经存在** 才把文件名写进 AGENTS；不要在 PR2 前合本文档。

### 根 `AGENTS.md`

Layout 第 14–23 行已有 `spec/`（第 22 行），**没有 `recipes/`**。`library/` 与 `data/projects/` 相邻。

「Where to put work」（第 29–39 行）有 `library/`、`skills/`、`spec/`，没有 recipe 行 → agent 会把方法卡放进 `library/` 或 `skills/lightweaver-film/`，正是 P5 禁止的。

Family boundaries（第 45–52 行）已点名 CineWeaver / LightTTS / LightUI。本 PR **不要**再往根 AGENTS 加 NarratoAI / 其它兄弟仓内部模块名。LLM 禁令写在 `weaver/AGENTS.md`，不扩散成家族表。

### 仓内其它现状（本 PR 只读、不改）

- 仓库根 **尚无** `recipes/`。合入本 PR 时该目录必须已在（PR2）。
- `skills/lightweaver-film/SKILL.md` 仍是动词表，未教存放图（PR1 活）。
- 根 `README.md` 第一用法仍是 `make studio`（PR1 产品文案）。不要在本 PR 顺手改。

---

## 逐文件补丁意图

合入顺序建议：先确认 `recipes/study-explainer/index.md` 与 `weaver/src/recipes.ts`、`weaver/src/project-paths.ts`、`recipeRoot` 在盘上，再改这四个 md。四个文件可同一 commit。

路径示例一律用仓库相对路径或 `$LIGHTUI_ROOT/studies/<slug>/…`。禁止 `/tmp/…`、禁止本机绝对路径当范例。

---

### 1. `docs/design-study-explainer.md`

#### 1a. 保留第 12 行指针（不要删、不要加长成摘要）

第 12 行维持原句。不要在指针里复述 P0–P14、不要链 `recipes/` 六张卡。

#### 1b. 在第 12 行之后、第 14 行 `---` 之前插入

插入（第 12 行空行后）：

```markdown
两份不要合并成一篇。改任务核（D1–D13、CRUD、形状/媒体、`isRenderable`）先改**本文**；改存放图、skill 模式/阶段、recipe、LLM 归属、Studio 产品故事，改 [`design-placement-contract.md`](./design-placement-contract.md)。核保留，当 agent 调用的确定性 job API。

| 主题 | 本文（任务核） | `design-placement-contract.md` |
| --- | --- | --- |
| `task` / TaskModule / 循环禁令 | 拍板（D1–D2） | 继承 |
| 形状 vs 媒体 / `hero` / `isRenderable` | 拍板（D3、D4、D10） | QA 阶段去 **调用** |
| 一种 kind 一场、id=slug、lab 纯文本 | 拍板（D13） | recipe `taxonomy-parade` 落实 |
| CLI / HTTP / Studio CRUD | 拍板且已实现 | 降为 job API |
| 存放图（理念 / 资产 / 产物） | 只写了项目 layout 与 publish 边界 | **主场（P0）** |
| Skill 作为产品、模式、阶段 | 未覆盖（旧 PR2 动词表 / 旧 PR7 叙事闭环） | 服务于存放图 |
| Recipe / template / composition 分层 | 未覆盖 | 方法资产，`recipes/study-explainer/` |
| LLM 住哪里 | 未覆盖 | P6（只住 agent 进程；`weaver/` 无模型） |
| Studio 产品故事 | 「人与 agent 同一面」偏工作台 | 改为复核面 |
```

约束：

- 列顺序是「本文 | 另一篇」，方便站在这篇读。不要把 placement 的 mermaid、6 张卡、阶段 0–7 粘进来。
- 表中「旧 PR2 / 旧 PR7」指 **本文自己 PR Plan** 里的 skill 条目，避免和存放契约 PR2（recipe list）撞名。不要另造第三套编号。
- **不要**改第 16 行起 Overview，不要改 D1–D13，不要改本文 PR Plan 标题。

#### 1c. References：替换第 934 行

现网：

```
- LightWeaver：`AGENTS.md`、`README.md`、`docs/conventions.md`、`.gitignore`
```

改为：

```
- LightWeaver：`AGENTS.md`、`README.md`、`docs/conventions.md`、`docs/design-placement-contract.md`（产品形状；不要与本文合并）、`.gitignore`
```

核 References（第 935 行）可补 `` `project-paths.ts`、`recipes.ts` ``——仅当 PR1/PR2 已落地。不要写尚未存在的文件名。

---

### 2. `docs/conventions.md`

锚：现网第 16 行 `User：`data/projects/<id>/`。` 与第 18 行 `## study-explainer` 之间。若 PR2 已在附近加了「存放图」小节，删掉那一节再插入下面整块。

#### 2a. 第 16 行之后插入（三层短表 + brief + 文件名 + recipe）

```markdown

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
```

短表不要扩成 placement 里那张「对象表」。`hybrid` / `PathEntry` 类型留给 `project-paths` 与设计文档。

#### 2b. 替换第 30 行注释

现网：

```
# 放入 assets/stills/{zh,en}/shot.png
```

改为：

```
# 按 assets.json 的 files.<locale> 写入（新片约定 shot.png；不要从 id 猜）
```

#### 2c. 替换第 45 行（手截配方第 5 步）

现网：

```
5. 写入 `assets/stills/{zh,en}/<kind>.png`（文件名 = kind id，不用 `comp-01.png`）。
```

改为：

```
5. 写入该项目 `assets.json` 已登记的 `files.<locale>`。新片约定 `assets/stills/{zh,en}/<kind>.png`（文件名 = kind id，不要新造 `comp-01.png`）。intent / dropdown 的历史名（`desktop-full.png`、`select-open.png`、`comp-02.png`、`date-cal.png` 等）以 `assets.json` 为准，不要改名。
```

第 46 行「LightUI `references/` **只收 mp4**」保留。

#### 2d. 不要改的段落

- 第 27–34 行命令序列（create → scene add → validate → tts → render）保留。本 PR 不把 `recipe apply` 写进 conventions（那是 PR3）。
- 第 36 行 `isRenderable` / 无参 skip 保留。
- 不要在 conventions 里点名 CineWeaver / NarratoAI / LightTTS。

---

### 3. `weaver/AGENTS.md`

#### 3a. 替换整个 Layout 围栏（现网第 7–21 行）

现网：

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

改为（对齐现网空格风格，文件名列加宽即可）：

```
src/schema.ts          Film / Asset / Scene / task types
src/tasks/             TaskModule（只实现 study-explainer）
src/scenes.ts          add/rm/move/patch/card/voice
src/paths.ts           workspace roots（libraryRoot 与 recipeRoot 并列）
src/project.ts         list / load / save / create
src/project-paths.ts   project show 的 paths（禁止并进 project.ts）
src/recipes.ts         recipe list/show（apply 在 PR3）
src/assets.ts          resolve refs, add assets
src/validate.ts        catalog + isRenderable
src/timeline.ts        duration estimate
src/sync.ts            Remotion public links + catalog
src/tts.ts             VoxCPM2 job
src/render.ts          Remotion + publish
src/cli.ts             JSON/human CLI
```

`recipes.ts` 注释：PR3 未合时写 `list/show`；PR3 已合可写成 `list/show/apply`。不要在 AGENTS 里贴 `LIGHTWEAVER_RECIPES=/tmp/…`。

#### 3b. Rules：在「Do not import `products/*`。」（现网第 27 行）之后插入三条

```
- No LLM in weaver. No model client, no `produce` / `plan`, no narration
  generator inside this package. Agent drafts `lines` in its own process;
  weaver only writes files and runs jobs (`tts.py`, Remotion, `capture.mjs`).
- `recipeRoot` lives in `paths.ts` next to `libraryRoot`. Product default is
  the repo-root `recipes/` directory. Never `library/recipes/` or
  `skills/**/recipes/`. `LIGHTWEAVER_RECIPES` is test-fixture only — do not
  put scratch paths in this file.
- `project.ts` must not import `project-paths.ts`, `assets.ts`, or
  `validate.ts`. `project-paths.ts` must not import `project.ts` or
  `validate.ts` (`assets.ts` already imports `saveAssets` from `project.ts`;
  a reverse import is a cycle). Put `projectPaths` only in
  `project-paths.ts`.
```

然后把现网第 28–29 行用户/first-party/`library/` 那句扩半句（仍是同一条 bullet）：

```
- User projects live in `data/projects/`. First-party LightUI films live in
  `products/study-films/projects/`. Shared voices/elements live in `library/`.
  Method cards live in `recipes/study-explainer/`.
```

不要在 `weaver/AGENTS.md` 点名兄弟仓的内部模块（例如某仓的 `script_service`）。禁令用行为描述（no model client / no produce）即可。P6 的对照点名留在 `docs/design-placement-contract.md`，本 PR 不复制。

---

### 4. 根 `AGENTS.md`

#### 4a. Layout 树：在 `library/` 行（现网第 16 行）之后插入一行

现网：

```
weaver/                         schema, projects, assets, CLI, jobs
library/                        shared voices / elements / references
data/projects/                  user projects (gitignored)
```

改为：

```
weaver/                         schema, projects, assets, CLI, jobs
library/                        shared voices / elements / references
recipes/                        method cards（study-explainer；怎么结合，不是媒体）
data/projects/                  user projects (gitignored)
```

`spec/` 行（现网第 22 行）不动。不要在这棵树里加 `docs/`（未要求）。不要加 `recipes/drama-plot/`。

#### 4b. 「Where to put work」表：在 `library/` 行（现网第 33 行）之后插入一行

现网：

```
| Shared voice / element / reference | `library/` |
| New first-party LightUI film | `products/study-films/projects/<id>/` |
```

改为：

```
| Shared voice / element / reference | `library/` |
| Recipe / 方法卡 | `recipes/study-explainer/` |
| New first-party LightUI film | `products/study-films/projects/<id>/` |
```

设计 PR5 正文只点了 layout 行；表行是同一文件的路由表，缺了 agent 仍会把卡写进 `library/`。只加这一行，不要改 Skills / Family / Validation。

#### 4c. 现有禁令旁不要再写 LightUI 仓名清单

第 41–43 行已有 CineWeaver / LightAsset。可在第 43 行后加半句（仍属「不要把 library 做成 DAM」同一段，可选）：

```
Do not put recipe markdown under `library/` or `skills/`.
```

若觉得第 43 行已经够，可把这半句省掉——layout + 表行已足够。**不要**在根 AGENTS 新增「也不要折 LLM 编剧服务」长句（写在 `weaver/AGENTS.md`）。

---

### 明确不改

| 路径 | 原因 |
| --- | --- |
| `docs/design-placement-contract.md` | 源设计；PR5 是指针落地，不是再改设计 |
| `README.md` / `skills/**` | PR1–PR3 |
| `products/studio/**`、`products/study-films/**` | 非文档 PR；且本 PR 不碰 LightUI 发布面 |
| LightUI 仓内任何文件 | 「公开 README / lab 不出现兄弟私有仓名」靠 **不改那边** 保证 |
| `spec/README.md` | 已登记本文件 |

---

## 验收

文档 diff 必须能对上以下清单。`make typecheck` 与 `make test` 仍绿（本 PR 无代码）。

1. **只改上述四个文件**（可含本 spec 自己若尚未入仓）。`git diff --name-only` 不得出现 `.ts`、`SKILL.md`、LightUI 路径、`/tmp`。
2. `docs/design-study-explainer.md` 第 12 行指针仍在；其后有分工表；有「两份不要合并」；本文 PR Plan 的「PR5 — nav / sidebar 骨架」标题未被改写成 docs PR。
3. `docs/conventions.md` 同时具备、且只有 **一张** 三层表：理念 / 资产 / 产物；用户片 `brief.md` + weaver 不 parse；静帧「以 `assets.json` 为准」+ intent `still.problem` → `desktop-full.png` 反例；`recipes/study-explainer/`；手截第 5 步不再暗示「一律改成 kind.png」。
4. `weaver/AGENTS.md` layout 含 `project-paths.ts` 与 `recipes.ts`；`paths.ts` 行点名 `libraryRoot` **与** `recipeRoot`；Rules 含 No LLM、`recipeRoot` 默认仓库根 `recipes/`、`project.ts` 不得 import `project-paths.ts`。
5. 根 `AGENTS.md` layout 在 `library/` 与 `data/projects/` 之间有 `recipes/`；`spec/` 仍在；Where to put work 有 `recipes/study-explainer/`。
6. 四个文件的新增范例路径都是仓库相对或 `$LIGHTUI_ROOT/studies/<slug>/…`。`rg '/tmp/|/var/folders/|scratch' docs/conventions.md docs/design-study-explainer.md AGENTS.md weaver/AGENTS.md` 无新命中。
7. 本 PR 的 diff 不出现兄弟私有仓的内部模块路径，也不出现「编辑 LightUI README」之类句子。
8. 合入时 `recipes/study-explainer/` 已存在，因此 AGENTS / conventions 写该路径不是空指针。若目录不在，本 PR **不得合**（依赖 PR2）。

---

## 陷阱

1. **两套「PR5」。** `design-study-explainer.md` 的 PR5 = nav/sidebar **骨架**（核，已在盘上）。`design-placement-contract.md` 的 PR5 = **本文档**。不要改核文档的 PR Plan 标题来「对齐编号」，不要在分工表外解释两套 DAG。
2. **合并冲动。** 不要把存放 mermaid、6 张 recipe、阶段 0–7、P6 大图拷进 `design-study-explainer.md`。指针 + 分工表就够。Overview 里过时的「Studio 工作台」叙事留给核文档自己的历史；产品故事改写是 PR1 README / PR4 Studio，不是本 PR。
3. **PR2 抢写 conventions。** 设计 PR2 也提过「存放图短表」。本 PR 是完整业主：发现已有短表就 **替换**，禁止两节并存、禁止一张表只写理念/资产/产物却漏 `brief.md` / `assets.json` 文件名 / `recipes/study-explainer/`。
4. **在 PR2 前写 `recipes/`。** 根 AGENTS 点名一个还不存在的顶层目录，agent 会去建空 `recipes/drama-plot/` 或把 stub 塞进 `library/`。先合 PR2。
5. **循环写反。** 禁令是 `project.ts` **不要** import `project-paths.ts`（以及 `assets.ts` / `validate.ts`）。`project-paths.ts` 可以 import `assets.ts` 的 `resolveAssetFile`。不要写成「谁都不要碰 assets」。不要为了「省一个文件」把 `projectPaths` 挪进 `project.ts`——那正是本 PR 要写进 AGENTS 的禁令。
6. **scratch 路径永久化。** `LIGHTWEAVER_RECIPES` 只出现在「测试夹具」五个字里。不要写 `export LIGHTWEAVER_RECIPES=/tmp/lw-recipes`。不要用本机 ` /Users/…` 当 `paths.recipes` 范例。
7. **静帧「统一成 `<kind>.png`」。** 手截配方第 5 步若只写「不要用 `comp-01.png`」，有人会去改 dropdown / intent 的 `assets.json`。必须同时写历史名保留。
8. **LightUI 泄漏。** 本 PR 不改 LightUI。不要在 conventions 里加「家族对照表」点名 CineWeaver / LightTTS。根 AGENTS 已有的家族表维持原样即可。
9. **范围膨胀。** 看到 README 仍写 `make studio` 或 film skill 仍是动词表，不要在本 PR 顺手改。那是 PR1。不要在 conventions 里写 `recipe apply`（PR3）。
10. **空 recipe / 第二任务。** 写 `recipes/study-explainer/` 时不要顺带建 `recipes/drama-plot/` 或在 AGENTS 预留该行。

---

### Critical Files for Implementation

- [`docs/design-study-explainer.md`](docs/design-study-explainer.md) — 指针已在第 12 行；本 PR 只在其后插入分工表，禁止两篇合并
- [`docs/conventions.md`](docs/conventions.md) — 插入三层短表、`brief.md`、`assets.json` 文件名规则、`recipes/study-explainer/`
- [`weaver/AGENTS.md`](weaver/AGENTS.md) — layout 补 `project-paths.ts` / `recipes.ts`；Rules 写死无 LLM、`recipeRoot` 并列、循环禁令
- [`AGENTS.md`](AGENTS.md) — layout 在 `library/` 下补 `recipes/`；Where to put work 加方法卡一行
- [`docs/design-placement-contract.md`](docs/design-placement-contract.md) — 只读源（PR5 节 + 分工表原文）；本 PR 不改它
