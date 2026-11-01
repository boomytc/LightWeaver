import {
  Delivery,
  ErrorProtocol,
  Issue,
  MediaAssetVersion,
  ModelSettingsView,
  ModelsView,
  ProjectRevision,
  RunRecord,
  z,
} from "../contracts/index.ts";
import type { HelpResult } from "./commands.ts";

type HumanSuccessInput = {
  readonly command: string;
  readonly result: unknown;
  readonly requestId: string;
  readonly nextActions: readonly string[];
};

const NodeView = z.object({
  key: z.string(),
  state: z.string(),
  attempts: z.number(),
  error: z.unknown().nullable(),
});

const RunDetail = z.object({
  run: RunRecord,
  nodes: z.array(NodeView),
});

const AssetAddView = z.object({
  asset: MediaAssetVersion,
  revision: ProjectRevision,
});

const BuildPlanView = z.object({
  revision: z.string(),
  steps: z.array(
    z.object({
      key: z.string(),
      operation: z.string(),
      provider: z.string(),
      cache: z.string(),
    }),
  ),
  issues: z.array(Issue),
  executesMediaOrModels: z.boolean(),
});

const ProjectContextView = z.object({
  revision: ProjectRevision,
  assets: z.array(z.unknown()),
  library: z.array(z.unknown()),
  analysis: z.array(z.unknown()),
  proposals: z.array(z.unknown()),
  runs: z.array(z.unknown()),
  deliveries: z.array(z.unknown()),
});

const DoctorView = z.object({
  node: z.string(),
  runtime: z.object({
    mode: z.string(),
    dataDir: z.string(),
    configFile: z.string(),
    resourcesDir: z.string(),
  }),
  sqlite: z.string(),
  checks: z.array(
    z.object({
      tool: z.string(),
      ok: z.boolean(),
      version: z.string(),
    }),
  ),
  providers: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      ready: z.boolean(),
      hint: z.string(),
    }),
  ),
});

const CapabilitiesSummary = z.object({
  runtime: z.object({
    mode: z.string(),
    dataDir: z.string(),
    configFile: z.string(),
    configBase: z.string(),
  }),
  workflows: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
    }),
  ),
  providers: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      ready: z.boolean(),
    }),
  ),
});

function short(value: string, length = 16): string {
  return value.length <= length ? value : `${value.slice(0, length)}...`;
}

function bool(value: boolean): string {
  return value ? "ready" : "missing";
}

function table(
  headers: readonly string[],
  rows: readonly (readonly string[])[],
): string[] {
  const widths = headers.map((header, index) =>
    Math.max(header.length, ...rows.map((row) => row[index]?.length || 0)),
  );
  const line = (cells: readonly string[]) =>
    cells
      .map((cell, index) => cell.padEnd(widths[index] || cell.length))
      .join("  ")
      .trimEnd();
  return [
    line(headers),
    widths.map((width) => "-".repeat(width)).join("  "),
    ...rows.map(line),
  ];
}

export function renderHelpHuman(help: HelpResult): string {
  const lines: string[] = [];
  if (help.kind === "root") {
    lines.push("LightWeaver CLI", "");
    for (const usage of help.usage) lines.push(`Usage: ${usage}`);
    for (const group of help.groups) {
      lines.push("", group.name);
      for (const command of group.commands)
        lines.push(`  ${command.name.padEnd(18)} ${command.summary}`);
    }
    lines.push("", "Global flags");
    for (const flag of help.globalFlags)
      lines.push(`  --${flag.name.padEnd(18)} ${flag.description}`);
    lines.push("", "Examples");
    for (const example of help.examples) lines.push(`  ${example}`);
    return `${lines.join("\n")}\n`;
  }
  lines.push(`weaver ${help.scope}`, "", help.summary);
  if (help.usage.length) {
    lines.push("", "Usage");
    for (const usage of help.usage) lines.push(`  ${usage}`);
  }
  if (help.commands.length) {
    lines.push("", "Commands");
    for (const command of help.commands)
      lines.push(`  ${command.name.padEnd(18)} ${command.summary}`);
  }
  if (help.flags.length) {
    lines.push("", "Flags");
    for (const flag of help.flags) {
      const value =
        flag.value === "none"
          ? ""
          : ` ${flag.placeholder || flag.choices?.join("|") || "VALUE"}`;
      lines.push(`  --${flag.name}${value}`.padEnd(32) + flag.description);
    }
  }
  if (help.examples.length) {
    lines.push("", "Examples");
    for (const example of help.examples) lines.push(`  ${example}`);
  }
  if (help.notes.length) {
    lines.push("", "Notes");
    for (const note of help.notes) lines.push(`  ${note}`);
  }
  return `${lines.join("\n")}\n`;
}

function renderProject(revision: z.infer<typeof ProjectRevision>): string[] {
  return [
    `${revision.document.title} (${revision.projectId})`,
    `Current head: ${revision.id}`,
    `Workflow: ${revision.document.workflow}`,
    `Scenes: ${revision.document.scenes.length}  Assets: ${revision.document.assets.length}  Locales: ${revision.document.locales.join(", ")}`,
  ];
}

function renderRun(run: z.infer<typeof RunRecord>): string[] {
  return [
    `Run ${run.id}`,
    `Kind: ${run.kind}  State: ${run.state}`,
    ...(run.projectId ? [`Project: ${run.projectId}`] : []),
    ...(run.error ? [`Error: ${run.error.code} ${run.error.message}`] : []),
  ];
}

function renderNodeTable(nodes: readonly z.infer<typeof NodeView>[]): string[] {
  return table(
    ["Node", "State", "Attempts"],
    nodes.map((node) => [node.key, node.state, String(node.attempts)]),
  );
}

function renderModels(view: z.infer<typeof ModelsView>): string[] {
  const rows = view.local.map((model) => [
    model.id,
    model.status.state,
    model.activeBindings
      .map((binding) => `${binding.setting}=${binding.value || "(unset)"}`)
      .join(", ") || "(none)",
  ]);
  return [
    `Models: ${view.local.length}  Downloads: ${view.downloads.length}`,
    ...table(["Model", "State", "Bindings"], rows),
  ];
}

function renderModelSettings(
  view: z.infer<typeof ModelSettingsView>,
): string[] {
  return [
    `Config: ${view.configPath}`,
    `Revision: ${view.revision}`,
    `Download root: ${view.downloadRoot.value || "(unset)"} (${view.downloadRoot.source})`,
    ...table(
      ["Setting", "Value", "Source"],
      Object.entries(view.values).map(([name, value]) => [
        name,
        value.value || "(unset)",
        value.source,
      ]),
    ),
  ];
}

function recordValue(value: unknown, key: string): unknown {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    key in value
    ? Reflect.get(value, key)
    : undefined;
}

function scalar(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  return undefined;
}

function renderSpecial(command: string, result: unknown): string[] | undefined {
  if (command === "project list") {
    const projects = z.array(ProjectRevision).safeParse(result);
    if (projects.success)
      return [
        `Projects: ${projects.data.length} (current heads only)`,
        ...(projects.data.length
          ? table(
              ["Project", "Title", "Workflow", "Scenes", "Current head"],
              projects.data.map((project) => [
                project.projectId,
                project.document.title,
                project.document.workflow,
                String(project.document.scenes.length),
                short(project.id, 20),
              ]),
            )
          : ["No projects."]),
      ];
  }
  if (
    command === "project create" ||
    command === "project show" ||
    command === "project apply" ||
    command === "project import" ||
    command === "scene add"
  ) {
    const revision = ProjectRevision.safeParse(result);
    if (revision.success) return renderProject(revision.data);
  }
  if (command === "project context") {
    const context = ProjectContextView.safeParse(result);
    if (context.success)
      return [
        ...renderProject(context.data.revision),
        `Assets: ${context.data.assets.length}  Library: ${context.data.library.length}`,
        `Analysis: ${context.data.analysis.length}  Proposals: ${context.data.proposals.length}`,
        `Runs: ${context.data.runs.length}  Deliveries: ${context.data.deliveries.length}`,
      ];
  }
  if (command === "asset add" || command === "asset adopt") {
    const asset = AssetAddView.safeParse(result);
    if (asset.success)
      return [
        `Asset ${asset.data.asset.assetId}: ${asset.data.asset.name}`,
        `Kind: ${asset.data.asset.kind}  Bytes: ${asset.data.asset.bytes}`,
        `Revision: ${asset.data.revision.id}`,
      ];
  }
  if (command === "doctor") {
    const doctor = DoctorView.safeParse(result);
    if (doctor.success)
      return [
        `Runtime: ${doctor.data.runtime.mode}`,
        `Data: ${doctor.data.runtime.dataDir}`,
        `Config: ${doctor.data.runtime.configFile}`,
        `Node: ${doctor.data.node}  SQLite: ${doctor.data.sqlite}`,
        "",
        ...table(
          ["Tool", "State", "Version"],
          doctor.data.checks.map((check) => [
            check.tool,
            check.ok ? "ok" : "missing",
            check.version || "-",
          ]),
        ),
        "",
        ...table(
          ["Provider", "State", "Hint"],
          doctor.data.providers.map((provider) => [
            provider.id,
            bool(provider.ready),
            provider.ready ? "-" : provider.hint,
          ]),
        ),
      ];
  }
  if (command === "models list") {
    const models = ModelsView.safeParse(result);
    if (models.success) return renderModels(models.data);
  }
  if (command === "models settings get") {
    const settings = ModelSettingsView.safeParse(result);
    if (settings.success) return renderModelSettings(settings.data);
  }
  if (command === "run list") {
    const runs = z.array(RunRecord).safeParse(result);
    if (runs.success)
      return runs.data.length
        ? table(
            ["Run", "Kind", "State", "Project"],
            runs.data.map((run) => [
              short(run.id, 20),
              run.kind,
              run.state,
              run.projectId || "-",
            ]),
          )
        : ["No runs."];
  }
  if (
    command === "models download" ||
    command === "captions translate" ||
    command === "speakers analyze" ||
    command === "run status" ||
    command === "run resume" ||
    command === "build" ||
    command === "analyze" ||
    command === "describe" ||
    command === "transcribe" ||
    command === "capture" ||
    command === "search" ||
    command === "match" ||
    command === "proposal import" ||
    command === "asr" ||
    command === "tts" ||
    command === "voice-design"
  ) {
    const run = RunRecord.safeParse(result);
    if (run.success) return renderRun(run.data);
    const detail = RunDetail.safeParse(result);
    if (detail.success)
      return [
        ...renderRun(detail.data.run),
        "",
        ...renderNodeTable(detail.data.nodes),
      ];
    const plan = BuildPlanView.safeParse(result);
    if (command === "build" && plan.success)
      return [
        `Plan revision: ${plan.data.revision}`,
        `Steps: ${plan.data.steps.length}  Issues: ${plan.data.issues.length}`,
        `Executes media or models: ${plan.data.executesMediaOrModels ? "yes" : "no"}`,
        ...(plan.data.issues.length
          ? [
              "",
              ...table(
                ["Severity", "Code", "Path", "Message"],
                plan.data.issues.map((issue) => [
                  issue.severity,
                  issue.code,
                  issue.path,
                  issue.message,
                ]),
              ),
            ]
          : ["Plan is ready."]),
      ];
  }
  if (command === "artifacts") {
    const deliveries = z.array(Delivery).safeParse(result);
    if (deliveries.success)
      return deliveries.data.length
        ? table(
            ["Delivery", "Target", "Revision", "Created"],
            deliveries.data.map((delivery) => [
              short(delivery.id, 20),
              delivery.target,
              short(delivery.revisionId, 20),
              delivery.createdAt,
            ]),
          )
        : ["No deliveries."];
  }
  if (command === "capabilities") {
    const capabilities = CapabilitiesSummary.safeParse(result);
    if (capabilities.success)
      return [
        `Runtime: ${capabilities.data.runtime.mode}`,
        `Data: ${capabilities.data.runtime.dataDir}`,
        `Workflows: ${capabilities.data.workflows.map((workflow) => workflow.id).join(", ")}`,
        `Providers: ${capabilities.data.providers.filter((provider) => provider.ready).length}/${capabilities.data.providers.length} ready`,
        "Use --json for the complete capability and provider descriptors.",
      ];
  }
  if (command === "schema") {
    const title =
      scalar(recordValue(result, "title")) ||
      scalar(recordValue(result, "$id")) ||
      "JSON Schema";
    return [
      `Schema: ${title}`,
      "Human mode keeps the full schema out of the terminal.",
      "Use --json or redirect stdout to save the complete contract.",
    ];
  }
  return undefined;
}

const SAFE_SUMMARY_KEYS: readonly string[] = [
  "id",
  "projectId",
  "title",
  "state",
  "kind",
  "revision",
  "revisionId",
  "digest",
  "count",
  "frames",
  "target",
  "format",
  "path",
  "dest",
  "deliveryId",
  "current",
];

function renderGeneric(result: unknown): string[] {
  if (typeof result === "string") return result.split("\n");
  if (Array.isArray(result)) return [`Items: ${result.length}`];
  const values = SAFE_SUMMARY_KEYS.flatMap((key) => {
    const value = scalar(recordValue(result, key));
    return value === undefined ? [] : [`${key}: ${value}`];
  });
  return values.length ? values : ["Command completed."];
}

export function renderHumanSuccess({
  command,
  result,
  requestId,
  nextActions,
}: HumanSuccessInput): string {
  const lines = [
    ...(renderSpecial(command, result) || renderGeneric(result)),
    "",
    `Request: ${requestId}`,
  ];
  if (nextActions.length) {
    lines.push("", "Next steps");
    nextActions.forEach((action, index) =>
      lines.push(`  ${index + 1}. ${action}`),
    );
  }
  return `${lines.join("\n")}\n`;
}

export function renderHumanError(error: z.infer<typeof ErrorProtocol>): string {
  const lines = [
    `${error.code}: ${error.message}`,
    `Retryable: ${error.retryable ? "yes" : "no"}`,
  ];
  if (error.hints.length) {
    lines.push("", "Hints");
    for (const hint of error.hints) lines.push(`  ${hint}`);
  }
  return `${lines.join("\n")}\n`;
}

export function shellArg(value: string): string {
  if (process.platform === "win32") return `'${value.replaceAll("'", "''")}'`;
  return `'${value.replaceAll("'", "'\"'\"'")}'`;
}

function projectFromResult(
  result: unknown,
): z.infer<typeof ProjectRevision> | undefined {
  const direct = ProjectRevision.safeParse(result);
  if (direct.success) return direct.data;
  const asset = AssetAddView.safeParse(result);
  return asset.success ? asset.data.revision : undefined;
}

function runFromResult(result: unknown): z.infer<typeof RunRecord> | undefined {
  const direct = RunRecord.safeParse(result);
  if (direct.success) return direct.data;
  const detail = RunDetail.safeParse(result);
  return detail.success ? detail.data.run : undefined;
}

export function nextActions(
  command: string,
  result: unknown,
  baseCommand: string,
  projectIdValue?: string,
): string[] {
  const project = projectFromResult(result),
    run = runFromResult(result);
  if (command === "project create" && project)
    return [
      project.document.scenes.length
        ? `${baseCommand} build --project ${shellArg(project.projectId)} --expected-revision ${shellArg(project.id)} --plan --json`
        : `${baseCommand} scene add --project ${shellArg(project.projectId)} --kind card --headline '从这里开始' --duration 3 --expected-revision ${shellArg(project.id)} --json`,
      `${baseCommand} project brief ${shellArg(project.projectId)} --json`,
    ];
  if ((command === "asset add" || command === "asset adopt") && project) {
    const asset = AssetAddView.safeParse(result);
    const add = !asset.success
      ? null
      : asset.data.asset.kind === "image"
        ? `${baseCommand} scene add --project ${shellArg(project.projectId)} --kind still --source ${shellArg(asset.data.asset.assetId)} --duration 3 --expected-revision ${shellArg(project.id)} --json`
        : asset.data.asset.kind === "video"
          ? `${baseCommand} scene add --help --human`
          : null;
    return [
      `${baseCommand} project context ${shellArg(project.projectId)} --json`,
      ...(add ? [add] : []),
    ];
  }

  if (command === "scene add" && project)
    return [
      `${baseCommand} build --project ${shellArg(project.projectId)} --expected-revision ${shellArg(project.id)} --plan --json`,
      `${baseCommand} project show ${shellArg(project.projectId)} --human`,
    ];
  if (command === "build") {
    const projectId =
      projectIdValue ||
      project?.projectId ||
      run?.projectId ||
      scalar(recordValue(result, "projectId"));
    if (projectId) {
      const plan = BuildPlanView.safeParse(result);
      if (plan.success) {
        if (plan.data.issues.some((issue) => issue.code === "EMPTY_PROJECT"))
          return [
            `${baseCommand} scene add --project ${shellArg(projectId)} --kind card --headline '从这里开始' --duration 3 --expected-revision ${shellArg(plan.data.revision)} --json`,
          ];
        if (plan.data.issues.length)
          return [
            `${baseCommand} project context ${shellArg(projectId)} --json`,
            `${baseCommand} doctor --human`,
          ];
        return [
          `${baseCommand} build --project ${shellArg(projectId)} --expected-revision ${shellArg(plan.data.revision)} --wait --progress --json`,
        ];
      }
      if (run && run.state !== "succeeded")
        return [
          `${baseCommand} run status ${shellArg(run.id)} --json`,
          ...(["failed", "cancelled", "interrupted"].includes(run.state)
            ? [
                `${baseCommand} run resume ${shellArg(run.id)} --wait --progress --json`,
              ]
            : []),
        ];
      return [
        `${baseCommand} artifacts --project ${shellArg(projectId)} --json`,
        `${baseCommand} export --project ${shellArg(projectId)} --format video --dest ${shellArg("/absolute/output.mp4")} --json`,
      ];
    }
  }

  return [];
}

export function terminalHint(next: readonly string[]): string | undefined {
  if (next.length) return `Next: ${next[0]}`;
  return "提示: 使用 --human 查看紧凑摘要；使用 --json 输出单行 JSON。";
}
