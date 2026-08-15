# 03 · PR3 recipe apply

| 字段 | 值 |
| --- | --- |
| 对应设计 | [`docs/design-placement-contract.md`](../docs/design-placement-contract.md) P7、`recipe apply` 精确语义、PR Plan · PR3 |
| 依赖 | PR1（`projectPaths` / 写操作信封 `paths`）、PR2（`recipes.ts` 的 `listRecipes` / `loadRecipe`、6 张真卡、`recipe list\|show`） |
| 标题（落地 PR） | `feat(weaver): apply film recipes without inventing scene kinds` |
| 状态 | 待实施（本文件是实施方案，不是补丁） |

现网锚点（写本 spec 时）：`weaver/src/scenes.ts` 已有 `addScene` / `removeScene`；`cli.ts` 的 `envelope` 为 `{ ok, project, film, issues }`（PR1 会再加 `paths`）；`recipes/` 与 `applyRecipe` **尚未存在**，按 PR2 合入后的形状实施。

---

## 范围 / 非目标

### 范围

1. 在 `weaver/src/recipes.ts`（PR2 已建）导出 `applyRecipe(project, recipeId, options) → { project, skipped }`。
2. CLI 增加 `weaver recipe apply --project <id> --recipe <id> [--kinds a,b,c] [--json]`，信封 `{ ok, project, film, issues, skipped, paths }`。
3. film 级卡只展开 **still 行**：`taxonomy-parade` 吃 `--kinds`；`problem-then-rule` 吃卡上写死的 `default_scenes`。
4. 只编排现网 `addScene` / `removeScene`。删种子 `hero` 必须先加新 still。
5. 同 id 跳过、推进 `skipped: string[]`，不覆盖旁白，不把 skip 写成 `Issue`。
6. Skill **只改两处**：`references/pipeline.md` 阶段 2；`SKILL.md` 动词表里「展开骨架」那一行。写明占位旁白必须阶段 3 替换。
7. 测试全部打在 temp user 项目上（`os.tmpdir()` / `data/projects` 夹具）。**禁止**改四则 first-party `film.json`。

### 非目标（本 PR 一律不做）

| 禁止 | 理由 |
| --- | --- |
| 第二套 FilmDoc 写入器（手拼 `scenes` + `saveFilm`） | 会绕开 last-still、占位 `lines`、`ensureStillStub`、插在 close 前 |
| 写旁白 / 猜 `locales.*.output` / 跑 `tts`/`render`/`capture` | P7 |
| 读 LightUI `kinds.ts` / 写 `brief.md` | 理念层；`--kinds` 由 agent 传入 |
| `film.recipeId` / 改 `FilmDoc` | 设计已弃；片子被手改后戳会骗人 |
| `weaver produce` / `plan` / 核内 LLM | P6 / P7 |
| Studio HTTP / `apply` API | v1 Studio 不调 recipe |
| 改 `scenes.ts` 的 last-still / 占位规则 | apply 去遵守，不去放松 |
| 把 scene 级卡（`kind-still` / `contrast-pair` / `study-title` / `say-it-this-way`）做成 apply | 整片 apply → 中文 error |
| 为 `--kinds` 发明新 scene kind（`beat` / `clip`） | 硬闸 |
| 改 PR1 `paths` 形状、PR2 `list`/`show`、6 张卡正文（除 `problem-then-rule` 补 `default_scenes`） | 越权 |
| nav/sidebar 手截 / 媒体出片 | Q-media = M2 |

---

## 现网 scenes.ts 约束

`applyRecipe` **必须**当这些是运行时不变量。不要复制一份「更聪明」的 splice。

### `addScene`（`weaver/src/scenes.ts` 40–70 行）

```40:70:weaver/src/scenes.ts
export function addScene(
  project: ProjectRecord,
  input: { id: string; kind: string; still?: string; fit?: "cover" | "contain"; role?: StudyRole; after?: string },
): ProjectRecord {
  const task = getTask(filmTask(project.film));
  if (input.kind !== "still") throw new Error("只能追加 still 场（title/close 由种子创建）");
  if (!task.sceneKinds.includes(input.kind)) throw new Error(`任务不允许 kind：${input.kind}`);
  if (project.film.scenes.some((scene) => scene.id === input.id)) {
    throw new Error(`场景已存在：${input.id}`);
  }
  const scene: SceneDef = {
    id: input.id,
    kind: input.kind,
    still: input.still,
    fit: input.fit,
    role: input.role,
    lines: Object.fromEntries(Object.keys(project.film.locales).map((locale) => [locale, input.id])),
  };
  // …插在 close 之前（或 --after 之后），ensureStillStub，saveFilm
}
```

约束表：

| 规则 | 现网行为 | apply 必须 |
| --- | --- | --- |
| 只能加 `still` | `kind !== "still"` → `只能追加 still 场…` | 计划表里非 still（含 title/close）先中文失败，不要让半片写出去 |
| `task.sceneKinds` | 今日 `["title","still","close"]`（`study-explainer.ts`） | `beat` / `clip` / 不在列表 → 中文 error，**在任何 `addScene` 之前** |
| 同 id | **throw** `场景已存在：${id}` | apply **先查再决定**：存在 → `skipped.push(id)`，**禁止**调用 `addScene` |
| 占位旁白 | `lines[locale] = input.id`（每个 locale 一份，非空） | 原样接受。文档：阶段 3 必须 `scene set` 换真稿。validate Q3 会把占位当「有旁白」放过 |
| 插入位置 | 默认插在 `kind===close` 之前 | 按计划表顺序依次 `addScene`，不要传 `after`（除非测试需要） |
| still stub | `ensureStillStub` → `upsertAsset`，`files.zh/en = assets/stills/<locale>/<id>.png` | 让 `addScene` 做。apply 不要自己写 `assets.json` |
| 持久化 | `addScene` 内部 `saveFilm` | apply 不要再 `saveFilm` 一遍 |

种子 `createFilm` 的旁白**不是** id 占位：`hero.lines` 抄的是 title 文案。apply 删 hero 后那些行一起消失——这是预期。

### `removeScene`（72–86 行）

```72:86:weaver/src/scenes.ts
export function removeScene(project: ProjectRecord, sceneId: string): ProjectRecord {
  const { scene } = requireScene(project, sceneId);
  if (scene.kind === "title" || scene.kind === "close") {
    throw new Error("不能删除 title / close");
  }
  const stillCount = project.film.scenes.filter((item) => item.kind === "still").length;
  if (scene.kind === "still" && stillCount <= 1) {
    throw new Error("不能删光最后一场 still");
  }
  // saveFilm 过滤掉该 id
}
```

| 规则 | 含义 | apply |
| --- | --- | --- |
| 不能删 title/close | 硬错误 | 不要对它们调 `removeScene` |
| **最后一场 still** | 种子是 `title / hero / close`，`hero` 是**唯一** still。此时 `removeScene("hero")` **必炸** | **先把计划表里的新 still 全部 `addScene`，再删 hero**。顺序写进 `applyRecipe` 函数注释 |
| 找不到 id | `找不到场景 ${id}` | 删 hero 前先 `find(id==="hero" && kind==="still")` |

`scenes.test.ts` 已锁：「先 `addScene(shot)` 再 `removeScene(hero)`；对最后一场 still / title throw」。apply 测试必须落在同一条不变量上，而不是改 `removeScene`。

### 其它不要碰

- `moveScene` / `patchScene` / `setCard` / `setVoice`：apply 不调用。
- `validate.ts`：`recipes.ts` **禁止 import**（与 TaskModule 同一条循环禁令）。信封的 `issues` 只在 `cli.ts` 里用现成 `envelope()` → `validateProject`。
- `createFilm` 种子带 `hero`、不猜 output、first-party 入库前才手删 hero——apply 是这条路径的确定性替代，不是新的 `createFilm`。

---

## applyRecipe 语义（伪代码级）

### 签名

不要用设计稿里的 `{ projectId }` 输入。与 `addScene(project, …)` 对齐，测试才能把 temp `ProjectRecord` 直接喂进来：

```ts
export type ApplyRecipeOptions = {
  /** CLI `--kinds a,b,c` 已拆好、trim、去空。缺省 / `[]` 视为未传。 */
  kinds?: string[];
};

/**
 * 只编排 addScene / removeScene。
 * 种子 hero 可能是唯一 still；removeScene 拒绝删光最后一场 still。
 * 必须先 addScene 展开新 still，再 removeScene("hero")。
 */
export function applyRecipe(
  project: ProjectRecord,
  recipeId: string,
  options: ApplyRecipeOptions = {},
  root = weaverRoot(),
): { project: ProjectRecord; skipped: string[] };
```

`root` 只给 PR2 的 `loadRecipe` / `recipeRoot` 用。写盘走 `project.root`（`addScene` 已做）。

`index.ts` 增补 `applyRecipe`（PR2 已导出 `listRecipes` / `loadRecipe` / `recipeRoot`）。

### 计划表怎么来

| 卡 | frontmatter | 计划表 |
| --- | --- | --- |
| `taxonomy-parade` | `level: film`，`requires_kinds: true` | 每个 `--kinds` 项 → `{ id, kind: "still", still: "asset:still."+id, fit: "contain", role: "contrast" }` |
| `problem-then-rule` | `level: film`，`requires_kinds` 缺省/false，**写死** `default_scenes` | **只用** `default_scenes`。忽略 `--kinds`（不追加、不报错），避免 apply 变成自由 id 列表、丢掉「问题场」 |
| 其它 `level: film` | 有 `requires_kinds` 或 `default_scenes` 之一 | 通用：`requires_kinds` 优先用 `--kinds` 模板；否则用 `default_scenes` |
| `level: scene` | 四张场景卡 | **整函数失败**，一行都不写 |

`default_scenes` 项：`{ id, kind, role?, still?, fit? }`。缺 `still` → `asset:still.${id}`。缺 `kind` → `"still"`。缺 `fit`/`role` → 不传给 `addScene`（`problem` 场与 canon 一样无 `fit`）。

若 PR2 的 `problem-then-rule.md` 还没有 `default_scenes`，本 PR **只补 frontmatter**，不改 when/正文。必须与 `intent-cascade` 四场一致：

```yaml
default_scenes:
  - { id: problem,  kind: still, role: problem,  still: asset:still.problem }
  - { id: diagonal, kind: still, role: rule,     still: asset:still.diagonal, fit: contain }
  - { id: vertical, kind: still, role: contrast, still: asset:still.vertical, fit: contain }
  - { id: third,    kind: still, role: rule,     still: asset:still.third,    fit: contain }
```

禁止 apply 猜测 `diagonal`。禁止为「只要三场」加自由 id 参数——人在 apply 之后 `scene rm`。

### 伪代码

```ts
function applyRecipe(project, recipeId, options = {}, root = weaverRoot()) {
  const recipe = loadRecipe(recipeId, root); // 找不到 → 中文「找不到配方 …」（PR2 已有则复用）
  const task = getTask(filmTask(project.film));

  if (recipe.task !== task.id) {
    throw new Error(`配方 ${recipe.id} 属于任务 ${recipe.task}，与片子任务 ${task.id} 不一致`);
  }
  if (recipe.level !== "film") {
    throw new Error("scene 卡按 SKILL 手写一场，或并入 film 卡");
  }

  const kinds = (options.kinds ?? []).map((k) => k.trim()).filter(Boolean);
  // 去重保序，避免 --kinds a,a 第一次 add、第二次再走 skip
  const uniqKinds = [...new Set(kinds)];

  let planned: Array<{ id: string; kind: string; still?: string; fit?: "cover"|"contain"; role?: StudyRole }>;

  if (recipe.requires_kinds) {
    if (uniqKinds.length === 0) {
      throw new Error(
        `${recipe.id} 需要 --kinds（由 agent 从 kinds.ts 读入，不要让 weaver 解析 LightUI）`,
      );
    }
    planned = uniqKinds.map((id) => ({
      id,
      kind: "still",
      still: `asset:still.${id}`,
      fit: "contain",
      role: "contrast",
    }));
  } else if (recipe.default_scenes?.length) {
    planned = recipe.default_scenes.map((row) => ({
      id: row.id,
      kind: row.kind ?? "still",
      still: row.still ?? `asset:still.${row.id}`,
      fit: row.fit,
      role: row.role,
    }));
    // --kinds 有值也忽略
  } else {
    throw new Error(`film 卡 ${recipe.id} 缺少 default_scenes 或 requires_kinds，无法 apply`);
  }

  // ---- 先校验，再写盘（避免加了 3 场再在第 4 场炸）----
  for (const item of planned) {
    if (!task.sceneKinds.includes(item.kind)) {
      throw new Error(`未知场景 kind：${item.kind}（只允许 ${task.sceneKinds.join(" / ")}）`);
    }
    if (item.kind !== "still") {
      throw new Error("recipe apply 只展开 still 场（title/close 由种子创建）");
    }
  }

  const skipped: string[] = [];
  for (const item of planned) {
    if (project.film.scenes.some((s) => s.id === item.id)) {
      skipped.push(item.id);           // 不 clobber lines，不进 Issue[]
      continue;
    }
    addScene(project, {
      id: item.id,
      kind: "still",
      still: item.still,
      fit: item.fit,
      role: item.role,
    });
  }

  // ---- 后删 hero。此时若加进了至少一场新 still，stillCount ≥ 2 ----
  const hero = project.film.scenes.find((s) => s.id === "hero" && s.kind === "still");
  if (hero) {
    const stillCount = project.film.scenes.filter((s) => s.kind === "still").length;
    if (stillCount > 1) {
      removeScene(project, "hero");
    }
    // stillCount === 1：全部 skipped 且 hero 仍是唯一 still → 不调 removeScene
    // （否则「不能删光最后一场 still」）。不把 hero 塞进 skipped，除非它本就在 planned 里。
  }

  return { project, skipped };
}
```

### 明确不做什么

| 动作 | 做了就是越界 |
| --- | --- |
| `project.film.scenes = …` / 直接 `saveFilm` | 第二套 writer |
| `lines[locale] =` 任何非 `addScene` 占位的字符串 | 写旁白 |
| 读 `kinds.ts`、`idea.md`、`brief.md`、LightUI | 理念层 |
| 改 `locales` / `publish` / `voices` / `output` / `capture` / `study` | P7 第 7 条 |
| `film.recipeId = recipe.id` | 禁止新字段 |
| `runTts` / `runRender` / `runCapture` / 写 wav 文件名 | 产物层 |
| `validateProject`（在 `recipes.ts` 内） | 循环 / 职责错位 |
| 把 `skipped` 推进 `Issue[]` | 设计：skip 不是校验问题 |

`--kinds` 的值是 **场景 id**（LightUI `KindId`），不是 scene kind。`alpha` / `floating` / 甚至字面量 `beat` 作为 **id** 都合法——weaver 不查 `kinds.ts`。`beat` 作为 `default_scenes[].kind` 才是「未知场景 kind」。

对 `taxonomy-parade` 传入 `--kinds title`：`title` 已存在 → `skipped` 含 `"title"`，不会试图加一场 `kind=still,id=title`。

### 种子走一遍之后的盘面（taxonomy，`--kinds alpha,bravo`）

```
createFilm  →  [title, hero, close]
add alpha   →  [title, hero, alpha, close]   lines.alpha.* === "alpha"；stub still.alpha
add bravo   →  [title, hero, alpha, bravo, close]
rm hero     →  [title, alpha, bravo, close]
```

`problem-then-rule` 同理 → `[title, problem, diagonal, vertical, third, close]`，roles 为 `problem / rule / contrast / rule`。

二次 apply：计划表 id 全在 → `skipped` 为那几项，hero 已不在，函数空转（不再写盘，或只走 skip 分支）。已写旁白保持原样。

---

## CLI 信封

### 用法

```
weaver recipe apply --project <id> --recipe <id> [--kinds a,b,c] [--json]
```

PR2 已有 `recipe list|show`。本 PR 只加 `apply` 子命令，以及 parseArgs 的 `--recipe`、`--kinds`（若 PR2 未加）。

| 参数 | 规则 |
| --- | --- |
| `--project` | 必填。走现网 `requireProject` / `loadProject` |
| `--recipe` | 必填。只接受 kebab id，不要文件路径，不要 `../` |
| `--kinds` | 按逗号拆、`trim`、丢空段。`--kinds ""` / `--kinds ","` 视为未传 |
| `--json` | 与全 CLI 相同；失败时 `fail` 已能打 `{ ok: false, error }` |

缺 `--project` / `--recipe`：`fail("用法: weaver recipe apply --project <id> --recipe <id> [--kinds a,b,c]")`，**exit 1**（用法错）。

`applyRecipe` throw（缺 kinds、scene 卡、未知 kind、找不到配方、任务不一致、last-still 若实现漏了顺序）：`fail(message, 2)`。`requires_kinds` 无 `--kinds` **必须** exit 2。

未知命令帮助补一行：`weaver recipe list|show|apply`。

### 成功信封

`cli.ts` 在现成 `envelope(project)`（PR1 已含 `paths`）上**同级**加 `skipped`：

```ts
const { skipped } = applyRecipe(project, recipeId, { kinds }, root);
print({ ...envelope(project), skipped });
```

形状：

```json
{
  "ok": true,
  "project": { "id": "demo-film", "source": "user", "root": "…", "task": "study-explainer" },
  "film": { "id": "demo-film", "scenes": [], "locales": {} },
  "issues": [],
  "skipped": ["alpha"],
  "paths": {
    "projectRoot": "…",
    "stillFiles": [],
    "lineFiles": [],
    "outputFiles": {},
    "brief": {}
  }
}
```

| 字段 | 来源 | 注意 |
| --- | --- | --- |
| `ok` | 常量 true | 失败走 `fail`，不要 `ok:true` 再塞 error |
| `project` | `projectSummary` | 不要塞 `paths` / `skipped` 进 summary |
| `film` | apply 之后的 `project.film` | 无 `recipeId` |
| `issues` | `validateProject`（仅 cli） | 新 still 缺 png / 缺 wav → **warning**；占位 lines 非空 → 无「缺旁白」error。`skipped` **不是** issue |
| `skipped` | `string[]` | 同 id 未覆盖的计划 id，保序。空数组也要出（不要 `undefined`） |
| `paths` | PR1 `projectPaths` | apply 后重算；新 still 应出现在 `stillFiles`（stub `rel` 为 `assets/stills/<locale>/<id>.png`，`exists: false`） |

无 `--json` 时与其它写操作一样：`print(envelope)` 对 object 仍 `JSON.stringify`。不要另做一套人话表格。

### 失败信封（`--json`）

```json
{ "ok": false, "error": "taxonomy-parade 需要 --kinds（由 agent 从 kinds.ts 读入，不要让 weaver 解析 LightUI）" }
```

中文文案（测试用正则锁关键字即可，不要锁全句标点以外的每个字，但 **必须** 含括号里的词）：

| 条件 | 消息必须含 |
| --- | --- |
| scene 级 apply | `scene 卡按 SKILL 手写一场` |
| `requires_kinds` 且 kinds 空 | `需要 --kinds` 以及 `不要让 weaver 解析 LightUI` |
| `default_scenes[].kind` ∉ `task.sceneKinds` | `未知场景 kind` |
| 计划项 `kind !== "still"` | `只展开 still` |
| 找不到配方 | `找不到配方` |
| recipe.task ≠ film.task | `不一致` |

CLI **不**在 apply 路径读 `kinds.ts`、不写 `brief.md`、不调 tts/render。

---

## Skill 替换行（仅 PR3）

只改生产 skill。路由器、`modes.md` 大表、`qa.md`、assets skill **不要重写**。若 PR2 的 `pipeline.md` / `SKILL.md` 阶段 2 仍写「还没有 apply / 读卡手写骨架」，按下面整行替换。

### 1. `skills/lightweaver-film/references/pipeline.md` · 阶段 2

**删（PR2 行，大意）：**

```
| 2 | Structure | … | project create + scene add / scene rm --id hero（读卡手写骨架；还没有 recipe apply） | 无 hero 的场景列表 + still stub |
```

分期表里「阶段 2 仍 scene add」那一行同步改成 PR3。

**写成：**

```markdown
| **2** | Structure | 3 分镜放行 | Agent 调 CLI | `project create` + `weaver recipe apply --project <id> --recipe <id> [--kinds a,b,c]`。必要时再 `scene add` / `scene rm`。`apply` / `addScene` 把每场 `lines[locale]` 写成 **scene id 占位**（非空，validate Q3 会过）；**阶段 3 必须 `scene set --locale --text` 换成真旁白**，不得把占位当完稿。 | 无 `hero` 的场景列表 + still stub + 占位旁白 |
```

阶段 3 若还没写「替换占位」，补半句：「必须替换 apply/`addScene` 留下的 id 占位」。阶段 1 保持 PR2 的 `recipe list` / `show`，不要动。

### 2. `skills/lightweaver-film/SKILL.md` · 动词表

把「展开骨架」主动词从 `scene add` 换成 `recipe apply`。`scene add`/`rm` 降为补场/删场，不要删掉（apply 之后仍可能 `scene rm` 掉多余 still）。

**替换后的动词块（结构段；其它动词保持 PR2 原样）：**

```markdown
npx weaver recipe apply --project <id> --recipe taxonomy-parade --kinds a,b,c --json
npx weaver recipe apply --project <id> --recipe problem-then-rule --json
npx weaver scene add --project <id> --id <scene> --kind still [--still asset:still.x] [--role contrast]
npx weaver scene rm --project <id> --id <scene>
npx weaver scene set --project <id> --id <scene> --locale zh --text "..."
```

在动词表上或紧底下加一句（Q3 提醒）：

> `recipe apply` 与 `scene add` 留下的 `lines[locale] === <sceneId>` 是占位。阶段 3 必须 `scene set` 换成对照 `idea.md` / `brief.md` 的真旁白；不要对占位跑「已经有旁白了所以跳过写稿」。

Loop / 「直接跑」若仍写「结构已定 → `scene add`」，改成「结构已定 → `recipe apply`；补场才 `scene add`」。不要在 SKILL 正文贴 6 张 recipe。不要链 `kinds.ts` 给 weaver。

### 3. `modes.md`（仅当 PR2 留了「还没有 apply」）

「直接跑」那条 `scene add（结构已定）` 改成：`recipe apply`（结构已定；占位旁白阶段 3 再写）。**不要**借本 PR 重写停/跑全表。

---

## 测试

文件：`weaver/src/recipes.test.ts`（PR2 已有 list/show；本 PR 加 `describe("applyRecipe")`）。runner 已是 `tsx --test src/*.test.ts`。

### 夹具（强制）

照 `scenes.test.ts` / `project.test.ts`：

```ts
function tempRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "weaver-"));
  fs.mkdirSync(path.join(root, "library"), { recursive: true });
  fs.writeFileSync(path.join(root, "library/assets.json"), `${JSON.stringify({ assets: [] })}\n`);
  return root;
}
```

- 一律 `createProject("demo-film", { title: "演示" }, tmp)` → `source:"user"`，落在 `tmp/data/projects/demo-film/`。
- 真卡（`taxonomy-parade` / `problem-then-rule` / `kind-still`）用第四参 `weaverRoot()` 让 `loadRecipe` 读仓库 `recipes/`。**不要** `loadProject("nav-taxonomy")` 再 apply。
- 未知 kind 卡：在 `tmp/recipes/study-explainer/bad-beat.md` 写一份 `level:film` + `default_scenes:[{id:x,kind:beat}]`，`applyRecipe(..., tmp)`。
- **禁止**写 `products/study-films/projects/**/film.json`。**禁止** `source:"first-party"` 指向真实 first-party 根。断言里不要 `saveFilm` 到仓内片子。
- 不要设 `LIGHTWEAVER_ROOT` 把 weaverRoot 指到 tmp（否则读不到真卡）。

### 必写用例

| # | 名 | 步骤 | 断言 |
| --- | --- | --- | --- |
| T1 | apply taxonomy-parade on temp user project | seed → `applyRecipe(p, "taxonomy-parade", { kinds: ["alpha","bravo"] }, weaverRoot())` | `scenes.id === ["title","alpha","bravo","close"]`；无 `hero`；两场 `kind==="still"`、`still==="asset:still.alpha|bravo"`、`fit==="contain"`、`role==="contrast"`；`lines.zh/en === id`；`assets` 含 `still.alpha` / `still.bravo`；`locales.zh.output` 仍是 create 的默认值（`${id}.mp4`，**未被猜改**）；`film` 无 `recipeId`；`skipped` 为 `[]` |
| T2 | skip existing ids，不 clobber lines | 先 apply 或 `addScene({id:"alpha",…})` + `patchScene("alpha", { lines: { zh: "真旁白", en: "real" } })`，再 apply 同一 `--kinds alpha,bravo` | `skipped` 含 `"alpha"` 不含已新增的新 id（或二次全 skip）；`alpha.lines.zh === "真旁白"`；没有变成 `"alpha"` |
| T3 | reject scene-level apply | `applyRecipe(p, "kind-still", {}, weaverRoot())` | throw `/scene 卡按 SKILL/`；`scenes` 仍是 `title,hero,close`（**零写盘**） |
| T4 | reject unknown kind | tmp 卡 `kind: beat`（另写一条 `clip` 亦可） | throw `/未知场景 kind/`；hero 仍在 |
| T5 | hero 删除顺序 / last-still | 同 T1；可另写「只 skip、加不进新 still 时留下 hero、不 throw」 | apply **不** throw `最后一场 still`；先加后删的终态无 hero。对照：`removeScene(seed, "hero")` 在 apply 之前仍 throw（证明我们没改 `scenes.ts`） |
| T6 | `requires_kinds` 无 kinds | `applyRecipe(p, "taxonomy-parade", {}, weaverRoot())` 与 `{ kinds: [] }` | throw `/需要 --kinds/` |
| T7 | `problem-then-rule` 走 `default_scenes` | `applyRecipe(p, "problem-then-rule", { kinds: ["nope"] }, weaverRoot())` | id 为 `title,problem,diagonal,vertical,third,close`；`--kinds nope` **未**入场；`problem.role==="problem"`，`diagonal.role==="rule"`，`vertical.role==="contrast"`，`third.role==="rule"` |

可选：recipe.task 不一致（手写一张 `task: drama-plot` 的 tmp 卡）→ `/不一致/`。不必做 CLI spawn（现网没有 cli 测试）。

T1 的 kinds 用 `alpha,bravo` 而不是 nav 的真实 KindId——证明 apply **不**读 `kinds.ts`。

---

## 实施步骤

1. **确认 PR2 面**：`loadRecipe` / `Recipe` 类型含 `level`、`requires_kinds`、`default_scenes`、`task`。缺 `default_scenes` 解析则本 PR 在 `recipes.ts` 补上（未知 frontmatter 键本应忽略；这是已知键）。
2. **补卡**：`recipes/study-explainer/problem-then-rule.md` 写入上一节四条 `default_scenes`。`taxonomy-parade.md` 确认 `requires_kinds: true`、`level: film`。不要改四则 first-party `film.json`。
3. **实现 `applyRecipe`**：按伪代码；只 import `schema.ts`、`scenes.ts`（`addScene`/`removeScene`）、`tasks/registry.ts`（`getTask`）、PR2 的 `loadRecipe`、`paths.ts`（`weaverRoot`）。**不要** import `validate.ts`、`products/*`、`tts`/`render`。函数注释写清 hero 顺序。
4. **导出**：`weaver/src/index.ts` 增加 `applyRecipe`。
5. **CLI**：`take()` 加 `--recipe`、`--kinds`；`command==="recipe" && rest[0]==="apply"` 里 `loadProject` → `applyRecipe` → `print({ ...envelope(project), skipped })`；catch → `fail(msg, 2)`；帮助行补 `apply`。
6. **测试**：在 `recipes.test.ts` 写 T1–T7。跑 `npm test --prefix weaver`（或 `make test`）确认 first-party 的 `validate.test.ts` 未因本 PR 变红。
7. **Skill**：按「Skill 替换行」改 `pipeline.md` 阶段 2 与 `SKILL.md` 动词。不要改阶段 1 选卡行。
8. **自检**：`git diff products/study-films/projects` 必须为空。

---

## 验收

- [ ] `applyRecipe` 签名为 `(project, recipeId, options?, root?) → { project, skipped }`，内部只调 `addScene` / `removeScene`。
- [ ] `taxonomy-parade` 无 `--kinds` → throw 中文且 CLI exit 2；有 kinds → 按序加 contrast still + stub，再删 hero。
- [ ] `problem-then-rule` 展开写死的四场；忽略 `--kinds`。
- [ ] scene 级 apply → 中文 error，零写盘。
- [ ] `beat` / `clip` / 不在 `task.sceneKinds` 的 `default_scenes[].kind` → 中文 `未知场景 kind`，写盘前失败。
- [ ] 已存在 id → `skipped` 含该 id，`lines` 原样。
- [ ] 种子上 apply 不炸 last-still；终态无 `hero`（只要至少加进一场新 still）。
- [ ] 新场 `lines[locale] === id`；skill 写明阶段 3 必换。
- [ ] 不写旁白、不猜 output、不跑 tts/render、不读 `kinds.ts`、不写 `brief.md`、不加 `film.recipeId`。
- [ ] `--json` 信封为 `{ ok, project, film, issues, skipped, paths }`；`skipped` 是 `string[]`。
- [ ] `recipes.ts` 不 import `validate.ts`。
- [ ] 测试只用 tmp user 项目；`products/study-films/projects/**/film.json` 无 diff。
- [ ] `pipeline.md` 阶段 2 与 SKILL 动词已换成 `recipe apply` + 占位提醒。
- [ ] `make typecheck` 与 `make test` 通过。

---

## 陷阱

1. **先删 hero**：种子唯一 still 就是 hero。`removeScene("hero")` 在任何 `addScene` 之前 → `不能删光最后一场 still`。注释 + T5 锁顺序。
2. **用 `addScene` 探同 id**：它会 throw，不会 skip。必须自己 `scenes.some`，否则二次 apply / 已有旁白的片子直接炸，还会被说成「覆盖失败」而不是 skip。
3. **手写 `scenes` 数组**：会丢 `ensureStillStub`、丢 id 占位、插错 close、绕开 last-still。评审看到 `saveFilm` 出现在 `applyRecipe` 里就应打回。
4. **`--kinds` 当成 scene kind**：`floating` 是 id。不要 `if (!sceneKinds.includes(kindId)) throw`。硬闸只打在 `default_scenes[].kind` / 计划项的 `kind` 字段。
5. **`problem-then-rule` 吃 `--kinds`**：会丢掉「问题场」约束，也会猜出 `diagonal` 以外的结构。忽略 kinds，不要报错。
6. **`film.recipeId`**：看起来方便，片子一改结构就撒谎。信封里也不要加这个字段。
7. **把 `skipped` 推进 `issues`**：agent 会当成形状错误去「修」已有旁白。
8. **测试打在 first-party**：nav/sidebar 已有真旁白；apply 即使 skip 也有人会不小心 `saveFilm`。只建 `data/projects` / tmp。
9. **`recipes.ts` import `validate.ts`**：与 `project.ts` 循环禁令同类；issues 留给 cli `envelope`。
10. **占位被当成完稿**：Q3 只查非空。skill 不写阶段 3 替换，agent 会直接 tts 出「alpha」「bravo」。
11. **半次失败**：先校验全部 planned kind，再循环 `addScene`。不要加到一半才发现 `beat`。
12. **改 `scenes.ts` 放宽 last-still**：会让 `scenes.test.ts` 与用户片种子失去「至少一场 still」。apply 去迁就规则，不要改规则。
13. **读 `kinds.ts`「更智能」**：P7 / 理念层。缺 `--kinds` 就 exit 2，让 agent 去读 LightUI。
14. **PR3 顺手改阶段 1 / 重写 SKILL**：会把 PR2 的 `recipe list` 叙事冲掉。只动阶段 2 与动词。

---

### Critical Files for Implementation
- weaver/src/recipes.ts - 实现 `applyRecipe`：编排现网 `addScene`/`removeScene`，先加 still 再删 hero
- weaver/src/scenes.ts - 必须遵守的 last-still / 同 id throw / `lines[locale]=id` / `ensureStillStub`（只读，不改）
- weaver/src/cli.ts - `recipe apply`、`--kinds` 拆分、信封加 `skipped`（exit 2）
- weaver/src/recipes.test.ts - T1–T7：tmp user 项目，禁止碰 first-party `film.json`
- skills/lightweaver-film/references/pipeline.md - 阶段 2 换成 apply，并写明占位旁白由阶段 3 替换
