# LightWeaver Studio UI / 布局排版审查（对照 LightUI 现代化理念）

- 审查日期：2026-11-02
- 审查对象：`products/studio`（React 桌面工作台，源码约 13k 行 TSX + 1351 行 `index.css` + 115 行 `SceneEditors.css`）
- 审查方式：只读源码审计 + 真实渲染截图 + Playwright 几何测量（未修改仓库、未 build、未启停产品服务；临时证据在系统临时目录）
- 对照基准：`/Users/boom/workspace/LightUI`（`design/tokens.css`、`design/base.css`、`products/lab` 实现、`docs/conventions.md`、`studies/*/idea.md`）
- 细则报告（临时）：`/tmp/lw-ui-audit/shell-design-system.md`（179 行）、`/tmp/lw-ui-audit/interaction-feedback.md`（222 行）、`/tmp/lw-ui-audit/page-layout.md`（229 行）；截图 `/tmp/lw-ui-audit/shots/01–23*.png`

---

## 0. 结论摘要

**结论：需要调整与改进，且需要一次模块级（R1）重构；但不需要推翻重写（R2）。**

现有实现的基础面是合格的：`lw-*` 语义令牌有浅/暗两套、Radix 承载全部浮层、桌面工作台的「216px 占位侧栏 + 纸张 app-sheet + 三栏可拖拽工作区」骨架成立，`scroll-region` / `tabular-nums` / `72ch` / container query / reduced-motion 等基建比多数同类内部工具扎实。问题集中在一层：**当窗口变窄、状态变坏（加载失败/提交失败）、内容变长时，界面没有按 LightUI 的决策模型退化**；同时设计系统的「单一来源」和「页面框架」只落地了一半，已经导致真实可复现的布局事故。

**4 个 P0（真实事故，不是理论风险）**

| # | 事故 | 直接证据 |
| --- | --- | --- |
| P0-1 | 全局自定义类 `.grid` 与 Tailwind `grid` 工具类同名，项目首页在 <1280 视口被重排为 auto-fill 220px 多列 | 1024 下内容区 3 列各 233px、步骤卡 56px 宽、中文一字一行；900 下 2 列、步骤卡 78px；截 `shots/16`、`shots/18` |
| P0-2 | 工作区在窄窗不降级：280/320 持久化侧栏 + 216 导航永远占位，启动即窄窗时不触发折叠 | 1512 预览 684px → 1280 452px → 1024 **207px** → 960（桌面最小窗口）**143px** → 900 **83px**，工具栏被裁；截 `shots/14`、`shots/15` |
| P0-3 | 项目加载失败会永久停在「加载项目…」纯文本，无骨架、无错误、无重试 | `ProjectWorkspace.tsx:116`；`/context` 失败只 `fail()` 写 toast，不改加载状态（`useProjectSession.ts:1018-1032`） |
| P0-4 | 所有错误被压缩成右上角 danger toast：远离操作、永不自动消失、无重试、可叠 4 条、关掉即永久丢失 | `useProjectSession.ts:66-73`（`pushToast` 上限 4）、`useProjectSession.ts:130-141`（`fail`）、`ToastStack.tsx:20`；全仓 52 处 `fail/setError`，只有设置诊断面板就地渲染 `session.error` |

**整体评级（按 LightUI 的决策完整性 + 桌面工具完成度）**

- 骨架 / 信息架构：**6.5 / 10**（模型选对了，局部未收口）
- 设计系统一致性：**5.5 / 10**（令牌有中心但非单一来源，页面框架只做了半套）
- 交互状态完整性：**5 / 10**（空态/等待/错误/确认/进度五类只覆盖了一半）
- 排版与手工艺：**6 / 10**（数字等宽、行宽、内滚做得好；字号梯度、对比度、间距节奏不足）

**重构范围（R1，约 5–8 人日，可分批独立验收）**：设计系统层（令牌单一来源 + CSS 分层 + 页面框架契约）→ 壳层响应式（窄窗退化 + 可及性）→ 反馈层原语（AsyncRegion / useAction / 确认阶梯 / 撤销 / 进度）→ 长表单与页面信息架构（设置、引擎、交付、库、任务）。**不建议**重做壳层、导航模型或并发状态机。

---

## 1. 评审基准：从 LightUI 抽取的 9 条现代化理念

LightUI 不是组件库，而是「先回答交互问题，再决定交互机器与外观」的决策分类学。审查中只采用可迁移的决策规则，不照搬它的站点视觉。

| # | 理念 | 对 Studio 的含义 |
| --- | --- | --- |
| 1 | **决策先于机器**（taxonomy：导航/侧栏/布局/页签/控件/下拉/浮层/确认/通知/空/等待/进度/表格/分组/对齐…） | 同一个需求先定它属于哪一问；不要用「一律卡片 / 一律弹窗 / 一律 toast / 一律左右布局」通吃 |
| 2 | **骨架先于皮肤**（layout-taxonomy） | 单栏 / 落地 / 瀑布 / 全屏 / 分栏 / 仪表盘 / 模块拼贴；栏宽、行长、区块间距由骨架决定 |
| 3 | **卡片只装真正独立的对象**（group-taxonomy） | 关系型信息用留白 + 1px 分隔、通栏色带、竖向分割线；不要「万物皆卡片」，更不要卡片套卡片 |
| 4 | **状态要分因**（empty / pending / progress） | 空要区分首次使用/搜索无果/筛选无果/加载失败/全部完成；等待要区分骨架/空占位/整页遮罩；进度能算就走满，不能算就循环，不造假 |
| 5 | **打断与后果成正比**（confirm-taxonomy） | 可逆→撤销 toast；局部风险→锚点气泡；严重→模态（危险色 + 取消默认焦点）；不可逆高危→键入确认 |
| 6 | **通知按档分级**（notify-taxonomy） | 角标 / 轻提示 ~2.4s / 带撤销 ~5s / 消息中心留档 / 警告固定在内容区处理前不消失 |
| 7 | **对齐是手工艺**（align-craft / overflow-trace） | 基线、数位、两端扫读、贴边；横向溢出先测越界元素再修约束，不用 `overflow:hidden` 掩盖 |
| 8 | **单一来源与边界纪律**（tokens / study-contract / docs/conventions） | 一个主题、一个令牌源、一套组件；两套实现会让后续修改必然漂移 |
| 9 | **可及性与动效克制**（base.css：focus-visible、text-wrap、reduced-motion） | 键盘可见、语义正确、尊重减弱动效；桌面工具不等于可以牺牲可及性 |

**适用边界（避免机械照搬）**

- 直接适用：确认阶梯（撤销/气泡/模态）、空因分类、等待占位、通知分级、分组语义、分隔条键盘、页面骨架与读线。
- 降级/不适用：长按蓄力、侧滑露出、键入确认、清单勾选（桌面鼠标 + 单人 + 本地草稿，误触率低；只在「放弃不可逆草稿」考虑最高档）；移动端底部导航、营销 hero、锚点 TOC、动效展示。
- LightUI 的 lab 是浏览型站点（大标题、48–56px header），Studio 是操作型工具（22px 标题、76/52px header、12–13px 控件）——**密度判断正确，问题只在三套 header 没有统一契约**。

---

## 2. 证据与复现

### 2.1 几何测量（Playwright，真实运行 `make studio`，1512×945 DPR2）

| 视口 | 页面 | 关键测量 | 结论 |
| --- | --- | --- | --- |
| 1512 | 工作区 | sheet 1286；左 280 / 中 684 / 右 320；底 220 | 骨架成立 |
| 1280 | 工作区 | 中 452 | 可用但偏紧 |
| 1024 | 工作区 | 中 **207**；头三列 295/186/295 | 预览成竖条 |
| 960 | 工作区 | 中 **143**（桌面 `minWidth: 960`） | 必现 |
| 900 | 工作区 | 中 **83**；`.preview-toolbar` 内容 92 > 83 | 工具栏裁切 |
| 1024 | 项目首页 | `.page-content` = `233px 233px 233px`；步骤卡 56×706 | P0-1 |
| 900 | 项目首页 | `.page-content` = `300px 300px`；步骤卡 78×308；整页高 1900 | P0-1 |
| 1512 | 设置 | split 190 + 1082，内容 `narrow-content` 896 | 框架可用但宽窄不统一 |
| 1512 | 任务 | 列表 340 + 详情 932 | 主从成立 |
| 1512 | 库页 | 列表 380 + 表单 892，表单 `narrow-content` 841 | 主从成立 |

### 2.2 可复现命令

```bash
make studio                      # 127.0.0.1:5175（API 5176）
# 截图与测量脚本在 /tmp/lw-ui-audit/*.mjs（shoot.mjs / measure.mjs / lead-measure2.mjs）
# 纯只读，不写仓库；本次审查结束后已停止启动的服务
```

### 2.3 本次审查覆盖

- 壳层：`AppShell` / 路由 / 导航 / 主题 / 页面框架 / 响应式
- 设计系统：`index.css` 令牌与分层、`ui/*` 原语 API、暗色、字体、对比度、focus、动效
- 交互：确认/通知/空态/等待/进度/浮层/表单/选择器/乐观更新/撤销
- 页面：项目首页、新建、工作区（画面/字幕/声音/方案/交付）、审查弹层、场景属性、遮罩、字幕、库页（方法/音色/素材）、任务、设置（模型/存储/诊断/外观）、素材与证据

---

## 3. P0 阻断级问题（先修，独立 PR）

### P0-1 `.grid` 类名冲突导致项目首页在 <1280 破碎

- 位置：`products/studio/src/index.css:905-911`（组件类 `.mask-grid, .grid, .model-list { grid-template-columns: repeat(auto-fill, minmax(220px,1fr)) }`）、`products/studio/src/projects/ProjectHome.tsx:79`、依赖冲突类的 `products/studio/src/settings/ModelSettings.tsx:444`
- 机理：Tailwind 的 `grid` 工具类只设 `display:grid`；同名自定义组件类在无显式列模板时生效。首页 `page-content grid … xl:grid-cols-[…]` 在 <1280（xl 断点）没有列模板 → 取 220px auto-fill。
- 影响：1024/900 首页不可用；步骤卡中文逐字竖排；`section-title` 内 h2 被压到 1–2 字/行；页面高度 1900。
- 修复：
  1. 组件类改名 `.auto-card-grid`（同步 `ModelSettings.tsx:444`），或在 `ProjectHome` 用显式 `grid-cols-1 xl:grid-cols-[…]` 并移除 `grid` 组件类依赖。
  2. 全仓 `className` 中带 `grid` 的 23 处补 `grid-cols-1` 基线（`ReviewPanels.tsx:96,102`、`ProjectWorkspace.tsx:809`、`CaptionWorkspace.tsx:42` 等）。
  3. 加一条 CI grep：禁止 `@layer components` 中定义与 Tailwind utility 同名的类（`grid/flex/hidden/card...`）。
- 验收：960/1024/1280/1512 四档截图，首页为单栏堆叠（≥1280 才两栏），无 <100px 文本列。

### P0-2 工作区窄窗不降级

- 位置：`products/studio/src/workspace/ProjectWorkspace.tsx:65,83-91,142-151,366,444`；`products/studio/src/client/state.ts:48-53`；`products/desktop/src/main.ts:525`（`minWidth: 960`）
- 机理：`wasNarrow` 初值就是 `width < 1100`，启动即窄窗时 effect 永不触发；`commitLayout` 只 clamp 单栏（160–640/220–640），没有「中心区最小宽」；左右栏默认持久化 280/320。
- 影响：1024 预览 207px，900 预览 83px 且工具栏裁切；浏览器 150%/200% 缩放等价 1008/756 CSS px，同样命中。
- 修复（R1，1–2 天）：
  1. 渲染期派生而不是只靠 resize effect：`const narrow = width < 1240` → 强制折叠两侧/收成 rail；挂载时也执行一次。
  2. 钳制：`available = innerWidth - 216 - 24; left + right ≤ available - 520`，并给主区 `min-width: 320px`；拖拽与持久化共用同一钳制函数。
  3. 两档降级：`<1100` 左栏改 36px rail 或 header 内 popover；`<900` 右栏改底部 sheet（expand-inflow 的行内详情），而不是并排。
  4. （产品决策二选一或同时做）把桌面 `minWidth` 提到 ≥1180 并在说明里写「不支持窄窗」——但不能保持现状。
- 验收：1024 预览 ≥480px、900 ≥360px；工具栏不裁切；纯键盘可用；布局偏好持久化不丢。

### P0-3 加载失败 = 永久「加载项目…」

- 位置：`products/studio/src/workspace/ProjectWorkspace.tsx:116`；`products/studio/src/session/useProjectSession.ts:1018-1032`
- 现状：`if (!draft || !ctx) return <p className="p-6">加载项目…</p>`；失败只 `fail(reason)`，不退出加载态、无重试，页面死锁；列表首次请求与真正空态也不可区分（`ProjectHome.tsx:137`、`LibraryPanel.tsx:194`、`JobsPage.tsx:148`）。
- 违反：pending-taxonomy（壳未知要占位、失败要能退出）、empty-taxonomy（加载失败是 retry，不是空、不是进度）。
- 修复：`session` 增加 `contextState: 'idle'|'loading'|'ready'|'failed'` 与 `listsStatus`；`ProjectWorkspace` 按状态渲染——loading＝工作区骨架（左右栏+预览灰块，占真实布局）/ failed＝整页错误卡（原因 + 重试 + 返回项目列表）/ ready＝现有内容；列表 loading 用 2–3 行骨架，failed 保留上次列表 + 行内重试。
- 验收：断开 API 启动 → 首屏出现错误卡而非死等；恢复 API 点重试可继续。

### P0-4 错误反馈只有 toast 一条路

- 位置：`products/studio/src/session/useProjectSession.ts:66-73`（`pushToast`，cap 4）、`:130-141`（`fail`）；`products/studio/src/ui/ToastStack.tsx:20`（`fixed top-[68px] right-5 w-80`，danger 不自动消失、无重试/无留档）；全仓 52 处 `fail/setError` 调用
- 现状：保存/制作/应用方案/采用字幕等失败，用户只看到远离操作位置、永不自动消失、关掉即永久丢失的一条浮条；轮询/SSE 失败会按 1–2s 节奏重复叠到 4 条；`act()` 成功也不清理旧错误。
- 违反：notify-taxonomy（强·警告应固定在内容区，处理前不消失）、validation-taxonomy（行内报错不是 toast）、empty-taxonomy（失败可重试并保留列表）。
- 修复（R1）：toast 增加 `action?: {label, run}`、`key` 去重、`persist`；`fail(reason, {region, retry})` 把错误同时写入失败区域的 inline 错误位；工作区 header 下增加可关闭的错误横幅（复用 `workspace-banner`）承接最近一次失败；轮询/流式错误降级为一条常驻状态行（「作业连接中断，正在重试…」），连续失败 N 次再升级警告；成功只保留「界面推不出的结果」toast。
- 验收：任意保存/制作失败可在操作附近看到原因与重试；连续轮询失败只出现一条状态行；关闭错误后可从任务页/诊断页追溯。

---

## 4. P1 设计系统 / 壳层 / 可及性

| id | 位置 | 问题 | 改法 | R |
| --- | --- | --- | --- | --- |
| S3 | `index.css:3-88`；`ui/*.tsx` 14 处 `rounded-[…]`、6 处 `shadow-[…]` | 27 个 `lw-*` 令牌只映射 16 个进 `@theme`；radius 三档未被组件使用，`--radius-control` 死令牌；弹窗遮罩两套；stage/类型色硬编码 | 补齐 `subtle/line-strong/accent-text/*-line/stage-well/overlay` 映射；新增 `.ui-popover/.ui-dialog/.ui-overlay` 共享视觉层；UI 层禁止 hex 与 arbitrary radius | R1 |
| S4 | `index.css:796-804,1199-1216`；`ProjectWorkspace.tsx:759-769` | `stage-well` 是「手写的第二暗色主题」，只覆写了部分组件；badge/seg/checkbox/field 仍取浅色令牌 | 把 stage 改成局部令牌作用域（`--lw-panel/ink/muted/line/...` 在 `.stage-well` 内重定义），删除逐组件覆写与 TSX 内联色 | R1 |
| S5 | `index.css:670-677`（nav 分组 10px）、`:744-756`、`:1253-1257` | `--lw-subtle` 浅色对比度 **2.90:1**（canvas）/3.17:1（panel），却用于 10–11px 结构文本（导航分组、kbd、故事板序号） | 分组标签 12px/600 + `--lw-muted`（5.29:1）；序号/kbd 同理；或把浅色 subtle 调到 ≥4.5:1 | R0 |
| S6 | `index.css:131-137,166-169`；`ui/SearchInput.tsx:106` | `input:focus{outline:none}` 特定性压过全局 `:focus-visible`；SearchInput 再加 `ring-0 outline-none` → 键盘焦点只剩 1px 边框 | base 层保留 `:focus-visible` outline；`input:focus` 只做 border/shadow；SearchInput 去掉 `ring-0 outline-none`；Radix item 加 focus-visible ring | R0 |
| S7 | `index.css:460-500`；4 个页面 | 页面框架只做半套：`PageHeader` 仅 4 页用；`page-scroll` 仅首页用；内容宽 1120/896/1440/满宽四套；header 76/52/36 三套；`.two`/`.scroll-x` 死类 | 新建 `PageFrame(title, description, actions, measure)` + `ViewHeader` + `SplitView`；统一 24/20px 页面内边距 token | R1 |
| S8 | `ProjectWorkspace.tsx:275-286,376-379,479-498`；`SettingsPage.tsx:86-93` | 分段选择 3 种实现（tablist 无 roving/无 aria-controls、group+aria-pressed、Radix Tabs）；全仓 tabpanel/aria-controls = 0 | 抽 `ui/Segmented` + `useTabs`：roving tabindex、方向键/Home/End、`aria-controls`、`tabpanel`、`aria-labelledby` | R1 |
| S9 | `ProjectWorkspace.tsx:199-219,728-732`；`index.css:1134-1176` | 三条分隔条只能鼠标拖，无 `role=separator`/`aria-valuenow`，无方向键/Home/End/双击复位 | 按 layout-taxonomy 实现键盘 + ARIA；与 P0-2 共用钳制函数 | R1 |
| S10 | `index.css:1301-1340`；`AppShell.tsx`；`desktop/src/main.ts:525` | 216px rail 永远占位、不可折叠；断点 px 硬编码 1100/900 与 Tailwind rem 两套；`height:100%` 非 `100dvh` | <1100 rail 收 64px 图标栏；<900 顶部/off-canvas（或明确不支持）；`ClientState.layout` 加 rail 状态（zod 默认值 + 迁移）；统一断点 token | R1 |
| S11 | `index.css:189-196`；`SceneEditor.tsx:113,297,507`；`JobsPage.tsx:176` | 字号 10/11/12/13/14/15/16/22 + Tailwind 12/14/16 混用；`h3` 未定义，SceneEditor 章节标题 12px 与字段标签同权 | 定义 `--text-xs..display` 五档并映射；`h3` 13/600；每屏一个 h1（工作区项目名当前是 14px input） | R1 |
| S17 | `index.css:4-5`；`index.html` | 声明 IBM Plex Sans/Mono、Noto Sans SC，但**未加载任何字体**（`document.fonts` 0 条、构建 CSS 0 个 `font-face`）→ 跨平台落到 PingFang/雅黑，字宽行高不一致 | 桌面包自包含子集字体（`public/fonts` + `@font-face`，`font-display:swap`），或明确改系统栈并删掉未加载声明 | R0/R1 |
| S18 | `AppShell.tsx`；各页 `<main>` | 无 skip-to-content；路由切换焦点留在导航；`main` 无 id/tabIndex | 加 skip link + `#main`，导航成功后聚焦内容区 | R0 |
| S12 | `AppShell.tsx:86-120`；`commands.ts` | 搜索只搜项目名/ID；结果无 combobox/listbox 语义（`aria-activedescendant` 缺失）；无 ⌘K 命令面板 | 先补语义与无结果文案；中期 ⌘K 覆盖页面/设置分区/全局动作（可选） | R1 |
| S13/S14/S15/S19/S20 | `index.css:298-328,1077-1092`；`ui/ConfirmDialog.tsx`、`Modal.tsx`、`ToastStack.tsx` | 控件高度魔数（28/30/34/36/44/52/76）；workspace-title 用 9 个 `!important` 对抗 base；两套遮罩色/圆角/阴影；主题入口重复（rail 三段 + 设置外观下拉）；`.split-page` 无基类只在 @media 出现、`!items-start` 打补丁 | 尺寸 token；`.ui-input--bare`（components 层，无需 !important）；统一 overlay/popover/toast 视觉；主题入口收敛为一处；补 `.split-page` 基类 | R1 |

---

## 5. P1 交互与反馈

| id | 位置 | 问题 | 改法 | R |
| --- | --- | --- | --- | --- |
| IF-03 | `LibraryPanel.tsx:244-262`；`ProjectWorkspace.tsx:528,352` | 删库项、删场景、「用服务器内容覆盖草稿」一键直执：无撤销、无危险视觉、无对象回显 | 三档落地：库项删除＝乐观隐藏 + 5s 撤销 toast；场景删除＝行内 Popconfirm；覆盖草稿＝Modal（说明已备份、影响范围） | R1 |
| IF-04 | `AppShell.tsx:213-225`；`useProjectSession.ts:699-710` | 退出对话框「放弃」实际会删除本地草稿备份，文案只说「修改还没写入项目」；4 个同级按钮、焦点不在取消 | 文案写清后果；按钮收敛为「保存并离开 / 保留草稿并离开 / 放弃修改(danger)」；焦点顺序 cancel-first | R0 |
| IF-05 | `useProjectSession.ts:303-315`；`LibraryPanel.tsx:408-424` | 全局 `busy` 单值：任何 act 都让保存按钮变「处理中」；库「保存版本」没接 pending，双击可发两次请求 | per-action pending 表（`useAction`）；`busy` 只用于整页阻断；库保存走 `session.act` + 幂等 requestId | R1 |
| IF-06 | `ProjectHome.tsx:137`；`LibraryPanel.tsx:194`；`JobsPage.tsx:148` | 列表首次加载（`[]`）直接渲染「还没有…」，与真实空态混同 | `listsStatus` + 骨架行；failed 保留上次列表 + 重试 | R1 |
| IF-07 | `ProjectWorkspace.tsx:775-797`；`JobsPage.tsx:176` | 作业进度＝节点完成比，重试/失败会倒退；无阶段文案；任务页无进度条 | `ProgressBar`（monotonic + 阶段 + indeterminate）；任务详情复用 | R1 |
| IF-08 | `CreateProject.tsx:86-101`；`DeliveryPanel.tsx:112-236`；`BgmEditor.tsx:29-34` | 片名无 required；输出语言/画幅可全部取消；帧率/LUFS/peak 无范围；译文语言是自由文本 | `FormField`（required/error/success/aria）；校验三时机显式声明；数值 clamp；语言改枚举选择 | R1 |
| IF-09 | `useRunList.ts:20-49`；`useRunStream.ts:89-94`；`JobsPage.tsx:74,95` | 轮询/SSE 每次失败都新增 danger toast，最多叠 4 条互挤 | toast 按 key 去重/计数；降级为常驻状态行；连续失败升级横幅 | R1 |
| IF-10 | `SettingsPage.tsx:120`（UiSelect 唯一）、`ProjectWorkspace.tsx:290`（Menu 唯一）；8+ 处裸 `<select>` | 「选一个值」两套实现，Modal 与 ConfirmDialog 平行 | 定规则：动作→Menu；2–5 枚举→NativeSelect 封装；≥6/分组/搜索→UiSelect 扩展；确认→Confirm v2/Popconfirm | R1 |
| IF-11 | `session.edit`；删除场景/字幕/证据 | 无 undo/redo；删除即从 draft 消失，唯一恢复是重开项目 | 最小 undo 栈（内存 50 步）+ ⌘Z/⇧⌘Z；删除类操作成功后 5s 撤销 toast | R2（可排后） |
| IF-12…22 | 见临时报告 | 成功保存每次弹 toast；搜索无结果不提示改词；引导条常驻不可关；无消息留档；导出无进行中/不可重复；CaptionAssist 状态裸 `<small>`；Jobs 错误裸 `JSON.stringify`；库删除无乐观更新；Dropzone 不校验 accept；覆盖草稿成功后无回执；ConfirmDialog API 太窄 | 按 notify/fill/guide/optimistic-rollback 规则逐项修 | R0/R1 |

---

## 6. P1/P2 页面布局与排版

### 6.1 高频 P1（按页面）

| id | 页面 | 位置 | 问题 | 改法 |
| --- | --- | --- | --- | --- |
| LP-03 | 项目首页 | `ProjectHome.tsx:79-104` | 三步引导卡常驻首屏 ~350px，10 个项目时仍压住「继续最近创作」 | 引导压缩为一行状态条，或仅无项目/首次进入时完整显示 |
| LP-04 | 项目首页 | `ProjectHome.tsx:141` | 空态写「从右侧创建草稿」，<1280 布局下创建卡在下方，文案误导 | 删方向词（「创建草稿或从示例开始」） |
| LP-05 | 项目首页 | `.section-title` + `ProjectHome.tsx:81-86` | 窄列时 h2 与说明同行，h2 被压到 1–2 字/行 | `flex-wrap` + `small{flex-basis:100%}` + h2 `min-width` |
| LP-06 | 新建项目 | `CreateProject.tsx:71,98` | 一张卡里两个 primary（打开示例/创建空白草稿）；说明卡再套一层 | 拆两 section（border-top 分隔），示例为唯一 primary，空白草稿 secondary |
| LP-07 | 工作区 | `ProjectWorkspace.tsx:383-398` vs `:517-535` | 左栏「场景」与底部「故事板」同构重复 | 二选一：底部作为唯一场景索引，左栏改大纲或去掉场景 seg |
| LP-08 | 工作区 | `ProjectWorkspace.tsx:473-539`；`client/state.ts:51` | 非 edit 标签（字幕/声音/方案/交付）底部仍占 200px，长页面只剩 424px | `focus!=="edit"` 时底部自动收 36px；或底部仅 edit 提供 |
| LP-09 | 工作区 | `ProjectWorkspace.tsx:257-330` | 52px header 无 h1、项目名是 14px input；900 下三列 232/186/232 挤压 | 项目名升至 15–16px + sr-only h1；900 把语言/更多收进溢出菜单 |
| LP-10 | 工作区 | `ProjectWorkspace.tsx:574-577` | 空故事板卡用 `100vw` 猜容器，忽略 216 rail | 改 `min(620px,100%)` |
| LP-11/12 | 设置/引擎 | `SettingsPage.tsx:150-156,268-349`；`EngineSettings.tsx:347-510` | panel-card 套 panel-card；EngineSettings 1183 行、主按钮在滚动末尾，日志把按钮顶走 | 外层一张卡 + `border-t` 分段；拆「一键配置（sticky 摘要 + 主按钮 + 进度）」与「组件清单/高级」 |
| LP-13 | 设置/模型 | `ModelSettings.tsx:401-407,582-618` | 列表→详情在同一滚动容器切换，返回顶部 + scrollIntoView 对长页不可靠 | 详情做成固定 header 的二级视图/路由段；统一 `ModelDetail` 骨架 |
| LP-14/15 | 库页 | `LibraryPanel.tsx:201-262,409-432`；`:186-191` | 主按钮在长表单末尾；行常驻编辑/删除；三个 kind 描述/空态完全相同 | sticky 动作条；行只留编辑、删除进更多菜单；按 kind 写描述/空态 |
| LP-16 | 任务 | `JobsPage.tsx:135-197` | 900 堆叠后列表 212px/详情 367px；筛选在 PageHeader 换行；节点卡套卡 | 筛选移列表栏顶；节点改单列紧凑列表（序号+标签+状态右对齐+错误展开） |
| LP-17 | 交付 | `DeliveryPanel.tsx:239-252,254-335` | 5 个导出按钮同权无主操作；交付选择与导出按钮分离；历史未按「当前/过期/历史/缺失」分组（README 承诺） | sticky 主「导出」+ 格式 Popover；历史分组 + 状态筛选；当前交付大卡 |
| LP-18/19 | 声音/证据/属性栏 | `ProjectWorkspace.tsx:697-703`+`BgmEditor.tsx:12`；`EvidencePanel.tsx:144-160`；`SceneEditor.tsx:113` | Bgm 双层卡；证据卡墙；属性栏 h3=12px 与字段标签同权 | 去套卡 + 单列列表；章节标题 13px/600 + 可选 sticky 段落头 |
| LP-20 | 全局 | `index.css:1301-1341` 等 | 断点 1280/1100/900/1024 散落，页面视口断点用在被容器包裹的组件上 | 定义 1440/1240/1100/960 四档；工作区/字幕/声音/设置用容器查询 |

### 6.2 P2（打磨项，随批次顺带）

间距 12/16/20/24 混用（LP-21）；`mask-fields` 在 320 栏变 3+1 列（LP-22）；`source-window-controls` 3 列挤压（LP-23）；`key-value-list` 标签列 32% 过宽（LP-24）；容器查询两套实现（LP-25）；内容宽四套 1120/896/1440/满宽（LP-26）；项目行 `surface-card` 阴影 ×10（LP-27）；折叠块全用 panel-card（LP-28）；引导条低密度三句（LP-29）；「添加卡片/静帧/片段」出现在三处（LP-30）。

---

## 7. 值得保留（重构时不要顺手拆掉）

1. `lw-*` 双主题语义令牌 + `@theme inline` 桥接方向正确；补全映射即可，不换方案。
2. `public/theme.js` 在 `<head>` 同步预置主题，无闪烁；桌面/浏览器两条路径都覆盖。
3. 客户端状态放数据目录（非 localStorage），含 hydration、冲突合并、draft 迁移与 keepalive flush。
4. Radix 承载全部浮层；`HintProvider` 统一 delay；「Radix 行为 + 自定义视觉层」的分工保持。
5. 原语 API 用 `data-variant/data-size/data-tone` 而非散落 class，调用点短。
6. `.scroll-region`（`min-height:0 + scrollbar-gutter:stable + overscroll-behavior:contain + thin`）是内滚不抖的根因。
7. 工作区三栏可拖拽 + 36px 折叠 rail + 横向故事板（1512 下清晰，暗色稳定）——模型本身对，问题在窄窗。
8. 字幕主从用 **container query**（760px）而不是视口断点，是正确现代范式，应推广。
9. SceneEditor 用留白 + `border-b` + 编号分段而非卡片；plan-beat 用时间轴；AssetPanel 用 row-item + 分隔线分组。
10. `tabular-nums`、`72ch` 提示行宽、`text-wrap: balance/pretty`、`prefers-reduced-motion` 全局兜底、暗色对比度整体达标。
11. 交互层硬功夫：toast danger 不自动消失 + hover/focus 暂停；退出对话框 Esc/点外 = cancel；ModelPathField 字段级异步校验；下载用真实 `received/total`；SSE `after=seq` 续传；`session.act` 单飞闸门 / `saveFate` / `stableRequest` 幂等。

---

## 8. 是否需要重构：判断与路线

**判断：需要 R1 模块级重构，不需要 R2 架构级重写。**

| 层 | 判断 | 理由 |
| --- | --- | --- |
| 壳层 / 导航模型 | 保留，补退化 | 216 rail + app-sheet + 三栏是成立的桌面模型；缺 collapse/narrow 状态机 |
| 设计系统 | **R1 重组**（不做独立包/Storybook） | 令牌有中心、无单一消费通道；CSS 1351 行混层；页面框架半套；`.grid` 事故证明「两套布局语言」必须收口 |
| 反馈层 | **R1** | 缺 P0 级状态机（AsyncRegion / per-action pending / 确认阶梯 / 撤销 / 进度）；不推翻 session 并发保护 |
| 页面 IA | R1 分批 | 设置/引擎/交付/库/任务的长表单与主操作位置需重排；不是每页重画 |
| 视觉语言 | 保留 + token 化 | 浅/暗主题完成度高，问题是个别对比度/字号/字体来源 |

**建议批次（可独立验收）**

### 批次 0 —— 止血 P0（0.5–1 天，独立 PR）
- `.grid` 改名 + 首页显式单列；工作区启动窄窗折叠 + 中心最小宽 + 布局钳制；加载失败退出死锁；nav 对比度；`focus-visible` 恢复；去掉 workspace-title 的 `!important`。
- 验收：960/1024/1280/1512 截图无破碎；960×640 预览 ≥320px；键盘 Tab 到搜索/菜单/输入框均有可见焦点；无新增 console error。

### 批次 1 —— 设计系统收口（1.5–2 天）
- 令牌 27/27 映射、CSS 拆 `tokens/base/shell/components/pages`、`.ui-popover/.ui-dialog/.ui-overlay`、stage 局部令牌、字号/尺寸/间距 token、字体策略（自包含或系统栈）、两套遮罩统一。
- 验收：`src/ui` 中 hex 与 `rounded-[…]`/`shadow-[…]` 为 0；`index.css` 目标 ≤600 行；浅暗逐页对照无回归。

### 批次 2 —— 页面框架 + 壳层响应式 + 可及性（1.5–2 天）
- `PageFrame/ViewHeader/SplitView` 迁移 4 主页面 + 5 工作区标签；rail 三态（216/64/<900）；resizer 键盘 + separator；`Segmented/useTabs`；skip link；h1 契约。
- 验收：header 只有 76/52/36 三档；窄窗主区 ≥360px；纯键盘完成三向分隔调整；工作区 tab 有 roving + `aria-controls`。

### 批次 3 —— 反馈层原语（1.5–2 天）
- `AsyncRegion/ListState`、`useAction` per-action pending、`ConfirmDialog v2 + Popconfirm + Undo`、`ProgressBar/RunStatus`、`FormField`；错误就地化 + toast 去重/动作；列表 loading 骨架。
- 验收：保存/制作/删除失败均可就地重试；删除可撤销；作业进度单调且有阶段；表单必填/范围/校验一次说完。

### 批次 4 —— 页面 IA 与打磨（2–3 天）
- 设置摘要（先皮后因）+ EngineSettings 拆分；模型列表/详情二级视图；交付主操作 + 历史分组；库 sticky 动作条 + 按 kind 文案；任务筛选/节点列表；首页引导降级；去卡片嵌套；断点统一；CI 规则（禁 !important、禁 ui 层 hex、禁同名类、禁 arbitrary radius）。
- 验收：交付页只有一个主行动且历史按状态分组；库表单保存按钮始终可见；任务页 900 下主从可用；`/tmp/lw-ui-audit/shots` 基线截图为对照。

**风险与缓解**

- 层叠顺序：当前有 unlayered 媒体查询压过 Tailwind utilities；拆 CSS 前先存整套截图基线，每批只动一类规则。
- `ClientState.layout` 增字段需 zod 默认值 + 旧状态迁移，否则老用户 parse 失败。
- `.grid` 改名波及 `ModelSettings.tsx:444`（唯一合法使用点），先全局搜 `className` 中的 `grid`。
- 产品决策需先定：① 最小窗口宽度（提高 minWidth 还是做窄窗布局，建议同时钳制 + 1100 降级）；② 字体（离线自包含 vs 系统栈）；③ 主题入口保留一处；④ 交付是否只主推「视频」一种格式。

---

## 9. LightUI 原则对照总表

| 原则 | Studio 表现 | 结论 |
| --- | --- | --- |
| layout-taxonomy 先定骨架 | 主页面/主从/分栏骨架正确；首页窄屏退化成 auto-fill 格子；三套 header/四种内容宽 | 局部偏离（P0 + P1） |
| sidebar-taxonomy 空间模型 | 216 占位 rail 模型正确；缺折叠态与窄窗替代 | 部分偏离 |
| nav-taxonomy 入口与退化 | 分组清晰；无 ⌘K/页面搜索；小屏无替代入口 | 部分偏离 |
| dashboard-layers 先皮后因 | 设置页无「就绪摘要」，状态散落各卡 | 偏离（P1） |
| group-taxonomy 卡片只装独立对象 | 独立对象用卡正确；步骤/字段/证据/诊断大量套卡，存在卡套卡 | 部分偏离（P1） |
| hero-taxonomy 第一眼回答什么 | 首页先答「怎么用」而非「继续哪部片」；交付页无唯一主行动 | 偏离（P1） |
| align-craft 基线/数位/两端 | 数字等宽、按钮高对齐输入框；key-value 标签列过宽、section-title 不换行、字号塌陷 | 部分偏离（P1/P2） |
| overflow-trace 先测越界 | 已复现 4 个越界元素；`100vw` 猜容器；`auto-fill 220` 未做容器约束 | 偏离（P0） |
| table-taxonomy 找/看/改分层 | 任务/库主从成立；筛选在页头、行操作常驻 | 局部偏离（P1） |
| expand-inflow 折叠在流里 | `<details>` 方向正确；但每块成卡、列表→详情无定位 | 部分偏离（P2） |
| locator-taxonomy 长页定位 | 设置/引擎/库表单无锚点/分段/sticky；交付历史无状态筛选 | 偏离（P1） |
| confirm-taxonomy 打断阶梯 | 只有退出流程用了模态；删除/覆盖无撤销/无确认/无危险视觉；「取消作业」直执是正确的 | 明显偏离（P1） |
| notify-taxonomy 通知分档 | 失败全压成 toast、无重试/留档；保存成功每次弹 | 明显偏离（P0/P1） |
| empty-taxonomy 空因 | 交付/字幕/方案/故事板空态有下一步；首次加载伪装成空；搜索空态不改词 | 部分偏离（P1） |
| pending-taxonomy 等待占位 | 无骨架；加载项目纯文本且失败不退 | 明显偏离（P0） |
| progress-taxonomy 进度 | 下载真实 received/total（好）；作业进度可倒退、无阶段 | 部分偏离（P1） |
| optimistic-rollback | 草稿本地即时生效（好）；库删除无乐观/无回滚 | 部分符合（P2） |
| 单一令牌/单一主题 | `lw-*` 双主题 + theme.js（好）；映射不全、stage 第二主题、字体声明未加载 | 部分偏离（P1） |
| 可及性/动效克制 | reduced-motion、scroll chrome、container query（好）；对比度、focus-visible、tab/resizer 语义不足 | 部分偏离（P1） |

---

## 10. 附：本次审查不做的事

- 未修改任何仓库文件（本报告除外）；未 build、未跑测试、未启停产品服务。
- 未覆盖：桌面壳（Electron 窗口/托盘/启动页）、study-films、非 UI 的运行链。
- 未做产品需求判断的内容（需产品确认）：项目删除/归档入口不存在；库项「删除」语义实为隐藏但文案叫删除；交付「当前/过期/历史/缺失」只在 README 描述、界面未分组。
