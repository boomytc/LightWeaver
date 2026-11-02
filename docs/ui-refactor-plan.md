# LightWeaver Studio UI 重构实施计划

- 依据：[UI 审查报告](ui-review.md)（2026-11-02）
- 目标：在不推翻现有桌面工作台架构的前提下，完成 4 个 P0 修复 + 设计系统收敛 + 页面框架/响应式/可及性统一 + 反馈原语补齐 + 主要页面信息架构调整
- 范围外（明确不做）：R2 级重写（独立设计系统包/Storybook/组件文档站）、重做导航模型、重写 `session` 并发状态机、移动端专属布局、LightUI 展示型动效
- 约束：遵循 `confident-development-conventions`（逻辑正确性优先、必要验收、临时资产放系统临时目录并清理）与 `atomic-commit`（每批独立提交、只暂存本次文件）

## 一、已确认的默认决策

| 决策点 | 采用方案 | 理由 |
| --- | --- | --- |
| 最小窗口宽度 | 保留桌面 `minWidth: 960`，界面在 960–1280 内必须可用：渲染期派生折叠 + 中心最小宽 320/360；1100 以下导航收图标栏 | 比单纯提高 minWidth 更稳；浏览器模式与高 DPI 缩放也覆盖 |
| 字体 | 移除未加载的 IBM Plex / Noto SC 声明，改为明确的跨平台系统栈（PingFang SC / Microsoft YaHei / Noto Sans SC + system-ui）；等宽用系统 mono | 桌面包离线自包含，不再出现"声明了但没加载"的假承诺；后续若要品牌字体再单独做子集自托管 |
| 主题入口 | 保留左下角三段切换作为唯一入口；设置页"外观"改为展示当前主题与说明，不再放第二个控件 | 消除同一状态两套操作机器（control-taxonomy） |
| 交付主操作 | "导出视频"升为唯一主按钮，OTIO/剪映/bundle 收进"更多导出"菜单；历史按当前/过期/缺失/历史分组 | README 已承诺的状态语义，界面补齐 |
| 设置页结构 | 模型页顶部增加"就绪摘要"（模型/密钥/运行组件计数），下钻保留现状；引擎设置拆"一键配置（sticky 主按钮 + 进度）"与"组件清单/高级" | dashboard-layers 先皮后因 + locator-taxonomy |
| `.grid` 冲突 | 组件类改名 `auto-card-grid`，全仓 `className` 中 `grid` 补 `grid-cols-1` 基线；CI 规则禁止组件类与 Tailwind utility 同名 | 消除根因而不是局部绕过 |
| 卡片语义 | `panel-card`=独立区块（无阴影）；`subtle-card`=附属信息块（浅底）；`surface-card`=可点击对象（阴影）。关系型信息改 `border` 分段/单列列表 | group-taxonomy |

## 二、批次与验收

### 批次 0 —— P0 止血（目标 0.5–1 天）

改动：

1. `src/index.css`：`.grid` → `.auto-card-grid`；`model-list` 与 `mask-grid` 保留；`input:focus` 不再 `outline:none`（保留 `:focus-visible` outline）；导航分组标签 12px/600 + `--lw-muted`；kbd/序号改 `--lw-muted`；新增 `.ui-input--bare` 替换 workspace-title 的 9 个 `!important`。
2. `src/projects/ProjectHome.tsx`：显式 `grid-cols-1 xl:grid-cols-[...]`；空态文案去方向词。
3. `src/settings/ModelSettings.tsx`：`className="grid"` → `auto-card-grid`。
4. `src/client/state.ts` + `src/session/useProjectSession.ts`：新增 `contextState: idle/loading/ready/failed` 与 `contextError`、`retryContext()`；新增 `listsStatus` 与 `refreshLists` 状态；`fail()` 支持 `{ retry, key, silentToast }`，toast 增加 `action` 与去重；`act()` 开始时清 inline error。
5. `src/workspace/ProjectWorkspace.tsx`：
   - 用容器 `ResizeObserver` 取工作区宽度，渲染期派生折叠（<1100 收左栏、<1240 收右栏），中心区最小 360，钳制 `left+right`；
   - `wasNarrow` 初值改为 false 并在挂载时执行一次；
   - 加载态改骨架/错误卡（重试 + 返回项目列表）；
   - 增加错误横幅承接最近一次 `session.error`（可关闭、带重试）。
6. `src/ui/ToastStack.tsx`：支持 `action {label, run}`、按 `key` 去重、最多 3 条；danger 保持不自动消失。
7. `src/projects/ProjectHome.tsx`、`src/library/LibraryPanel.tsx`、`src/jobs/JobsPage.tsx`：`listsStatus === loading` 渲染 2–3 行骨架；failed 保留原列表 + 行内重试；空态仅 ready 后显示。

验收：

- `npm run typecheck` 通过；
- 真实运行 Studio（`make studio`），Playwright 在 960/1024/1280/1512 截图：首页单栏堆叠、工作区预览 ≥320（960）/≥360（900 不适用），无横向溢出；
- 用 `page.route` 中断 `/projects/*/context` 验证错误卡与重试；
- 键盘 Tab 到搜索框/菜单/项目名有可见焦点；导航分组对比度 ≥4.5:1；
- 无新增 console error。

提交：`修复窄屏布局与项目加载失败反馈`

### 批次 1 —— 设计系统收敛（目标 1–1.5 天）

改动：

1. `src/index.css` 拆分（保持原规则顺序与 @layer 结构）：`index.css`（入口）→ `styles/tokens.css`（@theme + :root + dark + 字号/尺寸/间距/断点 token）、`styles/base.css`、`styles/components.css`、`styles/responsive.css`；
2. `@theme` 补齐 `subtle / line-strong / accent-text / accent-line / danger-line / ok-line / warn-line / stage-well / overlay` 映射；删除死令牌 `--radius-control`；
3. 新增共享视觉类：`.ui-popover`、`.ui-popover-item`、`.ui-dialog`、`.ui-overlay`、`.ui-input--bare`；`Modal`/`ConfirmDialog`/`Hint`/`Menu`/`UiSelect`/`ToastStack`/`SearchInput` 改用共享类，删除 `rounded-[6/8/10/14px]`、`shadow-[var(--lw-shadow-menu)]` 与十六进制色；
4. `stage-well` 改局部令牌作用域（重定义 `--lw-panel/ink/muted/line/...`），删除逐组件覆写与 TSX 内联色（`ProjectWorkspace.tsx` 内）；
5. 字体：`--font-sans` 改系统栈；`html` 加 `-webkit-font-smoothing`；
6. `h3` 字号与 `--text-*` 档位；`nav-group-label`/`panel-header`/`storyboard-index` 归入档位；`index.css` 中 `rounded-[…]` 清零。

验收：

- `npm run typecheck`、`npm run build -w @lightweaver/studio` 通过；
- `grep -rE 'rounded-\[' products/studio/src/ui` 与 `grep -rE '#[0-9a-fA-F]{3,8}' products/studio/src/ui products/studio/src/shell` 为 0（允许 tokens 文件）；
- Playwright 浅/暗 1512 截图逐页对照：无视觉回归（stage、menu、dialog、toast、设置）；
- `index.css` 行数 ≤ 700。

提交：`收敛设计令牌并拆分样式层`

### 批次 2 —— 页面框架 / 工作区响应式 / 可及性（目标 1.5–2 天）

改动：

1. 新增 `src/ui/PageFrame.tsx`（title/description/actions/measure + 统一 header + scroll）与 `src/ui/ViewHeader.tsx`；迁移 ProjectHome、SettingsPage、JobsPage、LibraryPanel；统一页面内边距 24/20 token；
2. 新增 `src/ui/Segmented.tsx` + `useTabs`：roving tabindex、方向键/Home/End、`aria-controls`/`tabpanel`/`aria-labelledby`；迁移工作区主 tab、底部 tab、预览来源、左栏模式、任务筛选；设置页继续用 Radix Tabs；
3. 工作区：header 增加 sr-only h1、项目名 15px；`focus !== "edit"` 时底部自动收 36px；空故事板宽度改 `min(620px,100%)`；`mask-fields` 固定 2×2；`source-window-controls` 两行布局；
4. AppShell：`<1100px` rail 收 64px 图标栏（Tooltip 替代 label）；加 skip link + 各页 `<main id="main" tabIndex={-1}>`，导航后聚焦内容；
5. `Resizer` 改 `role="separator"` + `aria-valuenow/min/max` + 方向键/Home/End/双击复位，与布局钳制共用函数；
6. 断点注释与响应式规则集中到 `responsive.css`，`split-page` 补基类。

验收：

- typecheck/build；
- Playwright：960/1024 截图导航为图标栏且主区 ≥360；键盘聚焦分隔条后 ArrowLeft/Right 改宽、Home/End 到端点、双击复位；
- Tab 键序：skip link → 导航 → 内容；工作区 tab 方向键切换、`aria-selected` 正确；
- 1512 截图无回归。

提交：`统一页面框架并补齐响应式与可及性`

### 批次 3 —— 反馈原语与确认阶梯（目标 1.5–2 天）

改动：

1. `src/ui/AsyncRegion.tsx`（loading/failed/empty(cause)/ready）；
2. `src/session` 增加 per-action pending（`pending: Record<string, boolean>`）+ `src/ui/useAction.ts`；工作区保存/制作、库保存、导出接 pending；
3. `ConfirmDialog` v2（tone/impact/confirmLabel/cancelLabel/requireType，cancel-first 焦点）+ `Popconfirm` + `useUndoable`（5s 窗口，乐观隐藏，撤销不落库）；应用：库项删除→撤销；场景删除→Popconfirm；覆盖草稿→Modal 说明；退出对话框文案与按钮收敛；
4. `ProgressBar`（monotonic + 阶段 + indeterminate）+ `RunStatus`；用于工作区任务面板与任务页；
5. `FormField`（required/hint/error/success + aria）；应用 CreateProject、DeliveryPanel、BgmEditor、库表单；
6. 错误反馈：`fail` 写 inline 区域 + toast action/retry；轮询/流式失败降级为常驻状态行。

验收：

- typecheck/build；
- Playwright 网络拦截：库删除→撤销恢复（拦截 DELETE 断言未发出）；保存失败→工作区横幅 + 重试；加载失败→错误卡；
- 作业面板进度不倒退、有阶段文案；
- 表单：空片名禁用提交并就地提示；交付最后一个语言/画幅不可取消。

提交：`补齐反馈状态原语与确认撤销阶梯`

### 批次 4 —— 页面信息架构与打磨（目标 2–3 天）

改动（按页面拆分并行执行，写作用域互斥）：

1. `settings/`：模型页就绪摘要；EngineSettings 拆"一键配置（sticky 主按钮 + 进度）"与"组件清单/高级"；ModelSettings 列表→详情改固定 header 二级视图；存储/运行时去卡片嵌套；外观改只读说明。
2. `workspace/` + `scenes/` + `assets/`：左栏场景与故事板去重；引导条可关闭/感知完成度；证据列表改单列；BGM 去双层卡；`ProjectGuidance` 与首页引导二选一。
3. `delivery/` + `jobs/` + `library/` + `projects/`：交付主操作 + 历史分组 + 状态筛选；任务筛选移入列表栏 + 节点单列紧凑列表；库 sticky 动作条 + 按 kind 文案/空态 + 行操作收敛；首页引导压缩 + 导入入口降级；CreateProject 唯一主操作。
4. 全局：断点统一 1440/1240/1100/960；内容宽三档 1120/896/full；去卡片嵌套；间距 token；新增 `scripts/check-ui-css.mjs`（禁止组件类与 utility 同名、ui 层 hex、arbitrary radius、!important 非 reduced-motion）并接入 `npm run typecheck`。

验收：

- typecheck/build；
- Playwright 全页截图矩阵：1512 浅/暗 + 1024/960 首页、工作区、设置、任务、交付、库；
- 交付页只有一个主行动且历史按状态分组；库表单保存始终可见；任务页 900/960 下主从可用；
- `node scripts/check-ui-css.mjs` 通过。

提交：`调整设置交付库与任务页面信息架构`

## 三、验收矩阵（每批执行）

| 检查 | 命令/方式 | 批次 |
| --- | --- | --- |
| 类型与模块边界 | `npm run typecheck` | 0–4 |
| 生产构建 | `npm run build -w @lightweaver/studio` | 1、3、4 |
| 真实 UI | `make studio` + Playwright 截图/键盘脚本（临时放 `/tmp`，验收后清理） | 0–4 |
| 样式规则 | `node scripts/check-ui-css.mjs` | 4 |
| 差异检查 | `git diff --stat`、逐文件 diff | 每批提交前 |

## 四、风险与回滚

- 层叠顺序：`index.css` 拆分必须保持原规则顺序与 @layer 结构，拆前先保存基线截图；每批只动一类规则。
- `ClientState.layout` 增字段需 zod 默认值 + 旧状态兼容，避免老用户 parse 失败。
- `.grid` 改名先全局搜 `className` 中的 `grid`，避免遗漏合法使用点。
- 页面并行改造按目录分配写作用域，`index.css` 与 `src/ui/*` 仅 Lead 修改，避免冲突。
- 每批独立提交，可单独回退；不修改已有提交历史，不推送。

## 五、提交计划

1. `补充 Studio UI 审查与重构方案`（docs）
2. `修复窄屏布局与项目加载失败反馈`（批次 0）
3. `收敛设计令牌并拆分样式层`（批次 1）
4. `统一页面框架并补齐响应式与可及性`（批次 2）
5. `补齐反馈状态原语与确认撤销阶梯`（批次 3）
6. `调整设置交付库与任务页面信息架构`（批次 4）

---

## 六、实施记录（2026-11-02）

### 提交

| 批次 | 提交 | 内容 |
| --- | --- | --- |
| 文档 | `887522b` | 补充 Studio UI 审查与重构方案 |
| 批次 0 | `4c7f401` | 修复窄屏布局与项目加载失败反馈（`.grid` 冲突、工作区派生折叠与中心最小宽、加载骨架/失败重试、错误横幅、列表 loading/failed、toast 去重与动作、对比度与 focus-visible 快修） |
| 批次 1 | `426521a` | 收敛设计令牌并拆分样式层（`styles/{tokens,base,components,responsive}.css`、令牌 27/27 映射、共享 popover/dialog/overlay/toast 视觉层、stage 局部令牌、字号/尺寸/间距档位、系统字体栈、`ui-input--bare`） |
| 批次 2 | `6b713c1` | 统一页面框架并补齐响应式与可及性（`PageFrame`/`Segmented`/`useTabs`、工作区 header h1、底部非 edit 自动折叠、分隔条键盘与 `role=separator`、窄窗 icon rail + popover 搜索、skip link 与路由聚焦、mask/source 控件布局） |
| 批次 3 | `faff04d` | 补齐反馈状态原语与确认撤销阶梯（`ProgressBar`、`useAction`、`ConfirmDialog v2`、`Popconfirm`、库项乐观删除 + 5s 撤销、场景删除 Popconfirm、单调作业进度、`FormField` 必填/错误、交付/库 pending、退出对话框文案与焦点） |
| 批次 4 | `6271d85` | 调整设置交付库与任务页面信息架构（模型就绪摘要、设置去卡片嵌套、EngineSettings 拆分与顶部主按钮、模型二级视图；工作区左栏去重与引导单行可关、证据单列、BGM 去卡、方案/对比整改；交付主操作 + 状态分组、任务筛选与节点行、首页引导/导入/行列表、库按 kind 文案 + sticky 动作条；UI 样式 CI 检查） |

### 验收结果

- `make typecheck` 通过（含 `scripts/check-ui-css.mjs`：同名组件类、UI/壳层硬编码色、arbitrary 圆角、非 reduced-motion `!important` 检查）。
- `npm run build -w @lightweaver/studio` 通过。
- Playwright 真实运行 Studio（`make studio`）截图矩阵：1512 浅/暗、1024、960；首页/工作区/设置/任务/方法/音色/交付/字幕/声音/方案；**无横向溢出、无 console/pageerror**。
- 关键交互实测：项目上下文失败 → 错误卡 → 重试恢复；工作区 tab 方向键切换并更新 `aria-selected`；分隔条方向键/Home/End/双击复位；960/1024 导航 icon rail 与 popover 搜索；skip link 首个 Tab；库项删除乐观隐藏 + 撤销（拦截断言 0 次 DELETE）；场景删除 Popconfirm 焦点落在取消且取消不丢场景；CreateProject 片名为空时提交禁用。
- 数据安全：验收期间未做保存/制作/删除/导出/导入等写操作；删除与撤销路径在拦截网络请求下验证，未改动真实项目数据。

### 未覆盖 / 已知限制

- 真实数据没有 deliveries、runs、模型失败、BGM、证据、冲突等状态，相关 UI 分支用临时本地状态或 `page.route` mock 验证后已还原，未在真实服务端触发。
- 未验证 Electron 打包产物；验收基于浏览器开发模式 + 生产 `vite build`。
- 未新增自动化测试套件（遵循 `confident-development-conventions`，临时脚本与截图不入库）。
- P2 剩余：页面内容宽仍按职责保留 1120/896/1440 三档；部分空态/历史卡仍用 `subtle-card`；字体改为系统栈，未自托管品牌字体；主题入口保留左下角一处，设置页"外观"只读说明。

## 七、查漏补缺与回归修复（2026-11-02 第二轮）

对批次 0–4 逐条对照计划复查后，补充提交 `0492448`（`补齐 UI 重构遗漏项并修复回归`）：

| 计划项 | 现状 |
| --- | --- |
| 批次 2：`ViewHeader` | 新增 `ui/ViewHeader.tsx`，用于工作区字幕/声音/方案/交付四个标签页头，替换各自手写 h2+hint |
| 批次 3：`AsyncRegion` | 新增 `ui/AsyncRegion.tsx`（loading/failed+retry/empty/ready），首页、库页、任务页列表统一使用 |
| 批次 3：`useUndoable` | 新增 `ui/useUndoable.ts`，库项删除改为通用 5s 撤销窗口（乐观隐藏、撤销不落库） |
| 批次 3：`RunStatus` | 新增 `ui/RunStatus.tsx`，任务页徽章统一复用，工作区任务面板改用同一组件 |
| 批次 3：工作区保存/制作 pending | 两个按钮改为 per-action pending（`useAction`），不再共用全局 `busy` 文案 |
| 批次 3：交付表单约束 | 至少保留一种输出语言/画幅（最后一项目禁用）；帧率 1–120、LUFS -36–-5、True peak -9–0 输入约束与 clamp |
| 批次 3：覆盖草稿说明与会话回执 | 冲突横幅改为先弹确认（说明草稿会先备份为可恢复草稿）再加载；成功后提示草稿备份可在项目列表恢复 |
| 批次 4：页面 CSS 拆分 | 页面/工作区专属样式迁入 `styles/pages.css`（459 行）；`components.css` 从 1192 行降到 742 行；`index.css` 仅保留入口导入 |
| 批次 4：间距 token | 新增 `--space-field/--space-block/--space-section` 并用于表单栅格 |
| S12/S13：搜索语义 | 搜索框补 `role=combobox`、`aria-expanded/controls/autocomplete/activedescendant`，结果区 `role=listbox`、项 `role=option`，无结果回显关键词 |
| 布局细项 | `.section-title` 允许换行；`key-value-list` 标签列改 `max-content` + 24px 列距；去掉 Jobs 页 `!items-start` 的 utility 覆盖，改 `data-align` 变体；`.split-page` 补基类；`管理模型` 按钮 aria-label 与可见文案对齐；toast 改右下角避免压住 header 操作区 |

**仍记录为偏差/后续项**（未在本轮实施，均有明确原因）：

- 断点未做代码级统一：媒体查询仍为 1100/900 px + Tailwind 断点；已在 `tokens.css` 注释记录约定（1280/1100/900/960、容器 1000/640/760），因为 CSS 自定义媒体查询需构建期方案，收益低于风险。
- `<900px` 未实现 off-canvas 导航：现以 64px 图标栏 + 弹层搜索覆盖；桌面窗口最小宽度 960，<900 仅浏览器缩放场景，待产品明确"是否支持窄窗"后再定。
- 选择器分层（IF-10，30 处原生 `<select>`）未统一：不在已批准的批次计划内，属下一轮 R1（可先定 NativeSelect/UiSelect/Menu 规则再逐页替换）。
- 成功提示降噪、消息中心留档、Dropzone 拖放校验、字幕协助状态行、全局 undo/redo 栈等 P2/R2 项未做，按审查报告标注的批次优先级留待后续。
- Electron 打包产物未验证；真实数据下 deliveries/runs/失败/冲突/BGM/证据等分支仍以 mock/本地假状态验证。

第二轮验收：`make typecheck`（含 UI 样式检查）、`npm run build -w @lightweaver/studio` 通过；Playwright 1512 明/暗、1024、960 全页无横向溢出与 console error；空项目 mock（完整引导+创建卡）、搜索 combobox/listbox 语义与无结果文案、设置模型详情/引擎展开、交付表单约束、库项菜单删除+撤销（0 次 DELETE）、工作区 tab 方向键与分隔条键盘、skip link 均实测通过。
