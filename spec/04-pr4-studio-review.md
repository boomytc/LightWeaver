# 04 · PR4 Studio 复核面

| 字段 | 值 |
| --- | --- |
| 规格 | `spec/04-pr4-studio-review.md` |
| 对应 | [`docs/design-placement-contract.md`](../docs/design-placement-contract.md) **P3** +「Studio 怎么改」+ PR Plan **PR4** |
| 标题 | `feat(studio): review surface using projectMedia and paths.exists` |
| 依赖 | **PR1**（`weaver/src/project-paths.ts` 导出 `projectPaths`，且 `@lightweaver/weaver` `index.ts` 再导出）。PR2 / PR3 **不是**本 PR 依赖 |
| 不改 | `FilmDoc`、`weaver/` 核、recipe CLI、Remotion、LightUI 源码、根 `README.md`（那是 PR1 / PR5） |

---

## 范围 / 非目标

### 范围

产品故事从「打开工作台改 JSON」改成 **复核面**。实现只动 `products/studio/`：

1. **`detailOf` 附上 `paths`。** `GET /api/projects/:id` 以及所有已经走 `detailOf` 的写回（创建、scene CRUD、card、voice）同级带 `paths: projectPaths(project, root)`。`issues` / `renderable` 已经在，保持原算法：`validateProject` / `isRenderable`，**不要**在 `projectPaths` 里重算 `renderable`。
2. **客户端类型**跟上 `paths`（镜像 weaver 的 `ProjectPaths` / `MediaPath` / `MediaFile` / `PathEntry`）。
3. **预览栏：** `paths.outputFiles[locale].exists === true` 时用现成 `/api/media` 播 mp4；`exists === false` 维持今日静帧 `<img>`。绝对磁盘路径只作可复制纯文本。
4. **复核一行：** 无条件展示 `可渲 / 不可渲` + 当前 locale 缺 png 的 scene id。已有 issues 列表保留。
5. **文案：** 顶栏、侧栏「新建」副文案、`products/studio/README.md`、`products/studio/AGENTS.md`。句子按设计原文：**片子由 agent 经 weaver 写；这里复核、改词、补静帧。**
6. **测：** 扩展现有 `server/paths.test.ts`（`safeJoin` 允许 `assets/outputs/…`、拒绝穿越）。没有 HTTP 集成测；本规格给桌面复核清单。

CRUD **零删除**：加场、删场、调序、绑 still、改 fit/role、改旁白、改 title/close 卡、选音色、上传、校验、TTS job、render job、有 `publish.dir` 才出现的发布按钮，全部留下。Studio「新建」仍只写 `data/projects/`、忽略 source（D6）。First-party 仍只走 CLI。

### 非目标

| 禁止 | 理由 |
| --- | --- |
| 新字段 `outputExists` / `output.exists` 平行于 `paths` | P14：成片只看 `paths.outputFiles[locale].exists` |
| 改 `/api/media` 路由、换静态目录、绕过 `safeJoin` | 现网已能侍 gitignore 的 `assets/outputs/` |
| `import` Remotion / `@remotion/player` / LightUI 源码 | `products/studio/AGENTS.md` 与 P2 / P3 |
| lab `<iframe>`、`<a href>` 打开 lab、Remotion Player | D13：lab URL 纯文本 |
| 「生成旁白 / AI 写旁白 / 一键写旁白」按钮或 `/api/generate` | P6；旁白由 agent `scene set`。顶栏「合成旁白」是 **TTS job**，留下 |
| 新 job type、capture 按钮、publish 改成异步 job | 核已拍板 |
| 在 Studio 调 `listRecipes` / `applyRecipe` | 设计：Studio v1 不调 recipe API |
| 改 `FilmDoc`、加 `film.recipeId`、改 weaver 校验 | 本 PR 只是检视面 |
| 把 `projectPaths` 拷进 `server/` 或塞进 `project.ts` | 用 PR1 模块；循环禁令仍在 |
| 扫盘、自己 `existsSync` 成片 | 信任 `paths`；存在性只在 weaver `projectPaths` 里算一次 |
| 根 README / skill / `recipes/` | PR1 / PR2 / PR5 |
| nav/sidebar 补 png + 出片 | Q-media = M2，不是本 PR |

并行关系：PR4 可与 PR2 并行（都只依赖 PR1）。不要在本 PR 里预写 `recipe apply` 文案。

---

## 现网锚点

对照后再改，避免把已落地的 CRUD 拆掉。

### 服务端

[`products/studio/server/index.ts`](../products/studio/server/index.ts)：

- 已从 `@lightweaver/weaver` 引入 `isRenderable`、`validateProject`、`loadProject`、`projectSummary` 等。**没有** `projectPaths`（等 PR1 导出）。
- `detailOf`（约 366–374 行）已返回 `{ ...projectSummary, film, assets, issues, renderable }`。`GET /api/projects/:id`、`POST /api/projects`、scene add/delete/move/patch、card、voice 都走它。
- `PUT /api/projects/:id/film` **不**走 `detailOf`，只回 `{ film, issues, renderable }`。客户端 `api.ts` **没有**封装这条。本 PR **不要**给它加 `outputExists`；也不必为了对称强行改成 `detailOf`（逃生舱，无人点）。
- `GET /api/projects` 仍是 `listProjects(root).map(projectSummary)`，**不加** `paths`（list 保持轻）。
- `POST /api/jobs` 仍只允许 `tts | render`；`render` 已用 `isRenderable` 挡。
- **没有**任何 Remotion / LightUI import。保持。

### `/api/media`（本 PR 不改实现，只确认能播 gitignore 的 mp4）

路由已在：

```244:257:products/studio/server/index.ts
app.get("/api/media/project/:id/*path", (req, res) => {
  try {
    const project = loadProject(param(req.params.id), root);
    const rel = req.params.path;
    const file = safeJoin(project.root, Array.isArray(rel) ? rel.join("/") : String(rel ?? ""));
    if (!fs.existsSync(file)) {
      res.status(404).end();
      return;
    }
    res.sendFile(file);
  } catch (error) {
    res.status(400).json({ error: messageOf(error) });
  }
});
```

配套：

```81:87:products/studio/src/api.ts
export function libraryMedia(file: string): string {
  return `/api/media/library/${file}`;
}

export function projectMedia(projectId: string, file: string): string {
  return `/api/media/project/${encodeURIComponent(projectId)}/${file}`;
}
```

静帧已经这样走：`stillPreviewSrc` 用 `projectMedia(detail.id, asset.files[locale])`。成片同一函数，`file` = `paths.outputFiles[locale].rel`（例如 `assets/outputs/cursor-movement.mp4`）。

链路：

1. Vite [`vite.config.ts`](../products/studio/vite.config.ts) 把 `/api` 代理到 `127.0.0.1:8788`。
2. Express 5 通配 `*path`：`req.params.path` 可能是 `string` 或 `string[]`。现码已 `Array.isArray ? join("/")`。`projectMedia` **只** `encodeURIComponent` 项目 id，**不要**把 `rel` 整段 encode（否则 `/` 变 `%2F`，通配对不上）。与今日静帧同一约定。
3. `safeJoin(project.root, rel)`（[`server/safePath.ts`](../products/studio/server/safePath.ts)）把解析结果锁在项目根内；`../` → 抛「路径越界」→ 400。
4. `fs.existsSync` + `res.sendFile`。`.gitignore` 的 `**/assets/outputs/` **只影响 git**，不影响 Node 读盘。渲完的 mp4 只要在 `<project.root>/assets/outputs/<locales.*.output>`，就能被侍出。`sendFile` 按 `.mp4` 设 `Content-Type`，并支持 Range（`<video>` 可拖进度）。

first-party 成片文件名（只是 `locales.*.output`，不是路径）：

| 项目 | zh | en |
| --- | --- | --- |
| `intent-cascade` | `cursor-movement.mp4` | `cursor-movement.en.mp4` |
| `dropdown-taxonomy` / `nav-taxonomy` / `sidebar-taxonomy` | `source-tutorial.mp4` | `source-tutorial.en.mp4` |

对应 `rel` = `assets/outputs/<output>`（与 `weaver/src/assets.ts` `outputRelPath` 同形）。仓内默认 **没有** 这些文件（gitignore）；未渲过则 `exists: false`，UI 走静帧。

### 客户端

- [`App.tsx`](../products/studio/src/App.tsx)：顶栏校验 / 合成旁白 / 渲染 / 发布；侧栏项目列表 +「新建项目」+「创建到 data/projects」；主栏 `StudyExplainerPane` 或资产；预览栏 `stillPreviewSrc` → `<img>`；`canRender = detail.renderable`。
- [`tasks/study-explainer.tsx`](../products/studio/src/tasks/study-explainer.tsx)：有 `studySlug` 时 **纯文本** `lab · http://127.0.0.1:5173/s/{slug}`（已是 `<p className="item-meta">`，不是链接）。场景增删改序、绑 still、卡片、旁白 textarea `onBlur` PATCH。`stillPreviewSrc` 已用 `projectMedia`。
- [`types.ts`](../products/studio/src/types.ts)：`ProjectDetail` 有 `issues` + `renderable`，无 `paths`。浏览器侧 **不** import `@lightweaver/weaver`（现网就是手写镜像类型）。本 PR 继续镜像，不要为了省事在 `src/` 引 weaver。
- 预览 CSS：`.preview-frame img { width: 100%; display: block; }`，没有 `video` 规则。`@media (max-width: 1100px)` 会藏掉整个 `.preview`——桌面验收必须用宽窗。

### 测试

[`products/studio/package.json`](../products/studio/package.json) `"test": "tsx --test server/paths.test.ts"`。全仓 `npm test` 会跑它。**没有** Express / React 测试。现测只锁 `safeJoin` 允许嵌套、拒绝 `../secret`。

---

## detailOf / 类型

### 服务端

`server/index.ts` 增加：

```ts
import {
  // …现有
  projectPaths,
} from "@lightweaver/weaver";
```

**禁止**再 import `products/study-films`、`remotion`、LightUI。**禁止**在 Studio 里实现第二份 `projectPaths`。

```ts
function detailOf(project: ReturnType<typeof loadProject>) {
  return {
    ...projectSummary(project),
    film: project.film,
    assets: project.assets,
    issues: validateProject(project, root),
    renderable: isRenderable(project, root),
    paths: projectPaths(project, root),
  };
}
```

约束：

- `paths` 与 `renderable` **同级**，不要塞进 `projectSummary`。
- `renderable` 仍只在这里（以及 weaver CLI）算。不要读 `paths.stillFiles` 自己 AND 一遍冒充 `isRenderable`（形状 error 也会让 `isRenderable === false`，比「缺 png」更严）。
- **不要**加 `outputExists`、`output`、`mp4` 等平行键。
- 写回路径已经 `res.json(detailOf(project))` 的，自动带新 `paths`（scene set / 上传后静帧 `exists` 会变）。
- `POST /api/projects/:id/validate` 今日只回 `{ issues }`。校验按钮实际调的是 `api.project`（GET），不是这条。不要为了本 PR 去扩 validate 响应。

PR1 未合入时本 PR **blocked**：`@lightweaver/weaver` 没有 `projectPaths`，`make typecheck` 会红。不要在 Studio 里先写 stub。

### 客户端类型（`src/types.ts`）

与设计「API / Interface Changes」逐字段对齐（不要自行改名）：

```ts
/** 项目外路径（brief.files）。不要依赖 rel。 */
export type PathEntry = { path: string; exists: boolean; rel?: string };

/** 项目内媒体。rel 必填，供 projectMedia(id, rel)。 */
export type MediaPath = { path: string; exists: boolean; rel: string };

export type MediaFile = MediaPath & {
  sceneId: string;
  locale: string;
  ref?: string;
};

export type BriefPaths =
  | { kind: "study"; root: string; files: Record<string, PathEntry> }
  | { kind: "project-brief"; files: { brief: PathEntry; briefEn: PathEntry } }
  | { kind: "hybrid"; root?: string; files: Record<string, PathEntry> };

export type ProjectPaths = {
  projectRoot: string;
  film: string;
  assetsDoc: string;
  stillFiles: MediaFile[];
  lineFiles: MediaFile[];
  outputFiles: Record<string, MediaPath>;
  library: string;
  recipes: string;
  labUrl?: string;
  publishDir?: string;
  brief: BriefPaths;
};

export type ProjectDetail = ProjectSummary & {
  film: FilmDoc;
  assets: Asset[];
  issues: Issue[];
  renderable: boolean;
  paths: ProjectPaths;
};
```

`api.ts` **不改签名**。`api.project` / scene PATCH 已经 `parse<ProjectDetail>`；类型一扩，预览就能读 `detail.paths`。

`ProjectSummary`（list）不加 `paths`。

---

## UI 行为

全部产品行为发生在 `App.tsx` 预览栏 + 主栏复核行；`study-explainer.tsx` 只加成片/缺帧 helper，**不**改 CRUD 控件。

### 预览栏（`App.tsx` 右侧 `.preview`）

现网：

```tsx
const preview = useMemo(() => (detail ? stillPreviewSrc(detail, scene, locale) : undefined), [detail, scene, locale]);
// …
<div className="preview-frame">
  {preview ? <img src={preview} alt={…} /> : <span>没有静帧 / 片头片尾</span>}
</div>
```

改为互斥：

| 条件 | 画面 |
| --- | --- |
| `detail.paths.outputFiles[locale]?.exists === true` 且 `rel` 非空 | `<video controls src={projectMedia(detail.id, rel)} />`。`src` **只能**是这条 URL。**禁止** `file://`、禁止 `outputFiles[locale].path` |
| 否则（无 key / `exists === false` / 缺 `rel`） | **今日**静帧：`stillPreviewSrc` → `<img>`；没有图则原文案 |

绝对路径：`outputFiles[locale].path` 放在 `<video>` **旁边**，只读文本（推荐 `<input readOnly>` + `onFocus` 全选，或「复制」按钮写 `navigator.clipboard.writeText`）。不要做成 `<a href={path}>`，不要当 `src`。`exists === false` 时也可以用同样只读控件显示「将写入的路径」（`path` 仍由 `projectPaths` 拼出），但不要假装文件在。

`video` 属性：`controls` 必给。建议 `playsInline` `preload="metadata"`。不要 autoplay。`index.css` 给 `.preview-frame video` 与 `img` 同样 `width: 100%; display: block;`。

切 locale：zh ↔ en 必须换另一条 `outputFiles[en|zh]`（intent 是 `cursor-movement.mp4` vs `cursor-movement.en.mp4`）。一条存在、另一条不存在时，存在的播 video，不存在的回落静帧。

### 渲染结束后要重拉 detail

现网 job 轮询只 `setJob`，**不** `loadDetail`。本机点「渲染」成功后 `exists` 不会自己变 true，预览会一直停在静帧。

在 `job.status` 从 `running` 变为 `ok` 时（render **或** tts 都可以）再调一次 `loadDetail(detail.id)`。这样 `paths.outputFiles` / `lineFiles` 的 `exists` 与 UI 同步。不要在轮询里每次 GET 项目。

### 复核清单（主栏，issues 附近）

`detail` 有值就画一行（不要藏在 `issues.length` 后面——nav/sidebar 形状绿时 issues 可能只有 warning，人仍要看见「不可渲」）：

```
{detail.renderable ? "可渲" : "不可渲"}
```

缺 png：当前 locale 下

```ts
detail.paths.stillFiles
  .filter((f) => f.locale === locale && f.exists !== true)
  .map((f) => f.sceneId)
```

有则追加 ` · 缺 png：floating, sidebar, …`。这就是设计说的「为什么 agent 停在阶段 6」。**不要**在 Studio 里重跑 `validate` 算法，不要把缺 wav 混进这行（wav 不是 `isRenderable` 的门）。

已有 `<section>校验</section>` + `issue-error` / `issue-warning` 原样保留。

### `study-explainer.tsx`

- lab 行保持纯文本：`lab · http://127.0.0.1:5173/s/{detail.studySlug}`。不要改成链接、按钮、iframe、embed。`paths.labUrl` 若与此同形，**仍展示这条写死的 loopback 文案**（D13），不要改成「打开 lab」。
- 把成片 URL 收成 helper，避免 App 手拼：

```ts
export function outputPreview(
  detail: ProjectDetail,
  locale: string,
): { src: string; path: string } | undefined {
  const out = detail.paths.outputFiles[locale];
  if (!out?.exists || !out.rel) return undefined;
  return { src: projectMedia(detail.id, out.rel), path: out.path };
}

export function missingStillSceneIds(detail: ProjectDetail, locale: string): string[] {
  return detail.paths.stillFiles
    .filter((file) => file.locale === locale && file.exists !== true)
    .map((file) => file.sceneId);
}
```

- 可选、不阻塞：still 场景列表 meta 上标「缺帧」当该 `sceneId` 落在 `missingStillSceneIds` 里。不要因此禁用编辑。
- **禁止**「生成旁白」按钮。textarea `onBlur` → `patchScene` 留下。
- 加场 / 上移下移 / 删除 / 绑 still / fit / role / 卡片字段一行都不删。

### 明确不出现的控件

- `<Player>` / 任何 Remotion 预览。
- lab iframe / WebView。
- capture 按钮。
- 「AI / 生成旁白」。
- 把 `paths.brief.files.*.path` 做成「打开 LightUI 仓」的文件系统链接（YAGNI；理念阅读是 agent 的事）。

顶栏「合成旁白」= `startJob("tts")`，不是 LLM，**保留**。`!isRenderable` 时渲染按钮继续 disabled。

---

## 文案

设计原文，不要意译成「欢迎使用工作台」。

> 片子由 agent 经 weaver 写；这里复核、改词、补静帧。

| 位置 | 现网 | 改成 |
| --- | --- | --- |
| 顶栏品牌旁 | 只有「LightWeaver」 | 加一行 muted 副文案，用上面整句。不要改品牌名 |
| 侧栏新建 | `<h2>新建项目</h2>` + 按钮「创建到 data/projects」当第一句故事 | 标题可改为「新建（本机收尾）」；**副文案先写整句**。按钮可仍叫「创建到 data/projects」（动作，不是产品定义）。不要把「新建到 data/projects」写成 README / 顶栏第一句 |
| [`products/studio/README.md`](../products/studio/README.md) | 「本地工作台：项目、资产区、场景旁白、校验 / 合成 / 渲染。」 | 第一段改复核面。用法仍 `make studio` → `http://127.0.0.1:5175/`。条目改成：片子主路径是 agent + `weaver`；本页检视 issues、回放 `assets/outputs/`（经 `/api/media`）、改词、补静帧。CRUD 仍可用。内置片来自 `products/study-films/projects/`；新建仍写 `data/projects/` |
| [`products/studio/AGENTS.md`](../products/studio/AGENTS.md) | 「Local workbench…」 | 开篇改 review surface。规则补：`<video src>` 只用 `projectMedia(id, rel)`；禁止磁盘绝对路径；禁止 Remotion / LightUI import；禁止生成旁白按钮 / lab iframe；`/api/media` 侍 `library/` 与项目根（含 gitignore 的 `assets/outputs/`） |

根 `README.md`、`skills/*` **不要**在本 PR 改（PR1 / PR5）。

中文 UI、英文标识符：已有约定。新文案用中文。`可渲` / `不可渲` 用这两个词，不要改成「Ready to render」。

---

## 验收（桌面复核清单）

单测锁不住 UI。合并前在 `make studio`（`127.0.0.1:5175`，窗宽 > 1100px）手过：

1. **类型 / 响应。** 打开任意项目，DevTools → `GET /api/projects/intent-cascade` JSON 有同级 `paths`、`renderable`、`issues`，**没有** `outputExists`。`paths.outputFiles.zh.rel === "assets/outputs/cursor-movement.mp4"`。`GET /api/projects` list **没有** `paths`。
2. **无成片 → 静帧。** 未渲过的 `intent-cascade`：预览仍是当前场 png（`desktop-full.png` 等），不是破 video。nav-taxonomy / sidebar-taxonomy：`renderable === false`，主栏「不可渲 · 缺 png：…」列出 still 场；渲染按钮 disabled；预览无 mp4。
3. **有成片 → video。** 本机 `npx weaver render --project intent-cascade --locale zh`（或顶栏渲染）成功后，刷新或等 job `ok` 自动 `loadDetail`：预览是 `<video>`，`src` 以 `/api/media/project/intent-cascade/assets/outputs/cursor-movement.mp4` 开头，**不是** `/Users/…`。能播、能暂停。旁边绝对路径是只读文本，全选可复制。
4. **切 en。** 只渲过 zh 时切 en → 回落静帧（`cursor-movement.en.mp4` 通常不在）。两条都在则换片。
5. **gitignore 可侍。** `git check-ignore -v products/study-films/projects/intent-cascade/assets/outputs/cursor-movement.mp4` 命中 `**/assets/outputs/`，但 video 仍 200。证明侍的是磁盘不是 git。
6. **安全。** 手打 `/api/media/project/intent-cascade/../../../package.json`（或 `assets/outputs/../../../../.env`）→ 400「路径越界」，不是 200。
7. **CRUD 还在。** 对 `intent-cascade`：加一场 still → 改旁白 blur 保存 → 上移下移 → 删回。png/wav 字节不动（与 study-explainer 阶段 2 同一验收）。title/close 卡、音色、上传绑 still 仍可用。
8. **lab D13。** 有 `studySlug` 的片子仍是一行纯文本 `http://127.0.0.1:5173/s/<slug>`。没有 iframe，没有「打开 lab」按钮。
9. **没有越界控件。** 源码与 UI 均无 Remotion Player、无「生成旁白」、无 `/api/generate`、无 capture 按钮。顶栏「合成旁白」仍是 TTS。
10. **文案。** 顶栏 / 新建副文案 / `products/studio/README.md` 第一句是复核故事，不是「工作台主路径」。
11. **job。** `!renderable` 仍禁渲染；只缺 png 时 TTS 仍可点。有 `publish.dir` 才见发布。
12. **命令。** `make typecheck`、`make test`（含 `tsx --test products/studio/server/paths.test.ts`）绿。

---

## 实施步骤

1. **确认 PR1。** `weaver/src/index.ts` 能 `export { projectPaths }`（或 `export * from "./project-paths.ts"`）。没有就停，不要在 Studio stub。
2. **`src/types.ts`。** 加上文 `PathEntry` / `MediaPath` / `MediaFile` / `BriefPaths` / `ProjectPaths`，`ProjectDetail.paths` 必填。
3. **`server/index.ts`。** import `projectPaths`；`detailOf` 加一行 `paths: projectPaths(project, root)`。不改 media 路由，不加 `outputExists`，不碰 `PUT /film` 形状。
4. **`tasks/study-explainer.tsx`。** 导出 `outputPreview` / `missingStillSceneIds`。lab 行不动。CRUD 不动。
5. **`App.tsx`。** 顶栏副文案；新建副文案；预览互斥 video/img + 只读绝对路径；主栏「可渲/不可渲」+ 缺 png；job `ok` 后 `loadDetail`。
6. **`index.css`。** `.preview-frame video` 与 img 同宽。只读路径用已有 `.item-meta` / `.field`，不要新造营销样式。
7. **`README.md` + `AGENTS.md`。** 按「文案」节改，声明复核面与 `/api/media` 约束。
8. **`server/paths.test.ts`。** 在现有 `describe("safeJoin")` 加两条（见下），不新开测试框架。
9. **`make typecheck && make test`**，再走桌面清单 1–12。

### `paths.test.ts` 怎么扩

现有文件只测 `safeJoin`。**不要**为了本 PR 拉 supertest 起 8788。扩展同文件即可：

```ts
it("allows gitignored output rel under project root", () => {
  const root = "/tmp/proj";
  assert.equal(
    safeJoin(root, "assets/outputs/cursor-movement.mp4"),
    path.resolve(root, "assets/outputs/cursor-movement.mp4"),
  );
});

it("rejects escaping through assets/outputs", () => {
  assert.throws(() => safeJoin("/tmp/proj", "assets/outputs/../../../etc/passwd"));
});
```

`safeJoin` 不读 `.gitignore`，这两条把「outputs 可侍 / 仍不可穿越」写成回归。**不要**在测试里 `writeFile` 真 mp4，也不要测 `detailOf`（未导出）。`projectPaths` 的形状锁在 weaver `project-paths.test.ts`（PR1），本 PR 不重复。

---

## 陷阱

- **`src` 塞绝对路径。** macOS 上 `src="/Users/…/cursor-movement.mp4"` 会被浏览器当站点相对路径或直接拒。只能 `projectMedia(id, rel)`。
- **再造 `outputExists`。** GET 已经有 `paths.outputFiles[locale].exists`。平行字段会和 P14 / skill 判据分叉。
- **PR1 未导出就开写。** Studio 不要复制 `project-paths.ts`。`assets.ts` ↔ `project.ts` 循环禁令对 Studio 同样适用：不要让 server 从 `project.ts` 间接算媒体存在性。
- **encode 整个 rel。** `projectMedia` 今日与静帧一致：id encode，path 保留 `/`。改掉会 404。
- **Express 5 `*path`。** 继续兼容 `string | string[]`。不要改成假设永远是数组。
- **渲染完不重拉。** 不 `loadDetail` 则本机点渲染永远看不到 video。
- **窄窗验收。** `1100px` 以下预览栏 `display: none`，会误判「没做 video」。
- **list 被加肥。** `paths` 只挂 detail。侧栏 list 继续 `ProjectSummary`。
- **`PUT /film` 漏 `paths`。** 客户端不用它。不要为了「对称」加 `outputExists`；若有人以后拿 PUT 当 `ProjectDetail`，应改走 `detailOf`，那是后续，不是本 PR。
- **TTS 按钮被删。** 「合成旁白」是确定性 `tts` job。禁的是 LLM「生成旁白」。
- **lab 可点。** D13 是纯文本。`paths.labUrl` 不要变成 iframe src。
- **自己 `existsSync`。** 客户端不要再探 `/api/media` 是否 404 来决定播不播；以 `paths.*.exists` 为准。media 404 只是文件在两次 GET 之间被删的退化。
- **把 brief / LightUI 路径当 `/api/media`。** media 只能侍 `library/` 与 `project.root`。`idea.md` 在 LightUI 仓，越界。brief 只给 agent 读盘。
- **扫 `assets/outputs/`。** 文件名以 `locales.*.output` 为准（intent 不是 `intent-cascade.mp4`）。`projectPaths` 已按此拼；UI 不要 `readdir`。
- **CRUD 被「产品改复核」误删。** P3：代码留下，故事改。agent 卡在绑 still / typo / 调序时人要能本机收尾。
- **import Remotion「只看一眼」。** `AGENTS.md` 零容忍。回放是 `<video>` + 已渲 mp4，不是 composition。
- **用户片无 `outputFiles[locale]`。** 种子仍有 `locales.zh.output`。按 optional chaining 回落静帧，不要 throw。

---

### Critical Files for Implementation

- `products/studio/server/index.ts` — `detailOf` 加 `projectPaths`；确认不碰 media 路由、不加 `outputExists`
- `products/studio/src/types.ts` — 镜像 `ProjectPaths` / `MediaPath`，扩 `ProjectDetail`
- `products/studio/src/App.tsx` — 文案、video/img 互斥、只读绝对路径、可渲行、job 后重拉
- `products/studio/src/tasks/study-explainer.tsx` — `outputPreview` / 缺 png helper；lab 纯文本；CRUD 不动
- `products/studio/src/api.ts` — 已有 `projectMedia`；`/api/media` + `safeJoin` 即 gitignore 成片的侍出面（本 PR 只调用、不改）
