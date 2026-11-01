export type GroupName =
  | "项目与素材"
  | "创作与分析"
  | "制作与交付"
  | "模型与数据"
  | "运行与维护";

export const GROUP_ORDER: readonly GroupName[] = [
  "项目与素材",
  "创作与分析",
  "制作与交付",
  "模型与数据",
  "运行与维护",
];

export type FlagSpec = {
  readonly name: string;
  readonly value: "none" | "text";
  readonly description: string;
  readonly choices?: readonly string[];
  readonly placeholder?: string;
};

export type PositionalSpec = {
  readonly name: string;
  readonly description: string;
  readonly required: boolean;
};

export type RequirementCondition = {
  readonly name: FlagName;
  readonly present?: true;
  readonly absent?: true;
  readonly equals?: readonly string[];
};

export type Requirement =
  | {
      readonly kind: "flag";
      readonly name: FlagName;
      readonly conditions?: readonly RequirementCondition[];
    }
  | {
      readonly kind: "alternative";
      readonly label: string;
      readonly choices: readonly (
        | { readonly kind: "flag"; readonly name: FlagName }
        | { readonly kind: "positional"; readonly name: string }
      )[];
    };

export type CommandSpec = {
  readonly path: readonly string[];
  readonly group: GroupName;
  readonly summary: string;
  readonly synopsis: string;
  readonly flags: readonly FlagName[];
  readonly positionals?: readonly PositionalSpec[];
  readonly requirements?: readonly Requirement[];
  readonly exclusiveFlags?: readonly (readonly [FlagName, FlagName])[];
  readonly examples: readonly string[];
  readonly notes?: readonly string[];
};

const FLAG_LIST = [
  {
    name: "help",
    value: "none",
    description: "显示当前作用域帮助；兼容 -h",
  },
  {
    name: "json",
    value: "none",
    description: "stdout 输出单行 JSON；与 --human 互斥",
  },
  {
    name: "human",
    value: "none",
    description: "stdout 输出紧凑人类可读视图；与 --json 互斥",
  },
  {
    name: "data-dir",
    value: "text",
    description: "覆盖 LightWeaver 运行数据目录",
    placeholder: "/absolute/data",
  },
  {
    name: "config-file",
    value: "text",
    description: "覆盖配置文件路径",
    placeholder: "/absolute/config.local.yaml",
  },
  {
    name: "config-base",
    value: "text",
    description: "覆盖配置相对路径基准",
    placeholder: "/absolute/base",
  },
  {
    name: "project",
    value: "text",
    description: "项目 ID",
    placeholder: "ID",
  },
  {
    name: "request-id",
    value: "text",
    description: "稳定请求 ID；相同请求可使用同一值安全重试",
    placeholder: "ID",
  },
  {
    name: "expected-revision",
    value: "text",
    description: "乐观并发控制所需的当前项目修订",
    placeholder: "REV",
  },
  {
    name: "expected-version",
    value: "text",
    description: "乐观并发控制所需的当前库版本",
    placeholder: "DIGEST",
  },
  {
    name: "title",
    value: "text",
    description: "项目标题",
    placeholder: "TEXT",
  },
  {
    name: "workflow",
    value: "text",
    description: "项目工作流",
    placeholder: "NAME",
  },
  {
    name: "sample",
    value: "none",
    description: "创建三张卡片的 starter 示例项目",
  },
  {
    name: "revision",
    value: "text",
    description: "读取指定历史修订",
    placeholder: "REV",
  },
  {
    name: "ops",
    value: "text",
    description: "编辑操作 JSON 文件",
    placeholder: "/absolute/ops.json",
  },
  {
    name: "file",
    value: "text",
    description: "输入文件",
    placeholder: "/absolute/file",
  },
  {
    name: "asset-id",
    value: "text",
    description: "显式素材 ID",
    placeholder: "ID",
  },
  {
    name: "name",
    value: "text",
    description: "显式素材名称",
    placeholder: "TEXT",
  },
  {
    name: "provenance",
    value: "text",
    description: "素材来源 JSON 文件",
    placeholder: "/absolute/provenance.json",
  },
  {
    name: "item",
    value: "text",
    description: "库项 ID",
    placeholder: "ID",
  },
  {
    name: "version",
    value: "text",
    description: "不可变版本摘要",
    placeholder: "DIGEST",
  },
  {
    name: "media",
    value: "text",
    description: "库项参考媒体文件",
    placeholder: "/absolute/media",
  },
  {
    name: "package-version",
    value: "text",
    description: "内置包版本摘要",
    placeholder: "DIGEST",
  },
  {
    name: "locale",
    value: "text",
    description: "语言标签",
    placeholder: "LOCALE",
  },
  {
    name: "source-id",
    value: "text",
    description: "素材 ID",
    placeholder: "ASSET",
  },
  {
    name: "source-version",
    value: "text",
    description: "精确素材版本摘要",
    placeholder: "DIGEST",
  },
  {
    name: "target-locale",
    value: "text",
    description: "目标语言标签",
    placeholder: "LOCALE",
  },
  {
    name: "run",
    value: "text",
    description: "作业 ID",
    placeholder: "RUN",
  },
  {
    name: "append",
    value: "none",
    description: "追加到现有项目",
  },
  {
    name: "from-us",
    value: "text",
    description: "分析窗口起点，单位微秒",
    placeholder: "US",
  },
  {
    name: "duration-us",
    value: "text",
    description: "分析窗口时长，单位微秒",
    placeholder: "US",
  },
  {
    name: "profiles",
    value: "text",
    description: "逗号分隔的输出 profile",
    placeholder: "landscape,portrait",
  },
  {
    name: "locales",
    value: "text",
    description: "逗号分隔的目标语言",
    placeholder: "zh,en",
  },
  {
    name: "regenerate",
    value: "none",
    description: "使用新 generation 重新生成",
  },
  {
    name: "plan",
    value: "none",
    description: "只检查制作计划，不提交作业",
  },
  {
    name: "wait",
    value: "none",
    description: "等待作业到达终态",
  },
  {
    name: "progress",
    value: "none",
    description: "等待时向 stderr 输出进度；非 TTY 必须显式传入",
  },
  {
    name: "after",
    value: "text",
    description: "只返回 seq 大于该值的事件",
    placeholder: "SEQ",
  },
  {
    name: "import",
    value: "text",
    description: "从人工证据 JSON 文件导入",
    placeholder: "/absolute/evidence.json",
  },
  {
    name: "with",
    value: "text",
    description: "逗号分隔的分析能力",
    placeholder: "asr,describe",
  },
  {
    name: "provider",
    value: "text",
    description: "显式 provider ID",
    placeholder: "ID",
  },
  {
    name: "align",
    value: "none",
    description: "使用精确对齐",
  },
  {
    name: "width",
    value: "text",
    description: "截图宽度",
    placeholder: "PIXELS",
  },
  {
    name: "height",
    value: "text",
    description: "截图高度",
    placeholder: "PIXELS",
  },
  {
    name: "selector",
    value: "text",
    description: "截图 CSS 选择器",
    placeholder: "CSS",
  },
  {
    name: "dest",
    value: "text",
    description: "输出目标",
    placeholder: "/absolute/path",
  },
  {
    name: "query",
    value: "text",
    description: "检索查询",
    placeholder: "TEXT",
  },
  {
    name: "mode",
    value: "text",
    description: "检索模式",
    placeholder: "text|semantic|visual",
    choices: ["text", "semantic", "visual"],
  },
  {
    name: "rerank",
    value: "none",
    description: "语义检索后执行重排",
  },
  {
    name: "sources",
    value: "text",
    description: "逗号分隔的素材 ID",
    placeholder: "ID,ID",
  },
  {
    name: "to-us",
    value: "text",
    description: "检索窗口终点，单位微秒",
    placeholder: "US",
  },
  {
    name: "edited",
    value: "text",
    description: "待匹配的剪辑素材 ID",
    placeholder: "ASSET",
  },
  {
    name: "select",
    value: "text",
    description: "逗号分隔的候选 ID",
    placeholder: "ID,ID",
  },
  {
    name: "allow-reuse",
    value: "none",
    description: "允许复用候选",
  },
  {
    name: "ranges",
    value: "text",
    description: "候选裁剪 JSON 文件",
    placeholder: "/absolute/ranges.json",
  },
  {
    name: "root",
    value: "text",
    description: "模型目录或旧工作区根目录",
    placeholder: "/absolute/root",
  },
  {
    name: "path",
    value: "text",
    description: "既有模型或可执行文件路径",
    placeholder: "/absolute/path",
  },
  {
    name: "text",
    value: "text",
    description: "文本或试听内容",
    placeholder: "TEXT",
  },
  {
    name: "style",
    value: "text",
    description: "音色风格说明",
    placeholder: "TEXT",
  },
  {
    name: "voice",
    value: "text",
    description: "音色库项 ID",
    placeholder: "ID",
  },
  {
    name: "voice-version",
    value: "text",
    description: "音色版本摘要",
    placeholder: "DIGEST",
  },
  {
    name: "format",
    value: "text",
    description: "导出格式",
    placeholder: "video|bundle|otio|jianying",
    choices: ["video", "bundle", "otio", "jianying"],
  },
  {
    name: "delivery",
    value: "text",
    description: "显式交付 ID",
    placeholder: "ID",
  },
  {
    name: "drafts-root",
    value: "text",
    description: "剪映草稿根目录",
    placeholder: "/absolute/drafts",
  },
  {
    name: "id",
    value: "text",
    description: "库项或导入项目 ID",
    placeholder: "ID",
  },
  {
    name: "apply",
    value: "none",
    description: "执行 GC 或显式采用当前值",
  },
  {
    name: "dry-run",
    value: "none",
    description: "只检查迁移",
  },
  {
    name: "execute",
    value: "none",
    description: "执行迁移",
  },
  {
    name: "kind",
    value: "text",
    description: "场景类型",
    placeholder: "card|still|clip",
    choices: ["card", "still", "clip"],
  },
  {
    name: "label",
    value: "text",
    description: "场景标签；卡片省略时使用标题",
    placeholder: "TEXT",
  },
  {
    name: "headline",
    value: "text",
    description: "卡片标题；card 必填",
    placeholder: "TEXT",
  },
  {
    name: "body",
    value: "text",
    description: "卡片要点，每行一个；省略时生成标题卡",
    placeholder: "TEXT",
  },
  {
    name: "source",
    value: "text",
    description: "素材 ID；用于 still/clip 或恢复来源",
    placeholder: "ASSET|/absolute/backup",
  },
  {
    name: "start",
    value: "text",
    description: "源片起点秒数，最多六位小数",
    placeholder: "SEC",
  },
  {
    name: "duration",
    value: "text",
    description: "场景时长秒数，最多六位小数",
    placeholder: "SEC",
  },
  {
    name: "scene-id",
    value: "text",
    description: "显式场景 ID；缺省时从 --request-id 稳定派生",
    placeholder: "ID",
  },
  {
    name: "dir",
    value: "text",
    description: "交接包目录",
    placeholder: "/absolute/package",
  },
  {
    name: "url",
    value: "text",
    description: "截图网页 URL",
    placeholder: "https://example.com",
  },
  {
    name: "proposal",
    value: "text",
    description: "候选方案 ID",
    placeholder: "PROPOSAL",
  },
] as const satisfies readonly FlagSpec[];

type FlagName = (typeof FLAG_LIST)[number]["name"];

export const FLAG_SPECS: ReadonlyMap<string, FlagSpec> = new Map(
  FLAG_LIST.map((flag) => [flag.name, flag]),
);

export const GLOBAL_FLAG_NAMES: readonly FlagName[] = [
  "help",
  "json",
  "human",
  "data-dir",
  "config-file",
  "config-base",
];

const MUTATION_FLAGS: readonly FlagName[] = ["request-id"];

const PROJECT_REVISION_FLAGS: readonly FlagName[] = [
  "project",
  "expected-revision",
  ...MUTATION_FLAGS,
];

const WAIT_FLAGS: readonly FlagName[] = ["wait", "progress"];

export const COMMANDS: readonly CommandSpec[] = [
  {
    path: ["doctor"],
    group: "模型与数据",
    summary: "检查本机工具、配置和 provider 就绪度",
    synopsis: "doctor [--human|--json]",
    flags: [],
    examples: ["weaver doctor --human", "weaver doctor --json"],
  },
  {
    path: ["capabilities"],
    group: "模型与数据",
    summary: "读取工作流、输出规格、provider 和内置包能力",
    synopsis: "capabilities [--json]",
    flags: [],
    examples: ["weaver capabilities --json"],
  },
  {
    path: ["models", "list"],
    group: "模型与数据",
    summary: "列出本地模型、下载状态和当前绑定",
    synopsis: "models list [--human|--json]",
    flags: [],
    examples: ["weaver models list --human", "weaver models list --json"],
  },
  {
    path: ["models", "settings", "get"],
    group: "模型与数据",
    summary: "读取模型配置、来源和下载根目录",
    synopsis: "models settings get [--human|--json]",
    flags: [],
    examples: ["weaver models settings get --human"],
  },
  {
    path: ["models", "settings", "set"],
    group: "模型与数据",
    summary: "保存模型设置补丁",
    synopsis: "models settings set --file /absolute/model-settings.json",
    flags: ["file", ...MUTATION_FLAGS],
    requirements: [{ kind: "flag", name: "file" }],
    examples: [
      "weaver models settings set --file /absolute/model-settings.json --json",
    ],
  },
  {
    path: ["models", "download"],
    group: "模型与数据",
    summary: "下载并校验 catalog 中的本地模型",
    synopsis: "models download MODEL_ID [--root /absolute/root] [--wait]",
    flags: ["root", ...WAIT_FLAGS, ...MUTATION_FLAGS],
    positionals: [
      { name: "model-id", description: "catalog 模型 ID", required: true },
    ],
    examples: ["weaver models download qwen3-asr --wait --progress --json"],
  },
  {
    path: ["models", "verify"],
    group: "模型与数据",
    summary: "核验本地模型文件大小和摘要",
    synopsis: "models verify MODEL_ID [--root /absolute/root]",
    flags: ["root"],
    positionals: [
      { name: "model-id", description: "catalog 模型 ID", required: true },
    ],
    examples: ["weaver models verify qwen3-asr --json"],
  },
  {
    path: ["models", "use"],
    group: "模型与数据",
    summary: "采用既有模型文件或目录",
    synopsis: "models use MODEL_ID --path /absolute/path --expected-revision CONFIG_REV",
    flags: ["path", ...MUTATION_FLAGS],
    positionals: [
      { name: "model-id", description: "catalog 模型 ID", required: true },
    ],
    requirements: [{ kind: "flag", name: "path" }, { kind: "flag", name: "expected-revision" }],
    examples: ["weaver models use qwen3-asr --path /absolute/qwen3-asr --expected-revision CONFIG_REV --json"],
  },
  {
    path: ["models", "use-provider"],
    group: "模型与数据",
    summary: "采用完整远端模型 provider 预设",
    synopsis: "models use-provider PROVIDER_ID --expected-revision CONFIG_REV",
    flags: [...MUTATION_FLAGS],
    positionals: [
      { name: "provider-id", description: "provider ID", required: true },
    ],
    requirements: [{ kind: "flag", name: "expected-revision" }],
    examples: ["weaver models use-provider modelbest --expected-revision CONFIG_REV --json"],
  },
  {
    path: ["schema"],
    group: "模型与数据",
    summary: "输出运行时 Zod 合同生成的 JSON Schema",
    synopsis: "schema [SCHEMA] [--json|--human]",
    flags: [],
    positionals: [
      {
        name: "schema",
        description: "合同名称，缺省为 project",
        required: false,
      },
    ],
    examples: ["weaver schema scene --json", "weaver schema scene --human"],
    notes: [
      "--human 只显示合同摘要；需要完整 schema 时使用 --json 或重定向 stdout。",
    ],
  },
  {
    path: ["project", "list"],
    group: "项目与素材",
    summary: "列出每个项目的当前 head，不返回历史修订",
    synopsis: "project list [--human|--json]",
    flags: [],
    positionals: [],
    examples: ["weaver project list --human", "weaver project list --json"],
  },
  {
    path: ["project", "create"],
    group: "项目与素材",
    summary: "创建空项目或三卡片 starter 示例",
    synopsis:
      "project create PROJECT_ID [--title TEXT] [--workflow NAME] [--sample]",
    flags: ["title", "workflow", "sample", ...MUTATION_FLAGS],
    positionals: [
      { name: "project-id", description: "新项目 ID", required: true },
    ],
    examples: [
      "weaver project create first-film --sample --json",
      "weaver project create explainer --workflow study-explainer --title '讲解片' --human",
    ],
  },
  {
    path: ["project", "show"],
    group: "项目与素材",
    summary: "读取项目当前 head 或显式历史修订",
    synopsis: "project show [PROJECT_ID] [--project ID] [--revision REV]",
    flags: ["project", "revision"],
    positionals: [
      { name: "project-id", description: "项目 ID", required: false },
    ],
    requirements: [
      {
        kind: "alternative",
        label: "项目 ID",
        choices: [
          { kind: "flag", name: "project" },
          { kind: "positional", name: "project-id" },
        ],
      },
    ],
    examples: ["weaver project show first-film --human"],
  },
  {
    path: ["project", "apply"],
    group: "项目与素材",
    summary: "以显式 expectedRevision 提交编辑操作",
    synopsis:
      "project apply --project ID --ops /absolute/ops.json --expected-revision REV",
    flags: ["ops", ...PROJECT_REVISION_FLAGS],
    requirements: [
      { kind: "flag", name: "project" },
      { kind: "flag", name: "ops" },
      { kind: "flag", name: "expected-revision" },
    ],
    examples: [
      "weaver project apply --project first-film --ops /absolute/ops.json --expected-revision rev-... --json",
    ],
  },
  {
    path: ["project", "import"],
    group: "项目与素材",
    summary: "更新项目文档并生成新修订",
    synopsis:
      "project import --project ID --file /absolute/document.json --expected-revision REV",
    flags: ["file", ...PROJECT_REVISION_FLAGS],
    requirements: [
      { kind: "flag", name: "project" },
      { kind: "flag", name: "file" },
      { kind: "flag", name: "expected-revision" },
    ],
    examples: [
      "weaver project import --project first-film --file /absolute/document.json --expected-revision rev-... --json",
    ],
  },
  {
    path: ["project", "brief"],
    group: "项目与素材",
    summary: "生成绑定当前工作区的 agent 交接说明",
    synopsis: "project brief [PROJECT_ID] [--project ID] [--human]",
    flags: ["project"],
    positionals: [
      { name: "project-id", description: "项目 ID", required: false },
    ],
    requirements: [
      {
        kind: "alternative",
        label: "项目 ID",
        choices: [
          { kind: "flag", name: "project" },
          { kind: "positional", name: "project-id" },
        ],
      },
    ],
    examples: ["weaver project brief first-film --human"],
  },
  {
    path: ["project", "context"],
    group: "项目与素材",
    summary: "读取修订、素材、证据、作业和交付上下文",
    synopsis: "project context [PROJECT_ID] [--project ID] [--json]",
    flags: ["project"],
    positionals: [
      { name: "project-id", description: "项目 ID", required: false },
    ],
    requirements: [
      {
        kind: "alternative",
        label: "项目 ID",
        choices: [
          { kind: "flag", name: "project" },
          { kind: "positional", name: "project-id" },
        ],
      },
    ],
    examples: ["weaver project context first-film --json"],
  },
  {
    path: ["scene", "add"],
    group: "项目与素材",
    summary: "用显式 OCC 添加 card、still 或 clip",
    synopsis:
      "scene add --project ID --kind card|still|clip --duration SEC --expected-revision REV [--scene-id ID]",
    flags: [
      "project",
      "kind",
      "locale",
      "label",
      "headline",
      "body",
      "source",
      "start",
      "duration",
      "scene-id",
      "expected-revision",
      ...MUTATION_FLAGS,
    ],
    requirements: [
      { kind: "flag", name: "project" },
      { kind: "flag", name: "kind" },
      { kind: "flag", name: "duration" },
      { kind: "flag", name: "expected-revision" },
      {
        kind: "flag",
        name: "headline",
        conditions: [{ name: "kind", equals: ["card"] }],
      },
      {
        kind: "flag",
        name: "source",
        conditions: [{ name: "kind", equals: ["still", "clip"] }],
      },
    ],
    examples: [
      "weaver scene add --project first-film --kind card --label '开场' --headline '从这里开始' --body $'修改卡片文字\\n保存并制作' --duration 3 --expected-revision rev-... --json",
      "weaver scene add --project first-film --kind still --source cover --duration 4 --expected-revision rev-... --json",
      "weaver scene add --project first-film --kind clip --source source-1 --start 10.5 --duration 4 --expected-revision rev-... --json",
    ],
    notes: [
      "card 只生成纯文字固定时长场景，不创建 speech。",
      "still 和 clip 从当前项目该修订中的精确素材引用构造。",
      "scene ID 缺省时从 request-id 稳定派生；locale 必须属于项目语言。",
      "body 可选，按行转换成卡片要点；省略时生成标题卡，label 默认取 headline。",
    ],
  },
  {
    path: ["asset", "add"],
    group: "项目与素材",
    summary: "导入素材并生成项目修订",
    synopsis:
      "asset add --project ID --file /absolute/media --expected-revision REV",
    flags: [
      "file",
      "asset-id",
      "name",
      "provenance",
      ...PROJECT_REVISION_FLAGS,
    ],
    requirements: [
      { kind: "flag", name: "project" },
      { kind: "flag", name: "file" },
      { kind: "flag", name: "expected-revision" },
    ],
    examples: [
      "weaver asset add --project first-film --file /absolute/source.mp4 --expected-revision rev-... --json",
    ],
  },
  {
    path: ["asset", "adopt"],
    group: "项目与素材",
    summary: "采用库项版本到当前项目",
    synopsis:
      "asset adopt --project ID --item ITEM --version DIGEST --expected-revision REV",
    flags: ["item", "version", ...PROJECT_REVISION_FLAGS],
    requirements: [
      { kind: "flag", name: "project" },
      { kind: "flag", name: "item" },
      { kind: "flag", name: "version" },
      { kind: "flag", name: "expected-revision" },
    ],
    examples: [
      "weaver asset adopt --project first-film --item cover --version 0123... --expected-revision rev-... --json",
    ],
  },
  {
    path: ["library", "list"],
    group: "项目与素材",
    summary: "列出库项当前版本",
    synopsis: "library list [--json|--human]",
    flags: [],
    examples: ["weaver library list --json"],
  },
  {
    path: ["library", "show"],
    group: "项目与素材",
    summary: "读取库项指定版本或当前版本",
    synopsis: "library show [ITEM] [--id ITEM --version DIGEST]",
    flags: ["id", "version"],
    positionals: [{ name: "item", description: "库项 ID", required: false }],
    requirements: [
      {
        kind: "alternative",
        label: "库项 ID",
        choices: [
          { kind: "flag", name: "id" },
          { kind: "positional", name: "item" },
        ],
      },
    ],
    examples: ["weaver library show cover --version 0123... --json"],
  },
  {
    path: ["library", "set"],
    group: "项目与素材",
    summary: "导入库项并生成不可变版本",
    synopsis:
      "library set --file /absolute/payload.json [--id ITEM --expected-version DIGEST]",
    flags: ["file", "media", "id", "expected-version", ...MUTATION_FLAGS],
    requirements: [{ kind: "flag", name: "file" }],
    examples: [
      "weaver library set --file /absolute/payload.json --media /absolute/reference.wav --json",
    ],
  },
  {
    path: ["library", "delete"],
    group: "项目与素材",
    summary: "在显式版本锁下删除库 head",
    synopsis: "library delete --id ITEM --expected-version DIGEST",
    flags: ["id", "expected-version", ...MUTATION_FLAGS],
    requirements: [
      { kind: "flag", name: "id" },
      { kind: "flag", name: "expected-version" },
    ],
    examples: [
      "weaver library delete --id cover --expected-version 0123... --json",
    ],
  },
  {
    path: ["library", "import-builtin"],
    group: "项目与素材",
    summary: "按 capabilities 返回的版本显式导入内置包",
    synopsis: "library import-builtin --package-version DIGEST",
    flags: ["package-version", ...MUTATION_FLAGS],
    requirements: [{ kind: "flag", name: "package-version" }],
    examples: [
      "weaver library import-builtin --package-version 0123... --json",
    ],
  },
  {
    path: ["captions", "import"],
    group: "创作与分析",
    summary: "导入 SRT 或 VTT 字幕",
    synopsis:
      "captions import --project ID --file /absolute/subtitles.srt --locale zh --expected-revision REV",
    flags: [
      "file",
      "locale",
      "source-id",
      "source-version",
      ...PROJECT_REVISION_FLAGS,
    ],
    requirements: [
      { kind: "flag", name: "project" },
      { kind: "flag", name: "file" },
      { kind: "flag", name: "locale" },
      { kind: "flag", name: "expected-revision" },
      {
        kind: "flag",
        name: "source-version",
        conditions: [{ name: "source-id", present: true }],
      },
      {
        kind: "flag",
        name: "source-id",
        conditions: [{ name: "source-version", present: true }],
      },
    ],
    examples: [
      "weaver captions import --project first-film --file /absolute/subtitles.srt --locale zh --expected-revision rev-... --json",
    ],
  },
  {
    path: ["captions", "from-analysis"],
    group: "创作与分析",
    summary: "采用分析作业中的源字幕",
    synopsis:
      "captions from-analysis --project ID --locale zh --expected-revision REV [--run RUN]",
    flags: ["locale", "source-id", "run", ...PROJECT_REVISION_FLAGS],
    requirements: [
      { kind: "flag", name: "project" },
      { kind: "flag", name: "locale" },
      { kind: "flag", name: "expected-revision" },
    ],
    examples: [
      "weaver captions from-analysis --project first-film --locale zh --expected-revision rev-... --json",
    ],
  },
  {
    path: ["captions", "translate"],
    group: "创作与分析",
    summary: "提交字幕翻译作业",
    synopsis:
      "captions translate --project ID --locale zh --target-locale en --expected-revision REV [--wait]",
    flags: [
      "locale",
      "target-locale",
      ...PROJECT_REVISION_FLAGS,
      ...WAIT_FLAGS,
    ],
    requirements: [
      { kind: "flag", name: "project" },
      { kind: "flag", name: "locale" },
      { kind: "flag", name: "target-locale" },
      { kind: "flag", name: "expected-revision" },
    ],
    examples: [
      "weaver captions translate --project first-film --locale zh --target-locale en --expected-revision rev-... --wait --progress --json",
    ],
  },
  {
    path: ["captions", "apply-translation"],
    group: "创作与分析",
    summary: "采用翻译作业结果并生成新修订",
    synopsis:
      "captions apply-translation --project ID --run RUN --expected-revision REV",
    flags: ["run", ...PROJECT_REVISION_FLAGS],
    requirements: [
      { kind: "flag", name: "project" },
      { kind: "flag", name: "run" },
      { kind: "flag", name: "expected-revision" },
    ],
    examples: [
      "weaver captions apply-translation --project first-film --run run-... --expected-revision rev-... --json",
    ],
  },
  {
    path: ["creative-plan", "import"],
    group: "创作与分析",
    summary: "校验并保存待审创作方案",
    synopsis:
      "creative-plan import --project ID --file /absolute/plan.json --expected-revision REV",
    flags: ["file", ...PROJECT_REVISION_FLAGS],
    requirements: [
      { kind: "flag", name: "project" },
      { kind: "flag", name: "file" },
      { kind: "flag", name: "expected-revision" },
    ],
    examples: [
      "weaver creative-plan import --project first-film --file /absolute/plan.json --expected-revision rev-... --json",
    ],
  },
  {
    path: ["creative-plan", "show"],
    group: "创作与分析",
    summary: "显示项目中的待审创作方案",
    synopsis: "creative-plan show --project ID",
    flags: ["project"],
    requirements: [{ kind: "flag", name: "project" }],
    examples: ["weaver creative-plan show --project first-film --human"],
  },
  {
    path: ["creative-plan", "apply"],
    group: "创作与分析",
    summary: "显式采用创作方案",
    synopsis:
      "creative-plan apply --project ID --expected-revision REV [--append]",
    flags: ["append", ...PROJECT_REVISION_FLAGS],
    requirements: [
      { kind: "flag", name: "project" },
      { kind: "flag", name: "expected-revision" },
    ],
    examples: [
      "weaver creative-plan apply --project first-film --expected-revision rev-... --json",
    ],
  },
  {
    path: ["speakers", "analyze"],
    group: "创作与分析",
    summary: "提交说话人分段分析",
    synopsis:
      "speakers analyze --project ID --source-id ASSET --locale zh [--wait]",
    flags: [
      "source-id",
      "locale",
      "from-us",
      "duration-us",
      ...MUTATION_FLAGS,
      ...WAIT_FLAGS,
    ],
    requirements: [
      { kind: "flag", name: "project" },
      { kind: "flag", name: "source-id" },
      { kind: "flag", name: "locale" },
    ],
    examples: [
      "weaver speakers analyze --project first-film --source-id interview --locale zh --wait --progress --json",
    ],
  },
  {
    path: ["speakers", "apply"],
    group: "创作与分析",
    summary: "采用说话人分段结果",
    synopsis: "speakers apply --project ID --run RUN --expected-revision REV",
    flags: ["run", ...PROJECT_REVISION_FLAGS],
    requirements: [
      { kind: "flag", name: "project" },
      { kind: "flag", name: "run" },
      { kind: "flag", name: "expected-revision" },
    ],
    examples: [
      "weaver speakers apply --project first-film --run run-... --expected-revision rev-... --json",
    ],
  },
  {
    path: ["build"],
    group: "制作与交付",
    summary: "检查整片制作；提交时必须指定已审核 revision",
    synopsis:
      "build --project ID [--expected-revision REV] [--locales zh,en] [--profiles landscape] [--plan|--wait]",
    flags: [
      "project",
      "expected-revision",
      "locales",
      "profiles",
      "regenerate",
      "plan",
      ...WAIT_FLAGS,
      ...MUTATION_FLAGS,
    ],
    requirements: [
      { kind: "flag", name: "project" },
      { kind: "flag", name: "expected-revision", conditions: [{ name: "plan", absent: true }] },
    ],
    examples: [
      "weaver build --project first-film --plan --json",
      "weaver build --project first-film --expected-revision rev-... --wait --progress --json",
    ],
    notes: ["--plan 只读检查可以省略 revision；实际提交必须携带已审核计划返回的 --expected-revision。"],
  },
  {
    path: ["run", "list"],
    group: "制作与交付",
    summary: "列出最近作业",
    synopsis: "run list [--project ID] [--human|--json]",
    flags: ["project"],
    examples: ["weaver run list --project first-film --human"],
  },
  {
    path: ["run", "status"],
    group: "制作与交付",
    summary: "读取作业和节点状态",
    synopsis: "run status RUN [--human|--json]",
    flags: [],
    positionals: [{ name: "run-id", description: "作业 ID", required: true }],
    examples: ["weaver run status run-... --human"],
  },
  {
    path: ["run", "cancel"],
    group: "制作与交付",
    summary: "请求取消作业",
    synopsis: "run cancel RUN",
    flags: [],
    positionals: [{ name: "run-id", description: "作业 ID", required: true }],
    examples: ["weaver run cancel run-... --json"],
  },
  {
    path: ["run", "resume"],
    group: "制作与交付",
    summary: "恢复未完成作业",
    synopsis: "run resume RUN [--wait]",
    flags: [...WAIT_FLAGS],
    positionals: [{ name: "run-id", description: "作业 ID", required: true }],
    examples: ["weaver run resume run-... --wait --progress --json"],
  },
  {
    path: ["run", "events"],
    group: "制作与交付",
    summary: "读取单个作业的事件数组",
    synopsis: "run events RUN [--after SEQ]",
    flags: ["after"],
    positionals: [{ name: "run-id", description: "作业 ID", required: true }],
    examples: ["weaver run events run-... --after 0 --json"],
  },
  {
    path: ["events"],
    group: "制作与交付",
    summary: "以 JSONL 输出作业事件快照",
    synopsis: "events RUN [--after SEQ]",
    flags: ["after"],
    positionals: [{ name: "run-id", description: "作业 ID", required: true }],
    examples: ["weaver events run-... --after 0"],
  },
  {
    path: ["analyze"],
    group: "创作与分析",
    summary: "提交源片分析或导入人工证据",
    synopsis:
      "analyze --project ID [--with asr,describe] [--import /absolute/evidence.json] [--wait]",
    flags: [
      "project",
      "expected-revision",
      "import",
      "with",
      "source-id",
      "provider",
      "locale",
      "from-us",
      "duration-us",
      "regenerate",
      "align",
      ...MUTATION_FLAGS,
      ...WAIT_FLAGS,
    ],
    requirements: [
      { kind: "flag", name: "project" },
      {
        kind: "flag",
        name: "expected-revision",
        conditions: [{ name: "import", present: true }],
      },
    ],
    examples: [
      "weaver analyze --project first-film --with asr --align --locale zh --wait --progress --json",
      "weaver analyze --project first-film --import /absolute/evidence.json --expected-revision rev-... --wait --json",
    ],
  },
  {
    path: ["describe"],
    group: "创作与分析",
    summary: "提交画面观察作业",
    synopsis: "describe --project ID [--provider ID] [--wait]",
    flags: [
      "project",
      "source-id",
      "provider",
      "locale",
      "from-us",
      "duration-us",
      "regenerate",
      ...MUTATION_FLAGS,
      ...WAIT_FLAGS,
    ],
    requirements: [{ kind: "flag", name: "project" }],
    examples: [
      "weaver describe --project first-film --source-id source-1 --wait --json",
    ],
  },
  {
    path: ["transcribe"],
    group: "创作与分析",
    summary: "提交源片转写作业",
    synopsis:
      "transcribe --project ID [--source-id ASSET --locale zh] [--wait]",
    flags: [
      "project",
      "source-id",
      "locale",
      "from-us",
      "duration-us",
      "regenerate",
      ...MUTATION_FLAGS,
      ...WAIT_FLAGS,
    ],
    requirements: [{ kind: "flag", name: "project" }],
    examples: [
      "weaver transcribe --project first-film --source-id interview --locale zh --wait --json",
    ],
  },
  {
    path: ["capture"],
    group: "创作与分析",
    summary: "截取网页画面并保存为项目素材",
    synopsis:
      "capture --url https://example.com [--project ID] [--wait] [--dest /absolute/image.png]",
    flags: [
      "project",
      "url",
      "width",
      "height",
      "selector",
      ...MUTATION_FLAGS,
      ...WAIT_FLAGS,
      "dest",
    ],
    requirements: [{ kind: "flag", name: "url" }],
    examples: [
      "weaver capture --url https://example.com --wait --dest /absolute/image.png --json",
    ],
  },
  {
    path: ["search"],
    group: "创作与分析",
    summary: "在已存证据和画面中检索候选",
    synopsis:
      "search --project ID --query TEXT [--mode text|semantic|visual] [--wait]",
    flags: [
      "project",
      "query",
      "mode",
      "rerank",
      "sources",
      "from-us",
      "to-us",
      ...MUTATION_FLAGS,
      ...WAIT_FLAGS,
    ],
    requirements: [
      { kind: "flag", name: "project" },
      { kind: "flag", name: "query" },
    ],
    examples: [
      "weaver search --project first-film --query '需要的画面' --mode semantic --wait --progress --json",
    ],
  },
  {
    path: ["match"],
    group: "创作与分析",
    summary: "把剪辑素材匹配到源片候选",
    synopsis:
      "match --project ID --edited ASSET [--sources ASSET,ASSET] [--wait]",
    flags: ["project", "edited", "sources", ...MUTATION_FLAGS, ...WAIT_FLAGS],
    requirements: [
      { kind: "flag", name: "project" },
      { kind: "flag", name: "edited" },
    ],
    examples: [
      "weaver match --project first-film --edited edited-asset --wait --json",
    ],
  },
  {
    path: ["proposal", "import"],
    group: "创作与分析",
    summary: "校验并导入外部候选方案",
    synopsis:
      "proposal import --project ID --file /absolute/proposal.json --expected-revision REV [--wait]",
    flags: ["file", ...PROJECT_REVISION_FLAGS, ...WAIT_FLAGS],
    requirements: [
      { kind: "flag", name: "project" },
      { kind: "flag", name: "file" },
      { kind: "flag", name: "expected-revision" },
    ],
    examples: [
      "weaver proposal import --project first-film --file /absolute/proposal.json --expected-revision rev-... --wait --json",
    ],
  },
  {
    path: ["proposal", "apply"],
    group: "创作与分析",
    summary: "显式采用候选方案",
    synopsis:
      "proposal apply --project ID --proposal PROPOSAL --select ID,ID --expected-revision REV",
    flags: [
      "proposal",
      "select",
      "allow-reuse",
      "ranges",
      ...PROJECT_REVISION_FLAGS,
    ],
    requirements: [
      { kind: "flag", name: "project" },
      { kind: "flag", name: "proposal" },
      { kind: "flag", name: "select" },
      { kind: "flag", name: "expected-revision" },
    ],
    examples: [
      "weaver proposal apply --project first-film --proposal proposal-... --select candidate-1 --expected-revision rev-... --json",
    ],
  },
  {
    path: ["asr"],
    group: "创作与分析",
    summary: "对独立音视频执行转写",
    synopsis:
      "asr --file /absolute/media [--locale zh] [--wait] [--dest /absolute/result.json]",
    flags: [
      "file",
      "provider",
      "locale",
      ...MUTATION_FLAGS,
      ...WAIT_FLAGS,
      "dest",
    ],
    requirements: [{ kind: "flag", name: "file" }],
    examples: [
      "weaver asr --file /absolute/audio.wav --locale zh --wait --dest /absolute/result.json --json",
    ],
  },
  {
    path: ["tts"],
    group: "创作与分析",
    summary: "对独立文本执行语音合成",
    synopsis:
      "tts --text TEXT [--voice ID --voice-version DIGEST] [--wait] [--dest /absolute/speech.wav]",
    flags: [
      "text",
      "provider",
      "voice",
      "voice-version",
      "locale",
      ...MUTATION_FLAGS,
      ...WAIT_FLAGS,
      "dest",
    ],
    requirements: [{ kind: "flag", name: "text" }],
    examples: [
      "weaver tts --text '试听内容' --provider local-voxcpm2 --wait --dest /absolute/speech.wav --json",
    ],
  },
  {
    path: ["voice-design"],
    group: "创作与分析",
    summary: "生成音色设计试听",
    synopsis:
      "voice-design --text TEXT [--style TEXT] [--wait] [--dest /absolute/preview.wav]",
    flags: [
      "text",
      "style",
      "provider",
      ...MUTATION_FLAGS,
      ...WAIT_FLAGS,
      "dest",
    ],
    requirements: [{ kind: "flag", name: "text" }],
    examples: [
      "weaver voice-design --text '试听内容' --style '温和自然' --wait --dest /absolute/preview.wav --json",
    ],
  },
  {
    path: ["export"],
    group: "制作与交付",
    summary: "导出视频、bundle、OTIO 或剪映草稿",
    synopsis:
      "export --project ID --format video|bundle|otio|jianying --dest /absolute/path",
    flags: ["project", "format", "dest", "delivery", ...MUTATION_FLAGS],
    requirements: [
      { kind: "flag", name: "project" },
      { kind: "flag", name: "format" },
      { kind: "flag", name: "dest" },
    ],
    examples: [
      "weaver export --project first-film --format video --dest /absolute/movie.mp4 --json",
      "weaver export --project first-film --format bundle --dest /absolute/package.zip --json",
    ],
  },
  {
    path: ["export", "verify"],
    group: "制作与交付",
    summary: "核验交接包内容",
    synopsis: "export verify --dir /absolute/package",
    flags: ["dir"],
    requirements: [{ kind: "flag", name: "dir" }],
    examples: ["weaver export verify --dir /absolute/package --json"],
  },
  {
    path: ["export", "install"],
    group: "制作与交付",
    summary: "安装剪映草稿包",
    synopsis:
      "export install --dir /absolute/package [--drafts-root /absolute/drafts]",
    flags: ["dir", "drafts-root"],
    requirements: [{ kind: "flag", name: "dir" }],
    examples: ["weaver export install --dir /absolute/jianying-package --json"],
  },
  {
    path: ["import"],
    group: "制作与交付",
    summary: "导入 bundle 并创建独立项目",
    synopsis: "import --file /absolute/package.zip [--id PROJECT_ID]",
    flags: ["file", "id", ...MUTATION_FLAGS],
    requirements: [{ kind: "flag", name: "file" }],
    examples: [
      "weaver import --file /absolute/package.zip --id imported-project --json",
    ],
  },
  {
    path: ["artifact", "show"],
    group: "制作与交付",
    summary: "读取并校验 JSON 产物",
    synopsis: "artifact show DIGEST",
    flags: [],
    positionals: [
      { name: "digest", description: "JSON 产物摘要", required: true },
    ],
    examples: ["weaver artifact show 0123... --json"],
  },
  {
    path: ["artifacts"],
    group: "制作与交付",
    summary: "列出项目制作交付",
    synopsis: "artifacts --project ID [--human|--json]",
    flags: ["project"],
    requirements: [{ kind: "flag", name: "project" }],
    examples: ["weaver artifacts --project first-film --human"],
  },
  {
    path: ["backup"],
    group: "运行与维护",
    summary: "创建一致性备份",
    synopsis: "backup [--dest /absolute/empty-backup]",
    flags: ["dest"],
    examples: ["weaver backup --dest /absolute/empty-backup --json"],
  },
  {
    path: ["restore"],
    group: "运行与维护",
    summary: "从一致性备份恢复到空目录",
    synopsis: "restore --source /absolute/backup --dest /absolute/empty-state",
    flags: ["source", "dest"],
    requirements: [
      { kind: "flag", name: "source" },
      { kind: "flag", name: "dest" },
    ],
    examples: [
      "weaver restore --source /absolute/backup --dest /absolute/empty-state --json",
    ],
  },
  {
    path: ["gc"],
    group: "运行与维护",
    summary: "检查或执行不可达内容回收",
    synopsis: "gc [--apply]",
    flags: ["apply"],
    examples: ["weaver gc --json", "weaver gc --apply --json"],
  },
  {
    path: ["migrate"],
    group: "运行与维护",
    summary: "检查或执行旧工作区迁移",
    synopsis: "migrate --root /absolute/legacy-workspace [--dry-run|--execute]",
    flags: ["root", "dry-run", "execute", ...MUTATION_FLAGS],
    exclusiveFlags: [["dry-run", "execute"]],
    requirements: [{ kind: "flag", name: "root" }],
    examples: [
      "weaver migrate --root /absolute/legacy-workspace --dry-run --json",
      "weaver migrate --root /absolute/legacy-workspace --execute --request-id migration-1 --json",
    ],
  },
  {
    path: ["migrate", "rollback"],
    group: "运行与维护",
    summary: "按迁移 journal 回滚未修改的迁移",
    synopsis: "migrate rollback JOURNAL",
    flags: [],
    positionals: [
      { name: "journal", description: "迁移 journal ID", required: true },
    ],
    examples: ["weaver migrate rollback journal-... --json"],
  },
  {
    path: ["worker"],
    group: "运行与维护",
    summary: "运行后台作业 worker",
    synopsis: "worker",
    flags: [],
    examples: ["weaver worker"],
  },
];

export const NAMESPACE_SUMMARIES = new Map<string, string>([
  ["project", "创建、读取和提交项目修订"],
  ["scene", "用高层参数添加 card、still 或 clip"],
  ["asset", "向项目导入或采用素材"],
  ["library", "管理可复用库项版本"],
  ["captions", "导入、翻译和采用字幕"],
  ["creative-plan", "保存和采用创作方案"],
  ["speakers", "提交和采用说话人分段"],
  ["run", "查看、取消、恢复和读取作业"],
  ["models", "检查、下载和采用模型"],
  ["models settings", "读取和保存模型设置"],
  ["proposal", "导入和采用候选方案"],
  ["artifact", "读取不可变 JSON 产物"],
  ["export", "导出成片与交接包，或操作已有包"],
  ["migrate", "检查、执行或回滚旧工作区迁移"],
]);

export const TOP_LEVEL_ORDER: readonly string[] = [
  "project",
  "scene",
  "asset",
  "library",
  "captions",
  "creative-plan",
  "analyze",
  "describe",
  "transcribe",
  "search",
  "match",
  "proposal",
  "speakers",
  "asr",
  "tts",
  "voice-design",
  "capture",
  "build",
  "run",
  "artifacts",
  "artifact",
  "events",
  "export",
  "import",
  "doctor",
  "models",
  "capabilities",
  "schema",
  "backup",
  "restore",
  "gc",
  "migrate",
  "worker",
];

export type RootHelp = {
  readonly kind: "root";
  readonly usage: readonly string[];
  readonly groups: readonly {
    readonly name: GroupName;
    readonly commands: readonly {
      readonly name: string;
      readonly summary: string;
    }[];
  }[];
  readonly globalFlags: readonly {
    readonly name: string;
    readonly description: string;
  }[];
  readonly examples: readonly string[];
};

export type ScopeHelp = {
  readonly kind: "scope";
  readonly scope: string;
  readonly summary: string;
  readonly usage: readonly string[];
  readonly commands: readonly {
    readonly name: string;
    readonly summary: string;
  }[];
  readonly flags: readonly {
    readonly name: string;
    readonly value: "none" | "text";
    readonly description: string;
    readonly choices?: readonly string[];
    readonly placeholder?: string;
  }[];
  readonly examples: readonly string[];
  readonly notes: readonly string[];
};

export type HelpResult = RootHelp | ScopeHelp;

function pathKey(path: readonly string[]): string {
  return path.join(" ");
}

export function commandKey(spec: CommandSpec): string {
  return pathKey(spec.path);
}

export function findCommand(words: readonly string[]): CommandSpec | undefined {
  return [...COMMANDS]
    .sort((left, right) => right.path.length - left.path.length)
    .find(
      (spec) =>
        words.length >= spec.path.length &&
        spec.path.every((part, index) => words[index] === part),
    );
}

function namespacePaths(): string[][] {
  const paths = new Set<string>();
  for (const spec of COMMANDS)
    for (let length = 1; length < spec.path.length; length += 1)
      paths.add(pathKey(spec.path.slice(0, length)));
  return [...paths].map((path) => path.split(" "));
}

export function matchNamespace(words: readonly string[]): string[] | undefined {
  return namespacePaths()
    .sort((left, right) => right.length - left.length)
    .find(
      (path) =>
        words.length >= path.length &&
        path.every((part, index) => words[index] === part),
    );
}

export function rootHelp(): RootHelp {
  const byName = new Map(
    TOP_LEVEL_ORDER.map((name) => [
      name,
      findCommand([name]) || COMMANDS.find((spec) => spec.path[0] === name),
    ]),
  );
  return {
    kind: "root",
    usage: [
      "weaver <command> [arguments] [--json|--human]",
      "weaver <command> --help",
      "weaver help <command>",
    ],
    groups: GROUP_ORDER.map((group) => ({
      name: group,
      commands: TOP_LEVEL_ORDER.filter(
        (name) => byName.get(name)?.group === group,
      ).map((name) => ({
        name,
        summary:
          findCommand([name])?.summary ||
          NAMESPACE_SUMMARIES.get(name) ||
          "相关命令",
      })),
    })),
    globalFlags: GLOBAL_FLAG_NAMES.map((name) => {
      const spec = FLAG_SPECS.get(name);
      return {
        name,
        description: spec?.description || "",
      };
    }),
    examples: [
      "weaver project create first-film --sample --json",
      "weaver project list --human",
      "weaver scene add --help",
      "weaver capabilities --json",
    ],
  };
}

export function commandFlags(spec: CommandSpec): FlagName[] {
  return [
    ...new Set([
      ...spec.flags,
      ...(spec.exclusiveFlags || []).flat(),
      ...(spec.requirements || []).flatMap((requirement) =>
        requirement.kind === "flag"
          ? [
              requirement.name,
              ...(requirement.conditions || []).map(
                (condition) => condition.name,
              ),
            ]
          : requirement.choices.flatMap((choice) =>
              choice.kind === "flag" ? [choice.name] : [],
            ),
      ),
    ]),
  ];
}

function flagsFor(spec?: CommandSpec): ScopeHelp["flags"] {
  const names = [
    ...new Set([...GLOBAL_FLAG_NAMES, ...(spec ? commandFlags(spec) : [])]),
  ];
  return names.flatMap((name) => {
    const flag = FLAG_SPECS.get(name);
    if (!flag) return [];
    return [
      {
        name: flag.name,
        value: flag.value,
        description: flag.description,
        ...(flag.choices ? { choices: flag.choices } : {}),
        ...(flag.placeholder ? { placeholder: flag.placeholder } : {}),
      },
    ];
  });
}

export function scopeHelp(path: readonly string[]): HelpResult | undefined {
  const key = pathKey(path);
  const command: CommandSpec | undefined = COMMANDS.find(
    (spec) => pathKey(spec.path) === key,
  );
  const namespace = namespacePaths().find(
    (candidate) => pathKey(candidate) === key,
  );
  if (!command && !namespace) return undefined;

  const prefix = command?.path || namespace;
  if (!prefix) return undefined;
  const descendants = COMMANDS.filter(
    (spec) =>
      spec.path.length > prefix.length &&
      prefix.every((part, index) => spec.path[index] === part),
  );
  const immediateNames = [
    ...new Set(
      descendants
        .map((spec) => spec.path[prefix.length])
        .flatMap((part) => (part ? [part] : [])),
    ),
  ];
  const immediate = immediateNames.map((name) => {
    const exact = findCommand([...prefix, name]);
    return exact
      ? { name, summary: exact.summary }
      : {
          name,
          summary:
            NAMESPACE_SUMMARIES.get(pathKey([...prefix, name])) || "相关命令",
        };
  });
  const examples = [
    ...(command?.examples || []),
    ...descendants.flatMap((spec) => spec.examples.slice(0, 1)),
  ].slice(0, 6);
  return {
    kind: "scope",
    scope: key,
    summary:
      command?.summary || NAMESPACE_SUMMARIES.get(key) || "LightWeaver 命令",
    usage: command ? [`weaver ${command.synopsis}`] : [],
    commands: immediate,
    flags: flagsFor(command),
    examples,
    notes: [
      ...(command?.notes || []),
      ...(command?.exclusiveFlags || []).map(
        ([left, right]) => `--${left} 与 --${right} 不能同时启用`,
      ),
    ],
  };
}
