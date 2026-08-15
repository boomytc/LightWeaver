# 01 · PR1 projectPaths + skill 约定表

| 字段 | 值 |
| --- | --- |
| 规格 | `spec/01-pr1-project-paths.md` |
| 对应设计 | `docs/design-placement-contract.md` PR1 / P0 / P14 / API |
| 核（不重开） | `docs/design-study-explainer.md` D1–D13 |
| 标题（合入） | `feat(weaver): project paths contract; teach 理念/资产/产物 map` |
| 依赖 | 无 |

本规格按现网代码写到类型、函数体、断言与禁写字符串。设计类型与现网 **无冲突**，原样落地；算法细节以本页「算法」为准（设计只给了形状与例子）。

---

## 范围 / 非目标

### 做

- 新模块 `weaver/src/project-paths.ts`：`projectPaths(project, root)` + 四处类型。
- `weaver/src/paths.ts` 增加 `recipeRoot()`（`LIGHTWEAVER_RECIPES` 覆盖）。
- `cli.ts`：`project show` 同级加 `paths` + `renderable`；写操作 `envelope()` 同级加 `paths`。
- `index.ts` 导出 `projectPaths`、四处类型；`recipeRoot` 随 `paths.ts` 已有 `export *` 带出。
- Skill / README：PR1 措辞的存放图 + 结合规则。发现面 = `weaver project show --json` 的 `paths`。
- 单测 `weaver/src/project-paths.test.ts`（`package.json` 已是 `tsx --test src/*.test.ts`，会自动吃到）。

### 明确不做（本 PR）

- **不**把 `projectPaths` 放进 `project.ts`。
- **不**改 `FilmDoc` / `assets.json` / 四则 first-party 片子。不加 `film.recipeId`、`textHash`、`outputExists`。
- **不**新增 `weaver paths` / `weaver produce` / `weaver recipe *`。
- **不**提交 `recipes/` 或 `recipes/study-explainer/index.md`。`paths.recipes` 只是拼出来的字符串。
- **不**改 Studio / HTTP。`detailOf` 现网已有 `renderable`；给 GET 加 `paths` 是 **PR4**。设计 API 节写「GET 同样附上 paths」不在本 PR。
- `envelope` **不加** `renderable`，**不加** `skipped`（`skipped` 是 PR3 `apply`）。
- `projectSummary` / `project list` **不加** `paths` 或 `renderable`。
- `projectPaths()` **不算** `isRenderable`。`renderable` 只在 `cli.ts` 调 `isRenderable`。
- **不** `import` `validate.ts`（`project-paths.ts`）。测试文件可以。
- **不** `requireLightuiRoot()`。LightUI 不在就 `exists: false`。
- **不**扫仓库、`readdir` `assets/`、按 scene id 猜静帧文件名。
- Skill **禁止**出现：`recipe list` / `recipe show` / `recipe apply` / `weaver recipe` / `recipes/study-explainer/index.md`。

---

## 现网锚点

实现前必须对着这些读，不要另发明径。

| 锚点 | 现网事实 | 对本 PR |
| --- | --- | --- |
| 循环 | `assets.ts` 第 7 行 `import { saveAssets } from "./project.ts"` | `project.ts` 再 import `assets` 或 `project-paths` 即成环 |
| 解析静帧 | `resolveAssetFile`：`relPath = asset.files?.[locale] \|\| asset.file`，`absPath = path.join(scopeRoot, relPath)` | still 的 `rel` **必须**走这里，不是 `stillRelPath(scene.id)` |
| 旁白 / 成片相对路径 | `lineRelPath(sceneId, locale)` = `assets/lines/<locale>/<sceneId>.wav`；`outputRelPath(file)` = `assets/outputs/<file>`；均 `path.posix.join` | `lineFiles` / `outputFiles` 只用这两个，不读 `assets.json` 的 line/output 条目 |
| `stillRelPath(name, locale)` | `assets/stills/<locale>/<name>`，**不**补 `.png` | 只允许在 `resolveAssetFile === null` 的占位分支使用，且 `name` 必须自带扩展名 |
| 项目文件 | `filmPath(dir)` / `assetsPath(dir)` 在 `project.ts`，参数是 **项目目录** | `paths.film` / `paths.assetsDoc` 调它们 |
| `project show` | `print({ ...projectSummary(project), film, assets })`（`cli.ts` 115–118） | 同级加 `paths`、`renderable` |
| `envelope` | `{ ok, project: projectSummary, film, issues }` | 同级加 `paths`。**不要** `renderable` |
| `isRenderable` | `validate.ts`：`!hasErrors(validateProject) && everyStillPngExists` | 只在 `cli.ts`（及测试）调用。nav/sidebar 现网已锁 `false`（`validate.test.ts` 25–30） |
| Studio `detailOf` | 已有 `renderable`，无 `paths` | 本 PR 不动 |
| 种子 | `createFilm`：`title` + 未绑 `hero` + `close`；**不**写 `brief.md` | user 无 slug → `project-brief`；user + `studySlug` → `hybrid` |
| `ensureStillStub`（`scenes.ts` 24–38） | 新加场才按 `still.<id>` 猜 `<id>.png` | **不能**拿来算历史片 still 路径 |
| first-party 静帧文件名 | 见下表 | 单测锁死这些 `rel` |
| `recipeRoot` | **不存在** | 本 PR 加；`recipes/` 目录可以还不在盘上 |
| 测试脚本 | `weaver/package.json`：`tsx --test src/*.test.ts` | 新测试文件会被跑到 |
| LightUI | `lightuiRoot()` = `LIGHTUI_ROOT` 或 `resolve(root, "../LightUI")`；`requireLightuiRoot` 不存在就 **throw** | 只调前者 |

### first-party 静帧映射（`rel` 金标准）

**intent-cascade**（`assets.json`，历史名，不是 scene id）：

| sceneId | still ref | `files.zh` |
| --- | --- | --- |
| `problem` | `asset:still.problem` | `assets/stills/zh/desktop-full.png` |
| `diagonal` | `asset:still.diagonal` | `assets/stills/zh/diagonal-to-cancel.png` |
| `vertical` | `asset:still.vertical` | `assets/stills/zh/vertical-to-project.png` |
| `third` | `asset:still.third` | `assets/stills/zh/third-level.png` |

`assets.json` 里还有 `still.mobile`，**没有**对应 still 场 → **不准**出现在 `stillFiles`。

**dropdown-taxonomy**（禁止断言 `select.png` / `kind.png`）：

| sceneId | `files.zh` |
| --- | --- |
| `select` | `assets/stills/zh/select-open.png` |
| `multi` | `assets/stills/zh/comp-02.png` |
| `grouped` | `assets/stills/zh/comp-03.png` |
| `cascader` | `assets/stills/zh/comp-04.png` |
| `split` | `assets/stills/zh/comp-05.png` |
| `mega` | `assets/stills/zh/comp-06.png` |
| `date` | `assets/stills/zh/date-cal.png` |

**nav-taxonomy / sidebar-taxonomy**：stub 已在，`files` 是 `assets/stills/<locale>/<kind>.png`，**png 不在盘上** → `exists: false`。`isRenderable === false`。

**成片文件名**（`outputFiles[locale].rel`）：

| 片子 | zh | en |
| --- | --- | --- |
| intent-cascade | `assets/outputs/cursor-movement.mp4` | `assets/outputs/cursor-movement.en.mp4` |
| dropdown / nav / sidebar | `assets/outputs/source-tutorial.mp4` | `assets/outputs/source-tutorial.en.mp4` |

`assets/outputs/` gitignore，测试 **不要**断言 `outputFiles.*.exists === true`。

### 现网 `projectSummary`（保持原样）

```ts
{
  id, source, root, brand,
  task: filmTask(film),
  studySlug: filmStudySlug(film),
  locales, scenes, assets, titles
}
```

不要往这里塞 `paths` / `renderable`。

---

## 类型与函数签名

从设计 API 节原样复制。与现网 `ProjectRecord` / `Locale` / `filmTask` **无冲突**，不要改字段名。

```ts
// weaver/src/project-paths.ts

import fs from "node:fs";
import path from "node:path";
import type { ProjectRecord } from "./schema.ts";
import { filmStudySlug, filmTask } from "./schema.ts";
import {
  labUrl,
  libraryRoot,
  lightuiRoot,
  recipeRoot,
  weaverRoot,
} from "./paths.ts";
import { assetsPath, filmPath } from "./project.ts";
import {
  lineRelPath,
  outputRelPath,
  resolveAssetFile,
  stillRelPath,
} from "./assets.ts";

/** 项目外路径（brief.files）。不要依赖 rel。 */
export type PathEntry = { path: string; exists: boolean; rel?: string };

/** 项目内媒体。rel 必填，供 projectMedia(id, rel) / /api/media。 */
export type MediaPath = { path: string; exists: boolean; rel: string };

export type MediaFile = MediaPath & {
  sceneId: string;
  locale: string;
  ref?: string;
};

export type ProjectPaths = {
  projectRoot: string;
  film: string;
  assetsDoc: string;
  stillFiles: MediaFile[];
  lineFiles: MediaFile[];
  outputFiles: Record<string, MediaPath>;
  library: string;
  recipes: string; // join(recipeRoot(root), filmTask(film))
  labUrl?: string;
  publishDir?: string;
  brief:
    | { kind: "study"; root: string; files: Record<string, PathEntry> }
    | { kind: "project-brief"; files: { brief: PathEntry; briefEn: PathEntry } }
    | { kind: "hybrid"; root?: string; files: Record<string, PathEntry> };
};

export function projectPaths(
  project: ProjectRecord,
  root = weaverRoot(),
): ProjectPaths;
```

`stillRelPath` 只给「catalog 缺失」占位用。主路径禁止用它拼历史文件名。

### `paths.ts` 新增

与 `libraryRoot` 并列，签名照抄设计：

```ts
export function recipeRoot(root = weaverRoot()): string {
  if (process.env.LIGHTWEAVER_RECIPES) return path.resolve(process.env.LIGHTWEAVER_RECIPES);
  return path.join(root, "recipes");
}
```

- `LIGHTWEAVER_RECIPES` 只给测试夹具。空字符串当未设置（`if (process.env.LIGHTWEAVER_RECIPES)` 已是 falsy）。
- 覆盖时 **忽略** `root` 参数。
- 不 `mkdir`、不检查目录是否存在。

### `cli.ts` 形状

```ts
// project show（有无 --json 都是这个对象；现网 print() 对非 string 一律 JSON.stringify）
{
  ...projectSummary(project),
  film: project.film,
  assets: project.assets,
  paths: projectPaths(project, root),
  renderable: isRenderable(project, root),
}

// envelope（scene/card/voice/create --json）
{
  ok: true,
  project: projectSummary(project),
  film: project.film,
  issues: validateProject(project, root),
  paths: projectPaths(project, root),
}
```

`envelope` 加可选 `root = weaverRoot()`，与 `main` 里的 `root` 对齐。`isRenderable` 已在 `cli.ts` 第 6 行导入。

### `index.ts`

在现有 `export * from "./paths.ts"` / `"./project.ts"` / `"./assets.ts"` 旁加：

```ts
export * from "./project-paths.ts";
```

不要从 `project.ts` re-export。不要改 `FilmDoc`。

---

## 算法

`projectPaths` **只拼已知根 + `existsSync` 单个目标**。禁止 `readdir`、禁止扫 `assets/stills`、禁止读 LightUI markdown 正文。

内部辅助（不要导出）：

```ts
function posixRel(rel: string): string {
  return rel.replaceAll("\\", "/");
}

function entry(abs: string): PathEntry {
  return { path: abs, exists: fs.existsSync(abs) };
}

function media(abs: string, rel: string): MediaPath {
  return { path: abs, rel: posixRel(rel), exists: fs.existsSync(abs) };
}
```

`PathEntry` v1 **不填** `rel`。

`locales = Object.keys(project.film.locales)`（现网片子是 `zh` 然后 `en`，保持 key 顺序，不要 sort）。

### 1. 固定字段

```ts
const { film } = project;
const slug = filmStudySlug(film);
const task = filmTask(film); // 缺省 "study-explainer"

return {
  projectRoot: project.root,
  film: filmPath(project.root),
  assetsDoc: assetsPath(project.root),
  stillFiles: /* §2 */,
  lineFiles: /* §3 */,
  outputFiles: /* §4 */,
  library: libraryRoot(root),
  recipes: path.join(recipeRoot(root), task),
  labUrl: slug ? `${labUrl()}/s/${slug}` : undefined,
  publishDir: film.publish?.dir,
  brief: /* §5 */,
};
```

- `recipes` 即使仓库根还没有 `recipes/` 也返回该字符串。不要加 `exists`。
- `labUrl()` 现网是 host（默认 `http://127.0.0.1:5173`）。**在本模块**拼 `/s/<slug>`。无 slug 则省略整个键（或 `undefined`，`JSON.stringify` 会丢掉）。
- `publishDir` 无 `film.publish?.dir` 则省略。

### 2. `stillFiles`：每个 `kind === "still"` 场 × 每个 locale

顺序：`film.scenes` 原序，内层 `locales`。`title` / `close` 不进数组。`assets.json` 里多出来的 still（intent 的 `still.mobile`、dropdown 的 `comp-01` / `comp-07`）不进数组。

对每个 `(scene, locale)`：

```ts
const ref = scene.still;
const resolved = ref ? resolveAssetFile(project, ref, locale, root) : null;
if (resolved) {
  stillFiles.push({
    sceneId: scene.id,
    locale,
    ref,
    rel: posixRel(resolved.relPath),
    path: resolved.absPath,
    exists: fs.existsSync(resolved.absPath),
  });
  continue;
}
// catalog 缺失（种子 hero 未绑 still，或 ref 在 assets.json 里没有）
const fileId = ref
  ? (ref.match(/^asset:still\.(.+)$/)?.[1] ?? scene.id)
  : scene.id;
const rel = stillRelPath(`${fileId}.png`, locale); // name 自带 .png
stillFiles.push({
  sceneId: scene.id,
  locale,
  ...(ref ? { ref } : {}),
  rel,
  path: path.join(project.root, rel),
  exists: fs.existsSync(path.join(project.root, rel)),
});
```

硬规则：

1. `resolved` 非空时，`rel` **就是** `assets.json` 的 `files[locale]`（或 `file`）。intent `problem`/`zh` → `assets/stills/zh/desktop-full.png`。
2. **禁止**在 `resolved` 非空时用 `scene.id` / `kind.png` 覆盖。
3. `stillRelPath` **不**加 `.png`。占位分支必须传 `` `${fileId}.png` ``，否则会得到 `assets/stills/zh/hero`（无扩展名）——这是点名陷阱。
4. 未绑 `still` 的种子 `hero`：无 `ref`，`rel === "assets/stills/zh/hero.png"`（及 en），`exists` 几乎必为 `false`。

nav 的 stub **能** `resolveAssetFile`，走第一支，`exists: false`。不要误走占位支。

### 3. `lineFiles`：每个场景 × 每个 locale

含 title / still / close。**不**读 `assets.json` 的 `line.*` 条目。

```ts
for (const scene of film.scenes) {
  for (const locale of locales) {
    const rel = lineRelPath(scene.id, locale);
    lineFiles.push({
      sceneId: scene.id,
      locale,
      rel,
      path: path.join(project.root, rel),
      exists: fs.existsSync(path.join(project.root, rel)),
    });
  }
}
```

v1 **不**填 `ref`（设计示例没有；查找靠 `sceneId` + `locale`）。

intent 的 wav 已提交 → `exists: true`。nav/sidebar 无 wav → `exists: false`。

### 4. `outputFiles[locale]`

```ts
const outputFiles: Record<string, MediaPath> = {};
for (const locale of locales) {
  const file = film.locales[locale]?.output;
  if (!file) continue;
  const rel = outputRelPath(file);
  outputFiles[locale] = media(path.join(project.root, rel), rel);
}
```

不要另造 `outputExists`。

### 5. `brief.kind`

```ts
if (project.source === "first-party") {
  // study。slug 缺省回退 film.id（first-party 校验要求 id === slug）
} else if (slug) {
  // hybrid
} else {
  // project-brief
}
```

`createProject({ source: "user", studySlug })` 现网合法（`createFilm` 不要求 user 的 id === slug）→ 这就是 hybrid 夹具。

#### `kind: "study"`

```ts
const studyRoot = path.join(lightuiRoot(root), "studies", slug ?? film.id);
brief = {
  kind: "study",
  root: studyRoot,
  files: {
    idea:     entry(path.join(studyRoot, "idea.md")),
    ideaEn:   entry(path.join(studyRoot, "idea.en.md")),
    study:    entry(path.join(studyRoot, "study.json")),
    kinds:    entry(path.join(studyRoot, "src/lib/kinds.ts")),
    sourceMd: entry(path.join(studyRoot, "references/SOURCE.md")),
  },
};
```

intent-cascade **没有** `kinds.ts`（设计对象表）→ `files.kinds.exists === false`（LightUI 在或不在都是 false）。

#### `kind: "project-brief"`

```ts
brief = {
  kind: "project-brief",
  files: {
    brief:   entry(path.join(project.root, "brief.md")),
    briefEn: entry(path.join(project.root, "brief.en.md")),
  },
};
```

无 `root` 字段（类型就没有）。`createProject` 不写 brief 正文 → 新用户片 `exists === false`。

#### `kind: "hybrid"`

上两行并集。`root` 填 LightUI `studies/<slug>`（有 slug 就填）。

```ts
files = {
  ...studyFiles, // idea / ideaEn / study / kinds / sourceMd
  brief:   entry(path.join(project.root, "brief.md")),
  briefEn: entry(path.join(project.root, "brief.en.md")),
};
```

理念主源：agent 先读 LightUI idea（若 `exists`）；否则先写 `brief.md`。weaver **不**解析、**不**拷贝 idea。

LightUI 不在：`lightuiRoot()` 仍拼出绝对路径，五个 study 文件 `exists: false`。**永远不要** `requireLightuiRoot()`。

### 6. 明确不算的东西

| 不算 | 为什么 |
| --- | --- |
| `renderable` | 只在 `cli.ts`：`isRenderable(project, root)` |
| `hasErrors` / `Issue[]` | 那是 `validate` / `envelope.issues` |
| 旁白是否过期 | v1 由 agent 记账「本会话是否 scene set」；不写 hash |
| 仓库里有没有 `recipes/` | 只返回路径字符串 |

---

## 逐文件改动

### 1. `weaver/src/paths.ts`

在 `libraryRoot` 后插入 `recipeRoot`（见上）。不改其它 root。

### 2. `weaver/src/project-paths.ts`（新）

- 类型 + `projectPaths`，算法上一节。
- import：`schema`（类型 / `filmTask` / `filmStudySlug`）、`paths`、`project` 的 `filmPath`/`assetsPath`、`assets` 的 `resolveAssetFile`/`lineRelPath`/`outputRelPath`/`stillRelPath`。
- **禁止** import `validate.ts`、`scenes.ts`、`products/*`。
- 注释只写非显而易见约束，例如：`// LightUI 不在也拼路径，exists:false，不 throw`；`// rel 以 assets.json 为准，禁止从 scene.id 猜`。不要写实施过程。

### 3. `weaver/src/index.ts`

加 `export * from "./project-paths.ts";`。`recipeRoot` 已由 `export * from "./paths.ts"` 导出。

### 4. `weaver/src/cli.ts`

```ts
import { projectPaths } from "./project-paths.ts";

function envelope(project: ProjectRecord, root = weaverRoot()) {
  return {
    ok: true,
    project: projectSummary(project),
    film: project.film,
    issues: validateProject(project, root),
    paths: projectPaths(project, root),
  };
}
```

`main` 里所有 `envelope(project)` 改为 `envelope(project, root)`。

`project show`：

```ts
print({
  ...projectSummary(project),
  film: project.film,
  assets: project.assets,
  paths: projectPaths(project, root),
  renderable: isRenderable(project, root),
});
```

`project list` 仍 `listProjects(root).map(projectSummary)`。帮助文本 **不要**加 `weaver paths`。

### 5. `weaver/src/project-paths.test.ts`（新）

见「测试」。

### 6. `weaver/src/project.ts` / `assets.ts` / `validate.ts` / `schema.ts`

**零改动。** 测试读 `project.ts` 源码断言没有 `project-paths` / `assets` import。

### 7. `skills/lightweaver/SKILL.md`

保留现网表。保证有这一行（可加在 film 相关行旁）：

```
| 制作一部讲解片 / 选配方 / 从 study 出片 | **lightweaver-film** |
```

不要在路由器写阶段、结合规则、recipe 全文。现有「How to author a film」「Task type / 第三部片子」可留。

### 8. `skills/lightweaver-film/SKILL.md`

整文件按「Skill 文案约束」重写。删「Edit film.json only」时代的纯动词叙事（现网已是动词表；本 PR 换成存放图 + 结合规则 + 短动词）。

### 9. `skills/lightweaver-film/references/{pipeline,modes,qa}.md`（新）

只抄本规格「Skill」里的 PR1 表。目录现网不存在，一并新建。

### 10. `skills/lightweaver-assets/SKILL.md`

动词表不动。文末加一句：

> 制作循环中的 still 入库由 film skill 在阶段 4 调用本 skill，不要在这里教叙事。

### 11. `README.md`

第一路径改为 agent + `project show`。Studio 降为复核。不要写 `recipe list`/`apply`。建议把「怎么用」改成：

```markdown
## 怎么用

Agent 主路径：按存放图结合出片。先发现三层路径，再跑 weaver。

```bash
npx weaver project list --json
npx weaver project show <id> --json   # paths + renderable
```

Studio 是复核面（改词、补静帧、看 issue）：

```bash
make install
make studio          # http://127.0.0.1:5175/
make remotion        # Remotion 预览
```
```

目录树可补一句 Agent 入口已有。不要在本 PR 把 `recipes/` 写进永久目录树（目录还不存在；那是 PR5 / PR2）。

### 12. 不改

`products/studio/**`、`docs/conventions.md`、`weaver/AGENTS.md`、`docs/design-*.md`、四则 `film.json`/`assets.json`、`scenes.ts`。

---

## Skill / README 文案约束（PR1 措辞）

抄表时 **必须带 PR1 行**。评审用字符串扫描；写了 PR2/PR3 动词即不合格。

### 全 skill 树禁串（本 PR 提交的每个 md）

禁止出现这些子串（大小写不敏感也算）：

- `weaver recipe`
- `recipe list`
- `recipe show`
- `recipe apply`
- `recipes/study-explainer/index.md`

允许：结构名 `problem-then-rule` / `taxonomy-parade` 当**口语**（对照哪部 first-party 片）。允许一句「方法资产 `recipes/study-explainer/` 是 PR2 才提交」——但 **不要**链 `index.md`，不要教 list/show。

### `skills/lightweaver-film/SKILL.md` 目标结构

正文保持短。建议 frontmatter：

```yaml
name: lightweaver-film
description: >
  Produce a LightWeaver study-explainer film: pick a mode, match a
  first-party film.json structure, write bilingual narration, fill
  FilmDoc via weaver CLI. Use when the user wants a LightUI study
  film, or says 讲解片 / 出片.
```

（不要在 description 里写 `recipe list`。）

必须有这些节：

1. **存放图（约定路径，写在正文）**

   - first-party 理念：`$LIGHTUI_ROOT/studies/<slug>/idea.md`（及 `idea.en.md` / `study.json`；taxonomy 另有 `kinds.ts`；intent-cascade **没有** kinds.ts）
   - 用户片理念：`data/projects/<id>/brief.md`
   - 资产：`library/`；`<project>/assets.json` + `assets/stills/<locale>/`（**文件名以 assets.json 为准**）
   - 产物：`assets/lines/<locale>/*.wav`；`assets/outputs/<output>`（gitignore）
   - 方法：PR1 对照 first-party `film.json`（intent = 问题-规则；dropdown / nav / sidebar = 一种 kind 一场）。PR2 才有 `recipes/study-explainer/`
   - 发现：`weaver project show --json` → `paths.stillFiles` / `lineFiles` / `outputFiles` / `brief` 与同级 `renderable`

2. **结合规则**（照抄，字段名必须是 show JSON 里那些）

   | 判据 | 动作 |
   | --- | --- |
   | `hasErrors(validate)` | **停全部生成**：不准 tts / render / capture。先修 FilmDoc |
   | `!hasErrors` 且 `!isRenderable`（引用在、png 缺） | 允许 `tts`。**禁止** `render --project` |
   | `capture.kind === "lightui-lab"` 且 slug ∈ ADAPTERS 且某 `stillFiles` `exists === false` | `weaver capture --project` |
   | `capture.kind === "manual"` 且 png 缺 | **停**。手截到 `assets.json` 已登记路径。**禁止** `weaver capture` |
   | 某 `lineFiles` `exists === false` | `tts --project`（可 `--scene`） |
   | wav 在且本会话未对该 scene `scene set --text` | **复用 wav** |
   | wav 在但本会话刚 `scene set --text` | `tts --project --scene <id>`。v1 不写文本哈希 |
   | `isRenderable` 且 `outputFiles[locale].exists` 且本会话未改旁白 / 未换 still | **不** render。要发布且目标缺 → 只 `publish` |
   | `isRenderable` 且 output 缺，或本会话刚 tts / 换了 png | `render --project` |
   | 无 `publish.dir` | 只写 `assets/outputs/`；不要 `publish` |
   | `brief.kind=project-brief` 且 `brief.files.brief.exists === false` | 先写 `brief.md`，再写 lines |
   | first-party 旁白已按 idea.md 写好（nav/sidebar） | **不要**重写 lines。只补资产与产物 |

3. **先判模式**（细节链 `references/modes.md`）：`template` / `from-study` / `co-create`。未选就停。点名「按 dropdown / intent 那套」视为已选 `template`。

4. **十条原则**（正文只留原则）

   1. 按图存放。理念跟主题走；资产 `library:` / `asset:`；产物进 `assets/lines` 与 `assets/outputs`。不发明顶层目录，不把产物写进理念目录，不把 `idea.md` 拷进片子。
   2. 脚本即片子。`film.json` 是编排合同。不手写 Remotion TSX。
   3. 一种 LightUI kind 一场 still。禁止合并。
   4. 真 lab 静帧。不要手绘假 UI。
   5. 双语成对写完再 TTS。
   6. 先形状后媒体；能复用就不重生。`validate` error 未清不得交付；`!isRenderable` 不得 `render`。
   7. 先名称 / 场景 / 规则，再谈外观。
   8. 不发明 scene kind。只能 `title | still | close`。
   9. 模式未定就停。缺静帧且无 adapter 就停。不要空转 `capture`。
   10. 确定性 job。weaver 内无模型。

5. **何时读哪个文件**

   | 时机 | 读 |
   | --- | --- |
   | 找齐三层 | 先按存放图；再 `weaver project show --json` |
   | 选卡 | **对照 first-party `film.json`**：intent-cascade → 问题-规则（title → problem → rule/contrast stills → close）；dropdown / nav / sidebar → 一种 kind 一场。**不要**打开还不存在的 recipe 索引 |
   | 展开骨架 | `project create` + `scene add` / `scene rm --id hero` |
   | 手截 | `docs/conventions.md` |
   | QA | `references/qa.md` |
   | 阶段表 | `references/pipeline.md` |
   | 资产入库 | 切到 lightweaver-assets |

6. **动词（短）**：现网 CLI 列表，加上 `project show --json`。注明写操作 `--json` 信封现在是 `{ ok, project, film, issues, paths }`。不要解释叙事。

### `references/pipeline.md`（必须用 PR1 行）

结构怎么选：

| | 阶段 1 抽卡 | 阶段 2 展开骨架 |
| --- | --- | --- |
| **PR1** | 对照 first-party `film.json`：intent-cascade → 问题-规则；dropdown / nav / sidebar → 一种 kind 一场 | `project create` + `scene add` / `scene rm --id hero`。**没有** recipe 命令 |

阶段 0–7（weaver 动词列用 PR1）：

| 阶段 | 名称 | 谁做 | weaver 动词 | 产出 |
| --- | --- | --- | --- | --- |
| 0 | Brief | Agent 只读理念 | `project show` → `paths.brief` | 读 idea/study/kinds/SOURCE；用户片读或先写 `brief.md`。输出名来自 SOURCE.md，不猜 |
| 1 | Recipe | Agent 抽卡 | **对照 first-party `film.json`** | 选定问题-规则或对照表阅兵 |
| 2 | Structure | Agent 调 CLI | **`project create` + `scene add`/`rm`** | 无 `hero` 的场景列表 + still stub |
| 3 | Script | Agent 写文案 | `scene set` / `card set` | 双语旁白。必须替换 `addScene` 的 id 占位 |
| 4 | Stills | Agent 或人 | 仅 lab+adapter 时 `capture --project`；manual 只手截 + `asset add` | `assets.json` 登记的 png |
| 5 | Voice | Job | `tts --project`（允许缺 png） | `assets/lines/{zh,en}/*.wav` |
| 6 | QA | Agent 必跑 | `validate --json`；读 `renderable` | error 或 `!isRenderable` → 不得进 7 的 render |
| 7 | Deliver | Job | `render --project`；有 `publish.dir` 才 `publish` | `assets/outputs/<output>` |

本文件禁止出现 `recipe list` / `recipe show` / `recipe apply`。

### `references/modes.md`（必须用 PR1 行）

必须停：

| 条件 | 问什么 |
| --- | --- |
| 没选模式，也没点名 canon 片 | 三种模式 + 推荐一句 |
| 找不到 `study.json` 且用户片没有 `brief.md` | slug 是否错、是否先写 `brief.md` |
| **四则 first-party `film.json` 对不上用户要的形状** | 是新形状（先 `co-create`）还是硬套 |
| `capture.kind=manual` 且 png 不在 | 手截；**不要** `weaver capture` |
| `hasErrors(validate)` | 先修形状。停全部生成 |
| 将要 render 且 `!isRenderable` | 列出缺的 png；禁止 render。仅缺 png 仍可 tts |
| first-party 且 SOURCE.md 点名的 output 与 `locales.*.output` 不一致 | 用手写 `--output` 修正；禁止按 slug 猜 `nav-taxonomy.mp4` |
| 用户要把 kind 合并成一场 | 拒绝 |

直接跑：`project create`（参数齐）、`scene add`（结构已定）、`scene set` / `card set`（模式允许时）、`validate`、`tts`（仅 `!hasErrors`）、`capture`（仅 lab+adapter）、`render`（当且仅当 `isRenderable`）、`publish`（当且仅当 `publish.dir` 且 `outputFiles[locale].exists`）。

「对不上结构」这一行必须是 **film.json**，禁止写成 `recipe list` 对不上。

### `references/qa.md`

抄设计 Q1–Q10。前 5 条是去 **读** weaver 已有校验，不要在 agent 里重写一套。Q9 证据写 `project show` 的 `renderable` 或 `isRenderable`。本文件本来就没有 recipe CLI，保持这样。

### README

第一句用法不再是单独的 `make studio`。必须出现 `weaver project show` 与 `paths`。Studio 写成复核。禁止 recipe CLI。

---

## 测试

文件：`weaver/src/project-paths.test.ts`。风格对齐 `project.test.ts` / `scenes.test.ts`：`node:test` + `node:assert/strict`，临时根用 `mkdtempSync` + 空 `library/assets.json`。

`isRenderable` **只在测试里**从 `validate.ts` 导入，证明 nav 不可渲；不要为了测它去改 `project-paths.ts`。

### 夹具辅助

```ts
function tempRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "weaver-"));
  fs.mkdirSync(path.join(root, "library"), { recursive: true });
  fs.writeFileSync(path.join(root, "library/assets.json"), `${JSON.stringify({ assets: [] })}\n`);
  return root;
}
```

CLI show 用 `spawnSync`：cwd = `weaver/`（测试从这里跑），`weaverRoot()` 仍是仓根。

```ts
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const weaverSrc = path.dirname(fileURLToPath(import.meta.url));
const weaverPkg = path.resolve(weaverSrc, "..");

function showJson(id: string) {
  const r = spawnSync(
    process.execPath,
    ["--import", "tsx", "src/cli.ts", "project", "show", id, "--json"],
    { cwd: weaverPkg, encoding: "utf8" },
  );
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout);
}
```

### 必须用例

**1. intent-cascade（真 first-party，不要自己建）**

```ts
const project = loadProject("intent-cascade");
const paths = projectPaths(project);
assert.equal(paths.brief.kind, "study");
assert.equal(paths.brief.files.kinds.exists, false);
const problemZh = paths.stillFiles.find((f) => f.sceneId === "problem" && f.locale === "zh");
assert.ok(problemZh);
assert.equal(problemZh.rel, "assets/stills/zh/desktop-full.png");
assert.equal(problemZh.ref, "asset:still.problem");
assert.equal(problemZh.exists, true);
assert.ok(problemZh.path.endsWith("assets/stills/zh/desktop-full.png"));
```

加钉：

- `stillFiles` **没有** `sceneId === "mobile"`（资产有、场没有）。
- `stillFiles.filter(f => f.sceneId === "problem").length === 2`（zh+en）。
- `lineFiles.find(title+zh).rel === "assets/lines/zh/title.wav"` 且 `exists === true`。
- `outputFiles.zh.rel === "assets/outputs/cursor-movement.mp4"`；`outputFiles.en.rel === "assets/outputs/cursor-movement.en.mp4"`。
- `paths.recipes` === `path.join(recipeRoot(), "study-explainer")`。
- `paths.labUrl === `${labUrl()}/s/intent-cascade``（默认 `http://127.0.0.1:5173/s/intent-cascade`）。
- `paths.publishDir === "studies/intent-cascade/references"`。
- `paths.film === filmPath(project.root)`；`paths.assetsDoc === assetsPath(project.root)`。
- **不要**断言 `brief.files.idea.exists === true`（本机可能没有 LightUI）。

**2. dropdown：名字来自 assets.json，不是 kind.png**

```ts
const project = loadProject("dropdown-taxonomy");
const paths = projectPaths(project);
const rel = (id: string) =>
  paths.stillFiles.find((f) => f.sceneId === id && f.locale === "zh")?.rel;
assert.equal(rel("select"), "assets/stills/zh/select-open.png");
assert.equal(rel("multi"), "assets/stills/zh/comp-02.png");
assert.equal(rel("date"), "assets/stills/zh/date-cal.png");
assert.notEqual(rel("select"), "assets/stills/zh/select.png");
assert.ok(paths.stillFiles.every((f) => !f.rel.endsWith(`/${f.sceneId}.png`) || f.sceneId === "never"));
```

最后一条若觉得脆：至少 `select` / `multi` / `date` 三个历史名 + `notEqual(..., kind.png)`。

**3. nav-taxonomy：png 不存在，renderable false**

```ts
const project = loadProject("nav-taxonomy");
const paths = projectPaths(project);
assert.equal(paths.brief.kind, "study");
const pngs = paths.stillFiles.filter((f) => f.rel.endsWith(".png"));
assert.ok(pngs.length >= 18); // 9 kind × 2 locale
assert.ok(pngs.every((f) => f.exists === false));
assert.equal(isRenderable(project), false);
assert.equal(relOf(paths, "floating", "zh"), "assets/stills/zh/floating.png");
```

`lineFiles` 全 `exists === false`（无 wav）可作附加断言。`outputFiles.zh.rel === "assets/outputs/source-tutorial.mp4"`。

sidebar 不强制，做了更好。

**4. 用户片无 slug → `project-brief`**

```ts
const project = createProject("demo-film", { title: "演示" }, tempRoot());
const paths = projectPaths(project, /* 同一个 temp root */);
assert.equal(paths.brief.kind, "project-brief");
assert.equal(paths.brief.files.brief.exists, false);
assert.equal(paths.brief.files.briefEn.exists, false);
assert.ok(paths.brief.files.brief.path.endsWith(`${path.sep}brief.md`));
assert.equal("root" in paths.brief, false);
assert.equal(paths.labUrl, undefined);
assert.equal(paths.publishDir, undefined);
// 种子 hero 未绑 still
const heroZh = paths.stillFiles.find((f) => f.sceneId === "hero" && f.locale === "zh");
assert.equal(heroZh?.exists, false);
assert.equal(heroZh?.ref, undefined);
assert.equal(heroZh?.rel, "assets/stills/zh/hero.png");
```

`createProject` 的第三参是 weaver `root`，必须传 tempRoot，否则会写进真 `data/projects/`。

**5. hybrid：`createProject` + user + studySlug**

```ts
const root = tempRoot();
const project = createProject(
  "user-intent",
  { source: "user", studySlug: "intent-cascade" },
  root,
);
const paths = projectPaths(project, root);
assert.equal(project.source, "user");
assert.equal(project.film.study?.slug, "intent-cascade");
assert.equal(paths.brief.kind, "hybrid");
assert.ok(paths.brief.files.idea.path.includes(`${path.join("studies", "intent-cascade", "idea.md")}`));
assert.equal(paths.brief.files.kinds.exists, false);
assert.equal(paths.brief.files.brief.exists, false);
assert.ok(paths.brief.files.brief.path.endsWith(`${path.sep}brief.md`));
assert.ok(paths.labUrl?.endsWith("/s/intent-cascade"));
```

现网 `createFilm` 允许这个组合，不必改 `createProject`。

**6. `recipeRoot` 默认 + env**

```ts
assert.equal(recipeRoot("/ws"), path.join("/ws", "recipes"));
assert.equal(recipeRoot(), path.join(weaverRoot(), "recipes"));

const prev = process.env.LIGHTWEAVER_RECIPES;
process.env.LIGHTWEAVER_RECIPES = "/tmp/lw-recipes-fixture";
try {
  assert.equal(recipeRoot("/ignored"), path.resolve("/tmp/lw-recipes-fixture"));
  const p = projectPaths(loadProject("intent-cascade"));
  assert.equal(p.recipes, path.join(path.resolve("/tmp/lw-recipes-fixture"), "study-explainer"));
} finally {
  if (prev === undefined) delete process.env.LIGHTWEAVER_RECIPES;
  else process.env.LIGHTWEAVER_RECIPES = prev;
}
```

必须 `try/finally` 还原，避免污染其它测试。

**7. 无 import 环**

```ts
const projectSrc = fs.readFileSync(path.join(weaverSrc, "project.ts"), "utf8");
assert.equal(/from ["']\.\/project-paths/.test(projectSrc), false);
assert.equal(/from ["']\.\/assets/.test(projectSrc), false);

const pathsSrc = fs.readFileSync(path.join(weaverSrc, "project-paths.ts"), "utf8");
assert.equal(/from ["']\.\/validate/.test(pathsSrc), false);
```

**8. CLI `project show --json` 形状（同文件）**

```ts
const shown = showJson("nav-taxonomy");
assert.equal(shown.id, "nav-taxonomy");
assert.equal(shown.task, "study-explainer");
assert.equal(typeof shown.renderable, "boolean");
assert.equal(shown.renderable, false);
assert.ok(shown.paths);
assert.ok(Array.isArray(shown.paths.stillFiles));
assert.ok(shown.film);
assert.ok(Array.isArray(shown.assets));
assert.equal(shown.project, undefined); // 不是 envelope，不要包一层 project
assert.equal(shown.paths.renderable, undefined);

const listed = /* spawn project list --json */;
assert.ok(Array.isArray(listed));
assert.equal(listed[0].paths, undefined);
assert.equal(listed[0].renderable, undefined);
```

**9. Skill PR1 禁串（防把 PR2 写进来）**

读 `skills/lightweaver-film/SKILL.md` 与 `references/{pipeline,modes,qa}.md`（路径相对 `weaverRoot()`）：

```ts
for (const rel of [
  "skills/lightweaver-film/SKILL.md",
  "skills/lightweaver-film/references/pipeline.md",
  "skills/lightweaver-film/references/modes.md",
  "skills/lightweaver-film/references/qa.md",
]) {
  const text = fs.readFileSync(path.join(weaverRoot(), rel), "utf8");
  assert.doesNotMatch(text, /weaver recipe/i);
  assert.doesNotMatch(text, /recipe list/i);
  assert.doesNotMatch(text, /recipe show/i);
  assert.doesNotMatch(text, /recipe apply/i);
  assert.doesNotMatch(text, /recipes\/study-explainer\/index\.md/);
}
```

`SKILL.md` 正向：必须出现 `project show` 与 `paths.stillFiles`（或 `` `paths` `` + `stillFiles`）。

### 不要测

- LightUI 正文是否存在。
- `outputFiles.exists === true`。
- Studio GET。
- `envelope.skipped` / `envelope.renderable`。

---

## 实施步骤

本 PR 内顺序（每步应能 typecheck；测可从第 3 步开始写）：

1. **`recipeRoot`** 进 `paths.ts`。可先写下用例 6 的一半。
2. **`project-paths.ts`** 类型 + `projectPaths`。只拼路径，不碰 CLI。
3. **`index.ts`** `export *`。确认 `tsc` 吃到新文件。
4. **单测 1–7**：intent / dropdown / nav / user / hybrid / recipeRoot / 环。先让函数绿。
5. **`cli.ts`**：`envelope` 加 `paths` + `root`；`project show` 加 `paths` 与 `renderable`。
6. **单测 8**：spawn `project show` / `list`。
7. **Skill + README**（PR1 措辞）。然后单测 9。
8. **`make typecheck` && `make test`**。
9. 自审陷阱清单后再提 PR。

不要先写 skill 再写函数——发现 JSON 是 skill 教的契约，测锁不住的文案不要当第一刀。

---

## 验收

- [ ] `projectPaths` 在 `weaver/src/project-paths.ts`，不在 `project.ts`。
- [ ] 该文件 import `resolveAssetFile` / `lineRelPath` / `outputRelPath`，不 import `validate.ts`。
- [ ] `project.ts` 不 import `project-paths` 或 `assets`。
- [ ] `recipeRoot()` 默认 `join(root, "recipes")`；`LIGHTWEAVER_RECIPES` 覆盖为 `path.resolve`。
- [ ] `paths.recipes === join(recipeRoot(root), filmTask(film))`，即使没有 `recipes/` 目录。
- [ ] intent：`brief.kind === "study"`，`kinds.exists === false`，`stillFiles` 的 problem/zh `rel === "assets/stills/zh/desktop-full.png"`。
- [ ] dropdown：select/multi/date 的 `rel` 是 `select-open` / `comp-02` / `date-cal`，不是 `select.png`。
- [ ] nav：still png 全 `exists: false`；`isRenderable === false`；show JSON 同级 `renderable: false`。
- [ ] 无 slug 用户片：`brief.kind === "project-brief"`。
- [ ] `createProject(..., { source: "user", studySlug })`：`brief.kind === "hybrid"`。
- [ ] LightUI 缺失不 throw。
- [ ] `project show --json` = `{ ...projectSummary, film, assets, paths, renderable }`。
- [ ] `envelope` = `{ ok, project: projectSummary, film, issues, paths }`，无 `renderable`。
- [ ] `project list` 仍轻，无 `paths` / `renderable`。
- [ ] `index.ts` 导出 `projectPaths`、`PathEntry`、`MediaPath`、`MediaFile`、`ProjectPaths`、`recipeRoot`。
- [ ] 路由器有「制作一部讲解片 / 选配方 / 从 study 出片 → lightweaver-film」。
- [ ] film skill 正文有存放图 + 结合规则；选卡 = first-party `film.json`；展开 = `scene add`。
- [ ] film skill 与 `references/*` 无 recipe CLI、无 `index.md` 链接。
- [ ] `references/pipeline.md` 阶段 1/2 是 film.json + `scene add`。
- [ ] assets skill 有「阶段 4 调用、不教叙事」一句。
- [ ] README 第一路径含 agent + `project show`。
- [ ] 无 `weaver paths`、无 `outputExists`、无 `FilmDoc` 变更、无 Studio 改动、无 `recipes/` 文件。
- [ ] `make typecheck` 与 `make test` 通过。

---

## 陷阱

1. **`stillRelPath` 不追加 `.png`。** `stillRelPath("problem", "zh")` → `assets/stills/zh/problem`。主路径必须用 `resolveAssetFile`。占位支必须传 `` `${fileId}.png` ``。
2. **不要从 scene id 猜静帧名。** intent 的 `problem` 不是 `problem.png`，是 `desktop-full.png`。dropdown 的 `select` 是 `select-open.png`。这是本 PR 最容易写错的一行。
3. **不要扫仓库。** 没有 `readdir(assets/stills)`、没有「找所有 png」。数组长度由 `film.scenes` × `locales` 决定。多余资产（`still.mobile`）不准混进 `stillFiles`。
4. **不要加 `weaver paths`。** 发现面挂在已有 `project show`。帮助文本也不要提。
5. **不要加 `outputExists`。** 用 `paths.outputFiles[locale].exists`。
6. **不要把 `renderable` 放进 `projectPaths()` 或 `projectSummary`。** 只在 `cli.ts` 调 `isRenderable`。`envelope` 也不要 `renderable`（那不是 show）。
7. **不要把模块放进 `project.ts`。** `assets.ts → saveAssets ← project.ts` 已经占了一条边。
8. **不要 `requireLightuiRoot()`。** TaskModule 与本模块同一条禁令。
9. **不要在 PR1 skill 写 `recipe list` / `show` / `apply` 或链 `recipes/study-explainer/index.md`。** pipeline / modes 必须是「对照 film.json + scene add」。
10. **不要改 Studio。** GET 加 `paths` 是 PR4。现网 `detailOf.renderable` 维持原样。
11. **不要 `mkdir recipes/` 或提交空 stub。** `paths.recipes` 只是字符串。
12. **测试必须还原 `LIGHTWEAVER_RECIPES`。** 否则后续 `loadProject` 的 `recipes` 断言会红。
13. **hybrid 用 `source: "user"` + `studySlug`，不要改 first-party 目录。** 写进 `tempRoot()` 的 `data/projects/`。
14. **`lineFiles` 不要走 `resolveAssetFile`。** 一律 `lineRelPath`。否则没登记过的 wav（nav）会丢条目。
15. **`rel` 用 posix。** 比较字符串时写死 `/`，不要 `path.join` 出 `rel`（Windows 会变成 `assets\\stills\\...`）。`path`（绝对）才用 `path.join`。

---

### Critical Files for Implementation
- `weaver/src/project-paths.ts` — New module: types + `projectPaths` algorithm
- `weaver/src/cli.ts` — `project show` payload and `envelope()` grow `paths`; show-only `renderable`
- `weaver/src/paths.ts` — Add `recipeRoot()` beside `libraryRoot`
- `weaver/src/assets.ts` — Import surface: `resolveAssetFile` / `lineRelPath` / `outputRelPath` / `stillRelPath`
- `skills/lightweaver-film/SKILL.md` — PR1 production skill: 存放图 + 结合规则; discovery = `project show` paths
