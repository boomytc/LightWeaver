# 02 · PR2 recipe 发现

对应设计：[`docs/design-placement-contract.md`](../docs/design-placement-contract.md) · P5 / P7 / P11 · Recipe 盘上格式 · R1–R6 · PR2。  
标题（合入）：`feat(weaver): discover study-explainer recipes`  
依赖：PR1（`weaver/src/paths.ts` 的 `recipeRoot()`、`LIGHTWEAVER_RECIPES`、`projectPaths().recipes`）。本 PR **不**重做 `projectPaths`，只钉死 `paths.recipes` 公式并消费 `recipeRoot()`。

## 范围 / 非目标

**做：**

- 新模块 `weaver/src/recipes.ts`：`Recipe` 类型、`listRecipes` / `loadRecipe` / `showRecipe`。
- CLI **只**加 `weaver recipe list|show`（含 `--json`、`--task`、用法、未知子命令）。
- 仓库根提交 6 张真卡 + `recipes/study-explainer/index.md`。
- 单测 `weaver/src/recipes.test.ts`（见「测试」）。
- `docs/conventions.md` 加一张短存放图表。
- Skill **只替换三处**：`SKILL.md` 选卡行、`references/pipeline.md` 阶段 1、`references/modes.md`「对不上结构」行。
- `weaver/src/index.ts` 导出 `listRecipes`、`loadRecipe`、`showRecipe`（`recipeRoot` 已由 PR1 从 `paths.ts` 再导出）。

**不做（本 PR 出现即退回）：**

- `applyRecipe`、`weaver recipe apply`、help 文案里的 `apply`、空 `apply` stub。
- `film.recipeId`、改 `FilmDoc`、改四则 first-party `film.json`。
- `recipes/drama-plot/`、`wip-*.md`、第 7 张卡、shotcraft 镜头名改名进口、152 张空卡。
- `library/recipes/`、`skills/**/recipes/`。
- `weaver produce` / `weaver plan` / MCP / 核内 LLM。
- `recipes.ts` import `validate.ts` 或 `products/*`。
- 扫盘递归、`listRecipes` 读 LightUI、`console.warn`（含对 `index.md`）。
- 重写 `references/pipeline.md` 阶段 2–7；阶段 2 仍是 `scene add` / `scene rm`。
- PR5 的 `AGENTS.md` layout 行、`weaver/AGENTS.md` 指针（等目录落地后再写）。

## 现网锚点（四则片子结构）

六张卡全部从仓内 first-party `film.json` 抽出，不是臆造。实施时对照这些事实写 frontmatter / 正文实证段，**不要改片子本身**。

| 片子 | 路径 | 结构配方 | still 场（id / role / still ref） | 其它 |
| --- | --- | --- | --- | --- |
| `intent-cascade` | `products/study-films/projects/intent-cascade/film.json` | **problem-then-rule** | `problem` / problem / `asset:still.problem`（盘上 `desktop-full.png`，无 `fit`）；`diagonal` / rule / `asset:still.diagonal` `fit:contain`（`diagonal-to-cancel.png`）；`vertical` / contrast / `asset:still.vertical` `fit:contain`（`vertical-to-project.png`）；`third` / rule / `asset:still.third` `fit:contain`（`third-level.png`） | `title` + `close`；`capture.kind=lightui-lab`；output `cursor-movement.mp4` / `.en.mp4`；titleCard.tags 是「安全三角 / 斜向保护 / 纵向即时」，**不是**默认「名称/场景/规则」；**无** `kinds.ts` |
| `dropdown-taxonomy` | `…/dropdown-taxonomy/film.json` | **taxonomy-parade** | 7 场 contrast + `fit:contain`：`select` `multi` `grouped` `cascader` `split` `mega` `date`，`still=asset:still.<id>` | 历史文件名以 `assets.json` 为准（`select-open.png`、`comp-02`…`comp-06.png`、`date-cal.png`），**新片不要学这些文件名**；易混对 `grouped` vs `cascader`；`lightui-lab`；output `source-tutorial.mp4` |
| `nav-taxonomy` | `…/nav-taxonomy/film.json` | **taxonomy-parade** | 9 场 contrast + `fit:contain`：`floating` `sidebar` `breadcrumb` `dropdown` `mega` `drawer` `overlay` `scrollspy` `shrink`，`still=asset:still.<kind>`，盘上约定 `<kind>.png` | `capture.kind=manual`；形状绿、`isRenderable===false`；易混对 `drawer`/`overlay`、`dropdown`/`mega`、`shrink`/`floating`；output `source-tutorial.mp4` |
| `sidebar-taxonomy` | `…/sidebar-taxonomy/film.json` | **taxonomy-parade** | 5 场 contrast + `fit:contain`：`floating` `wheel` `multilevel` `collapsible` `offcanvas` | `manual`；不可渲；易混对 `collapsible`/`offcanvas`、`multilevel`/`wheel`；output `source-tutorial.mp4` |

共同形状（`study-explainer` TaskModule 已钉）：`title` 在 `[0]`，`close` 在末，中间只许 `kind=still`。种子 `createFilm` 带 `hero`；first-party 入库前已删。`closeCard.headline` 四则都是「说清楚」/「Say it this way」。taxonomy 三则 titleCard.tags = `名称, 场景, 规则` / `Name, Scene, Rules`。

关系（不要画成第五个 composition）：

```
TaskModule study-explainer
  ├─ problem-then-rule  → intent-cascade
  ├─ taxonomy-parade    → dropdown / nav / sidebar
  └─ kind-still / contrast-pair / study-title / say-it-this-way  （单场写法，挂在上两张 film 卡上）
```

## recipes.ts API

新文件 `weaver/src/recipes.ts`。可 import：`fs` / `path`、`./paths.ts`（`recipeRoot`、`weaverRoot`）、`./schema.ts`（`isImplementedTask`、`isStudyRole`、`type TaskId`、`type StudyRole`）、`./tasks/registry.ts`（`tryGetTask` / `listTasks`）。**禁止** import `validate.ts`、`project.ts`、`products/*`。

`recipeRoot()` 已在 PR1：

```ts
export function recipeRoot(root = weaverRoot()): string {
  if (process.env.LIGHTWEAVER_RECIPES) return path.resolve(process.env.LIGHTWEAVER_RECIPES);
  return path.join(root, "recipes");
}
```

本 PR 不复制这段。产品 DEFAULT 是仓库根 `recipes/`。`LIGHTWEAVER_RECIPES` 只给测试夹具。

### 类型

```ts
export type RecipeLevel = "film" | "scene";

export type RecipeSceneStub = {
  id: string;
  kind: string;          // 必须 ∈ getTask(task).sceneKinds
  role?: StudyRole;
  still?: string;
  fit?: "cover" | "contain";
};

export type Recipe = {
  id: string;            // kebab-case，=== 文件名去 .md
  task: TaskId;          // 必须 isImplementedTask（今日只有 study-explainer）
  level: RecipeLevel;
  when: string;
  canon?: string[];
  requires_kinds?: boolean;
  default_scenes?: RecipeSceneStub[];
  path: string;          // 绝对路径
  body: string;          // frontmatter 之后的 markdown，去掉开头空行
};

export type RecipeSummary = Omit<Recipe, "body" | "default_scenes">;
```

未知 frontmatter 键 **忽略**（不要 throw）。`canon` / `requires_kinds` / `default_scenes` 缺省则字段不出现（`undefined`），list JSON `JSON.stringify` 会省略它们。

### 合法 frontmatter

| 字段 | 必需 | 约束 |
| --- | --- | --- |
| `id` | 是 | `^[a-z0-9]+(?:-[a-z0-9]+)*$`，且 === basename 去 `.md` |
| `task` | 是 | `isImplementedTask`；且 === 父目录名 |
| `level` | 是 | `film` \| `scene` |
| `when` | 是 | 非空 string（`when: \|` 多行拼成一段，保留内部换行，trim 首尾） |
| `canon` | 否 | `string[]`（片子 id；PR2 不核验片子是否在盘上） |
| `requires_kinds` | 否 | boolean |
| `default_scenes` | 否 | 见下 |

`default_scenes[]`：`id` / `kind` 必填；`kind` ∈ `tryGetTask(task).sceneKinds`（study-explainer = `title\|still\|close`）；若有 `role` 则 `isStudyRole`；若有 `fit` 则 `cover\|contain`。任一项不满足 → **整张卡非法，静默跳过**（不要部分收录）。

位置合同：活卡只活在 `recipeRoot()/<task>/<id>.md`。`task`、父目录、`id`、文件名四者不一致 → 跳过。

### 解析

`splitFrontmatter(text)`：文件必须以 `---` 起行，第二个 `---` 结束；否则非法。

YAML **窄解析，写在本文件内**。**不要**给 `@lightweaver/weaver` 加 `yaml` / `js-yaml`。只认：

- `key: scalar`（裸词、`true`/`false`、单引号/双引号）
- `key: \|` + 后续缩进行
- `key:` + `- item` 字符串列表
- `key:` + `- id: x` 对象列表（同一对象的续行比 `-` 更深）

不要实现锚点、tag、嵌套映射、`>` folded。够 R1 的 `default_scenes` 与 R2 的 `canon` 即可。

### 发现

```ts
export function listRecipes(root = weaverRoot(), task?: string): Recipe[]
export function loadRecipe(id: string, root = weaverRoot()): Recipe
export function showRecipe(id: string, root = weaverRoot()): Recipe  // === loadRecipe，禁止第二套解析
```

`listRecipes`：

1. 解析根：`const base = recipeRoot(root)`（所以 `LIGHTWEAVER_RECIPES` 生效）。
2. 任务集合：
   - 传入 `task` 且 `isImplementedTask(task)` → 只扫这一档；
   - 传入 `task` 但不是已实现 TaskId（`drama-plot`、`foobar`、空串）→ **返回 `[]`，不 throw**；
   - 未传 `task` → `listTasks().map(t => t.id)`（今日就 `study-explainer`）。
3. 对每个 task 读 `join(base, task)`。目录不存在 → 当空。`readdir` **只这一层 `*.md`**，不递归、不跟 symlink 目录往下走。
4. **静默跳过**（零日志，禁止 `console.warn` / `console.error`）：
   - 文件名 `index.md`（大小写敏感；只跳这个名字）；
   - 打不开 / 无合法 `---` 围栏；
   - 缺 `id` / `task` / `level` / `when`；
   - `id` 非 kebab 或 `id !==` 文件名去 `.md`；
   - `task` 非已实现 TaskId，或 `task !==` 父目录；
   - `level` 不是 `film`/`scene`；
   - `default_scenes` 非法。
5. 稳定排序：`(a.task, a.id)` 字典序。
6. 不读 LightUI、不 stat 片子媒体。≤ 20 个 md，应 < 50ms。

`loadRecipe` / `showRecipe`：

- `id` 必须整段匹配 kebab；含 `/`、`\`、`.` 前缀、`..` → throw `非法 recipe id：${id}`（防穿越；不要先 `path.join`）。
- 在「全部已实现 task 目录」里找 `<id>.md`，用与 list 相同的合法性。找不到或被跳过 → throw `找不到 recipe：${id}`。
- 返回完整 `Recipe`（含 `body`、`default_scenes`）。

`list` 给 CLI 时投影成 `RecipeSummary`（去掉 `body`、`default_scenes`）。全文只走 `show`。

## 六张卡（frontmatter + 骨架要点）

全部落在 `recipes/study-explainer/`。每张 ~1–2KB。正文给人/agent 读；机器只吃 frontmatter。

**正文禁令：** 不要写 `weaver recipe apply`（该动词 PR3 才进 CLI，写了 agent 会去调不存在的子命令）。展开规则用「骨架」+ 现网 `scene add` / `scene rm --id hero` 表述。`default_scenes` / `requires_kinds` 留在 frontmatter，PR3 再接线。

**`recipes/study-explainer/index.md`** — 恰好六行，`id — when`（用中文破折号 `—`），顺序 R1–R6。不要 frontmatter、不要链接六份全文。

```
problem-then-rule — study 讲一条会坏的交互规则，而不是一张模型对照表。
taxonomy-parade — study 以 kinds.ts 列出互斥模型，idea.md 用名称/场景/规则收束，close 要点破易混对。
kind-still — 往 taxonomy 片加/绑一场。
contrast-pair — 两场相邻 still 是 idea.md 点名的易混对，需要在口播里互相指认。
study-title — 任意 study-explainer 片头。
say-it-this-way — 任意 study-explainer 片尾。
```

### R1 · `problem-then-rule.md`（film）

```yaml
---
id: problem-then-rule
task: study-explainer
level: film
when: |
  study 讲一条会坏的交互规则，而不是一张模型对照表。
canon:
  - intent-cascade
default_scenes:
  - id: problem
    kind: still
    role: problem
    still: asset:still.problem
  - id: diagonal
    kind: still
    role: rule
    still: asset:still.diagonal
    fit: contain
  - id: vertical
    kind: still
    role: contrast
    still: asset:still.vertical
    fit: contain
  - id: third
    kind: still
    role: rule
    still: asset:still.third
    fit: contain
---
```

正文骨架：

1. `# 问题然后规则`
2. **何时** — 复述 `when`。点明 intent-cascade **没有** `kinds.ts`，只读 `idea.md` / `idea.en.md` / `study.json`。
3. **骨架** — `title`（R5）→ `problem`（role=problem）→ 一条或多条 rule still → 至少一条 contrast still → `close`（R6）。v1 写死四场 still，与 canon 相同；新片若只要三场，**apply 之后**（PR3）或本 PR 用 `scene rm`，不要让发现层接受自由 id 而丢掉「问题场」。
4. **旁白义务** — problem 说会坏什么；rule 说走廊/规则；contrast 说朴素 delay 为什么更差（对 idea.md「和加 delay 的差别」）。
5. **实证** — 列 `intent-cascade` 四场 id/role/still，并写历史文件名（`desktop-full.png` 等）「只属于这部老片，新片按 `assets.json`」。
6. **本 PR 展开** — `project create` 后 `scene add` 四场（id/role/still/fit 与 `default_scenes` 一致），`scene rm --id hero`。不要发明 `beat`/`clip`。

### R2 · `taxonomy-parade.md`（film）

```yaml
---
id: taxonomy-parade
task: study-explainer
level: film
when: |
  study 以 kinds.ts 列出互斥模型，idea.md 用「名称/场景/规则」
  收束，close 要点破易混对。
canon:
  - dropdown-taxonomy
  - nav-taxonomy
  - sidebar-taxonomy
requires_kinds: true
---
```

正文骨架：

1. `# 对照表阅兵`
2. **何时** — `kinds.ts` 列出互斥模型；close 点破易混对。
3. **骨架**
   1. `title` — R5
   2. 每个 kind 一场 still — R3（`role: contrast`）
   3. `close` — R6，易混对来自 idea.md
4. 硬规则：**一种 LightUI kind 一场 still**。禁止把 7/9/5 个模型压进一场。scene id = kind id，来自 LightUI `studies/<slug>/src/lib/kinds.ts` 的 `KindId`；weaver **不** parse TS，本 PR 由 agent 读完再 `scene add --id <kind>`。
5. **旁白义务** — 每场 still ≈ `oneLiner` + 一条 rule；close 用 idea.md「最容易混的 N 对」。中间场不要过早收束。
6. **实证** — 三则 canon 的 kind 列表（上表）。dropdown 历史 `comp-0N.png` 不要复制；新片 / nav / sidebar 用 `<kind>.png`。
7. **本 PR 展开** — 对每个 kind：`scene add --project <id> --id <kind> --kind still --still asset:still.<kind> --fit contain --role contrast`，最后 `scene rm --id hero`。

### R3 · `kind-still.md`（scene）

```yaml
---
id: kind-still
task: study-explainer
level: scene
when: |
  往 taxonomy 片加/绑一场。
---
```

正文：`id = kind`；`still = asset:still.<kind>`；`fit: contain`；`role: contrast`；文件名 `<kind>.png`（不要 `comp-01.png`）。不可当整片骨架。示例：

```bash
npx weaver scene add --project nav-taxonomy --id floating --kind still \
  --still asset:still.floating --fit contain --role contrast
```

### R4 · `contrast-pair.md`（scene）

```yaml
---
id: contrast-pair
task: study-explainer
level: scene
when: |
  两场相邻 still 是 idea.md 点名的易混对，需要在口播里互相指认。
---
```

正文：写作约定——后一场点出「不是上一场那个模型」；close 再汇总，避免只在 close 才第一次出现易混对。实证对（必须写全，与四则片子一致）：

| 片子 | 对 |
| --- | --- |
| dropdown | `grouped` vs `cascader` |
| nav | `drawer` vs `overlay`；`dropdown` vs `mega`；`shrink` vs `floating` |
| sidebar | `collapsible` vs `offcanvas`；`multilevel` vs `wheel` |
| intent | `diagonal`（rule）vs `vertical`（contrast）——规则 vs 朴素 |

不可当整片骨架。不发明新 scene kind。

### R5 · `study-title.md`（scene）

```yaml
---
id: study-title
task: study-explainer
level: scene
when: |
  任意 study-explainer 片头。
---
```

正文：一场 `kind=title`，种子已有，**禁止** `scene add --kind title`。`titleCard.kicker` = `LightUI  ·  Study`（first-party）或 `LightWeaver  ·  Film`（user）。tags 默认 `名称, 场景, 规则` / `Name, Scene, Rules`（`createFilm` 已写；intent-cascade 用了另一套 tags，那是片子覆盖，不是默认）。headline / lede 来自 `study.json` 的 `title` / `summary`（LightUI 不在则 `--title`）。旁白：标题句 + 一句话问题，不要在 title 场开始阅兵。

### R6 · `say-it-this-way.md`（scene）

```yaml
---
id: say-it-this-way
task: study-explainer
level: scene
when: |
  任意 study-explainer 片尾。
---
```

正文：`kind=close` 钉在末尾。`closeCard.headline`：`说清楚` / `Say it this way`（`createFilm` 已写）。lede = 易混对 + 「先名称场景规则，再谈外观」。实证：四则 `close` 都是这个收束，不是 CTA、不是品牌秀。禁止 `scene add --kind close`。

## CLI

只改 `weaver/src/cli.ts` 的 command switch。`--task` / `--json` 已在 `parseArgs` 里。

```
weaver recipe list [--task study-explainer] [--json]
weaver recipe show <id> [--json]
```

**禁止**解析或提示 `apply`。

| 输入 | 行为 |
| --- | --- |
| `recipe` / `recipe list` | `listRecipes(root, str(values,"task"))`，打印信封 |
| `recipe list --task study-explainer` | 只扫该 task |
| `recipe list --task drama-plot`（或任意未实现 task） | `{ ok: true, recipes: [] }`，exit 0 |
| `recipe show <id>` | 无 `--json`：`print` 文件原文（`readFileSync(recipe.path)`），方便人/agent 读卡 |
| `recipe show <id> --json` | 信封，含 `body: string` |
| `recipe show` 无 id | `fail("用法: weaver recipe show <id>")` |
| `recipe apply` / `recipe foo` / 其它子命令 | `fail("用法: weaver recipe list\|show")` — **不要**写「PR3」或 `apply` |
| `show` 找不到 / 非法 id | `fail` 中文（`找不到 recipe：…` / `非法 recipe id：…`） |

`list` 信封（有无 `--json` 都走 `print(object)` → pretty JSON，与 `project list` 一致）：

```json
{
  "ok": true,
  "recipes": [
    {
      "id": "taxonomy-parade",
      "task": "study-explainer",
      "level": "film",
      "when": "study 以 kinds.ts 列出互斥模型…",
      "canon": ["dropdown-taxonomy", "nav-taxonomy", "sidebar-taxonomy"],
      "requires_kinds": true,
      "path": "/…/recipes/study-explainer/taxonomy-parade.md"
    }
  ]
}
```

`when` 取 frontmatter 原文（`|` 块可含换行）。**不要**塞 `body`、不要塞 `default_scenes`。

`show --json`：

```json
{
  "ok": true,
  "id": "taxonomy-parade",
  "task": "study-explainer",
  "level": "film",
  "when": "…",
  "canon": ["dropdown-taxonomy", "nav-taxonomy", "sidebar-taxonomy"],
  "requires_kinds": true,
  "path": "/…/recipes/study-explainer/taxonomy-parade.md",
  "body": "# 对照表阅兵\n\n…"
}
```

`problem-then-rule` 的 show JSON **另外**带 `default_scenes` 数组（与类型一致）。scene 卡没有的键不要输出 `null`。

顶层未知命令帮助补一行（插在 `weaver project …` 附近）：

```
  weaver recipe list|show
```

不要加 `weaver recipe apply`。`fail()` 已有的 `--json` → `{ ok: false, error }` 保持不变。

## Skill 替换行（仅 PR2）

依赖 PR1 已写入的 `skills/lightweaver-film/SKILL.md` 与 `references/{pipeline,modes,qa}.md`。本 PR **三处替换**，其余原则 / 阶段 0 / 阶段 2–7 / qa / 路由器 **原样留下**。禁止在本 PR 出现字面量 `recipe apply`、`applyRecipe`、`weaver recipe apply`。

若合入时 PR1 措辞与下表不完全一致：按「旧语义 → 新语义」搜替换，不要整文件重写。

### 1. `skills/lightweaver-film/SKILL.md` · 「何时读哪个文件」选卡行

**删（PR1）：** 对照 first-party `film.json`（intent=problem-then-rule，dropdown/nav/sidebar=taxonomy-parade）。不要链 `recipes/study-explainer/index.md`。

**改成：**

| 时机 | 读 |
| --- | --- |
| 选卡 | `npx weaver recipe list --task study-explainer`；一眼看 `recipes/study-explainer/index.md`（六行 `id — when`）。对上后再 `npx weaver recipe show <id>` 读全文。不要把六张卡贴进本 skill |

同文件「存放图 / 方法」行：PR1 的「对照 first-party `film.json` 抄结构」改成：

- 方法：`recipes/study-explainer/`（`weaver recipe list` / `show`；index 六行）

动词表 **追加**（不要删 `scene add`/`rm`）：

```bash
npx weaver recipe list [--task study-explainer]
npx weaver recipe show <id>
```

### 2. `references/pipeline.md` · 只改阶段 1

**删（PR1 阶段 1）：** 对照 first-party `film.json`：intent-cascade → problem-then-rule；dropdown / nav / sidebar → taxonomy-parade。

**改成：**

| 阶段 | 名称 | weaver 动词 | 产出 |
| --- | --- | --- | --- |
| **1** | Recipe | `weaver recipe list [--task study-explainer]`；读 `recipes/study-explainer/index.md`；`weaver recipe show <id>` | 选定结构（问题-规则 或 对照表阅兵） |

阶段 2 **保持 PR1 原文**：`project create` + `scene add` / `scene rm --id hero`。不要改成 apply，不要加「日后 apply」。

若 pipeline 里有「结构怎么选」分期表，把 PR2 行写成设计原文：

| | 阶段 1 抽卡 | 阶段 2 展开骨架 |
| --- | --- | --- |
| **PR2** | `weaver recipe list` / `show`；读 `recipes/study-explainer/index.md` | 仍 `scene add` / `rm`（读卡手写骨架）。**还没有** `recipe apply` |

（上表「还没有 recipe apply」是设计分期说明，允许留在 pipeline 的分期对照里；**动词列与阶段 2 单元格仍禁止把 apply 写成可执行命令**。）若觉得分期表会诱使 agent 去敲 apply：删掉「还没有」那一句，只写「仍 `scene add` / `rm`」。推荐后者。

### 3. `references/modes.md` · 只改「对不上结构」行

**删（PR1）：** 四则 first-party `film.json` 对不上用户要的形状。

**改成：**

| 条件 | 问什么 |
| --- | --- |
| `recipe list` 没有 `when` 能对上的 **film** 卡 | 是新形状（先 `co-create` 定结构）还是硬套 |

「直接跑」里的 `scene add（结构已定）` 保留。不要加 apply。

`skills/lightweaver/SKILL.md`、`skills/lightweaver-assets/SKILL.md`：本 PR 不改（路由器已指向 film；不要把 6 张卡或阶段写进路由器）。

## 测试

新文件 `weaver/src/recipes.test.ts`，跑进现网 `tsx --test src/*.test.ts`。风格对齐 `scenes.test.ts`：`node:test` + `node:assert/strict` + `os.tmpdir()`。测模块，不必 spawn CLI。

共用夹具（每个 case `mkdtemp`，`after`/`finally` **恢复** `process.env.LIGHTWEAVER_RECIPES`，避免污染其它文件）：

```
$LIGHTWEAVER_RECIPES/
  study-explainer/
    index.md                 # 可带合法 frontmatter，仍必须被跳过
    taxonomy-parade.md       # 合法，可从产品卡抄一份极简
    mismatch.md              # frontmatter id: other-name
    no-fm.md                 # 无 ---
    drama-named.md           # task: drama-plot
    ok-extra.md              # 合法 scene 卡
  drama-plot/
    some.md                  # 即使合法也不该被扫到（未实现 task 目录）
```

必测：

| # | 断言 |
| --- | --- |
| 1 | `listRecipes(root)` 在 env 夹具下 **不含** `index`；`console.warn` spy 调用次数为 0（list 前后） |
| 2 | 产品树：`listRecipes(weaverRoot(), "study-explainer")` 的 id 集合 === `problem-then-rule` `taxonomy-parade` `kind-still` `contrast-pair` `study-title` `say-it-this-way`（恰好 6，无 `index`） |
| 3 | `showRecipe("taxonomy-parade")` / `loadRecipe` 同对象：`task==="study-explainer"`、`level==="film"`、`requires_kinds===true`、`canon` 为三则 taxonomy 片、`path` 以 `recipes/study-explainer/taxonomy-parade.md` 结尾、`body` 含「一种 LightUI kind 一场」 |
| 4 | `loadRecipe("no-such-recipe")` throw `/找不到 recipe/` |
| 5 | `loadRecipe("../etc/passwd")`、`loadRecipe("a/b")` throw `/非法 recipe id/` |
| 6 | 设 `LIGHTWEAVER_RECIPES` 为夹具后，`listRecipes(weaverRoot())` **只**见夹具里的合法卡，**不见**产品 6 张；取消 env 后产品卡回来 |
| 7 | 夹具 `mismatch.md`（id ≠ 文件名）不出现在 list；`loadRecipe("mismatch")` throw 找不到 |
| 8 | `listRecipes(root, "drama-plot")` 与 `listRecipes(root, "not-a-task")` === `[]`，不 throw；夹具 `drama-named.md`（未知 task 键）不出现在无过滤 list |
| 9 | `loadRecipe("problem-then-rule")` 的 `default_scenes` 四 id 为 `problem,diagonal,vertical,third`，对应 role `problem,rule,contrast,rule` |
| 10 | `paths.recipes`：`projectPaths(loadProject("intent-cascade"), weaverRoot()).recipes === path.join(recipeRoot(weaverRoot()), filmTask(project.film))`，且以 `recipes/study-explainer` 结尾（**不是** `recipeRoot()` 本身）。若该断言已在 PR1 `project-paths.test.ts`，此处可 `import { projectPaths }` 再钉一次，或只留一句注释指向 PR1；缺了就在本文件补 |

不要测 apply。不要读 LightUI。

## 实施步骤

1. 确认 PR1 已合：`recipeRoot`、`projectPaths`、`references/pipeline.md` 阶段 1 仍是「对照 film.json」。缺 `recipeRoot` 先按设计补 6 行，不要在 `recipes.ts` 里重写 env。
2. 写 `recipes.ts`：frontmatter 窄解析 + `listRecipes` / `loadRecipe` / `showRecipe`。先用夹具单测 1、4–8 绿灯。
3. 提交 `recipes/study-explainer/{index.md, 6 张卡}`。跑单测 2、3、9。
4. `cli.ts` 加 `recipe` 分支；顶层 help 加 `weaver recipe list|show`。手跑 `npx weaver recipe list --json` 与 `recipe show taxonomy-parade --json`。
5. `index.ts` 增加 `export * from "./recipes.ts"`。
6. 三处 skill 替换。全仓搜 `recipe apply` / `applyRecipe`：只允许出现在 `docs/design-placement-contract.md` 与 `spec/03-*.md`（若已有），**不得**出现在 `skills/`、`recipes/`、`weaver/src/`、`docs/conventions.md`。
7. `docs/conventions.md` 加短表（见下）。
8. `make typecheck && make test`。

`docs/conventions.md` 在文首「一部片子是一个任务实例」后插入（短，不要把设计全文搬过来）：

```markdown
## 存放图

| 层 | 跟谁走 | 路径 |
| --- | --- | --- |
| 理念 | 主题 / 用户项目 | first-party：`$LIGHTUI_ROOT/studies/<slug>/idea.md`（及 `idea.en.md` / `study.json`；taxonomy 另有 `src/lib/kinds.ts`）。用户片：`data/projects/<id>/brief.md` |
| 资产 | 共享 vs 片内 | `library/`；`<project>/assets.json` + `assets/stills/<locale>/` |
| 产物 | 项目 | `assets/lines/<locale>/*.wav`；`assets/outputs/<output>` |
| 方法 | 任务 | `recipes/study-explainer/<id>.md`（`weaver recipe list\|show`） |

不要把 `idea.md` 拷进片子目录。不要把 recipe 放进 `library/` 或 `skills/`。
```

## 验收

- `npx weaver recipe list --json` → `ok: true`，6 张，无 `index`，无 `body`。
- `npx weaver recipe list --task study-explainer --json` 同上；`--task drama-plot` → 空数组、exit 0。
- `npx weaver recipe show taxonomy-parade --json` → `requires_kinds: true`，`canon` 三则，`body` 非空。
- `npx weaver recipe show problem-then-rule --json` → `default_scenes` 四场与 intent-cascade 一致。
- `npx weaver recipe apply` → 用法 `list|show`，exit ≠ 0，stderr/JSON error **不含** `apply` 实现暗示。
- `npx weaver recipe show missing` → 中文「找不到 recipe」。
- `project show intent-cascade --json` 的 `paths.recipes` 以 `recipes/study-explainer` 结尾。
- `skills/lightweaver-film/SKILL.md` 选卡行链 `recipe list` + `index.md`；`pipeline.md` 阶段 1 已换、阶段 2 仍 `scene add`/`rm`；`modes.md` 对不上结构已换。
- `recipes/drama-plot/` 不存在。`make typecheck` / `make test` 绿。
- 仓库根 `recipes/` 与 `library/`、`docs/` 平级，已提交。

## 陷阱

- **`index.md` 一 warn 就脏了 stdout。** list 是 agent 发现面。跳过必须完全静默；单测要 spy `console.warn`。
- **`paths.recipes` 不是 `recipeRoot()`。** 必须 `join(recipeRoot(root), filmTask(film))`。写进 `project-paths.ts` 的人很容易停在 `recipes/`。
- **`LIGHTWEAVER_RECIPES` 盖掉 `root` 参数。** 夹具测试必须还原 env，否则后续 `listProjects` / 产品卡测试会偶发变空。
- **id 穿越。** 先校验 kebab，再拼路径。不要 `safeJoin(recipeRoot(), id)` 接受 `../`。
- **扫未知 task 目录。** 只迭代 `listTasks()`（或已实现 TaskId）。`recipes/drama-plot/` 即使有人误建也不进 list。
- **id ≠ 文件名。** 整张跳过，不要按 frontmatter id 改名收录，也不要 throw 打断 list。
- **未知键 vs 未知 task。** 键忽略；`task: drama-plot` 是未知 **值**，整张跳过。`--task drama-plot` 是未知过滤，返回空。
- **把 apply 写进卡或 skill。** agent 会去敲。卡上只写骨架 + `scene add`；CLI 未知子命令不要「友情提示 apply」。
- **list 塞 `body`。** 设计明确 show 才给全文。6×2KB 现在还小，但会诱使 agent 不读 index。
- **手写 YAML 解析器吃不下 `when: \|` 或 `default_scenes`。** 先为 R1/R2 各写一条解析单测再铺产品卡。
- **学 dropdown 的 `comp-01.png`。** 卡上必须写「新片文件名 = kind」。老文件名只当实证脚注。
- **给 FilmDoc 加 `recipeId`。** 片子被 `scene rm` 之后戳会撒谎。canon 写在卡上，不反查。
- **在 `recipes.ts` 里 import `validate.ts`。** PR3 apply 会再 import `scenes.ts`；现在就把环路堵死。
- **空 stub「以后再用」。** P11：没有第五则 study 就不要第七张卡。

### Critical Files for Implementation
- `weaver/src/recipes.ts` - 新模块：Recipe 类型、窄 frontmatter、list/load/show
- `weaver/src/cli.ts` - 只加 `recipe list|show` 与 help，不加 apply
- `recipes/study-explainer/` - 6 张真卡 + `index.md`（产品对象）
- `weaver/src/recipes.test.ts` - 跳过 index / 夹具 env / 非法 id / 未知 task
- `skills/lightweaver-film/SKILL.md` - 选卡行与动词表替换（pipeline/modes 同批三处）
