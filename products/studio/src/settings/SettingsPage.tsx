import { useEffect, useState } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import { ProviderDescriptor, z } from "@lightweaver/weaver/contracts";
import { api } from "../api";
import { desktop } from "../desktop";
import { useSession } from "../session/context";
import { PageFrame } from "../ui/PageFrame";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";
import { Badge } from "../ui/Badge";
import { ModelSettings } from "./ModelSettings";
import { EngineSettings } from "./EngineSettings";

const RuntimeView = z.object({
  platform: z.string(),
  mode: z.string().optional(),
  dataDir: z.string(),
  configFile: z.string(),
  configBase: z.string(),
  modelDir: z.string(),
  engineDir: z.string(),
  logDir: z.string(),
  resourcesDir: z.string().optional(),
  cli: z.object({ node: z.string(), entry: z.string(), command: z.string(), shell: z.string() }).nullable(),
  requirements: z.array(z.object({ name: z.string(), file: z.string() })),
  tools: z.object({
    node: z.boolean(),
    ffmpeg: z.boolean(),
    ffprobe: z.boolean(),
    cardRenderer: z.boolean(),
    cardBrowser: z.boolean(),
    cardSite: z.boolean(),
    python: z.boolean(),
  }),
});

const DoctorView = z.object({
  node: z.string(),
  sqlite: z.string(),
  checks: z.array(z.object({ tool: z.string(), ok: z.boolean(), version: z.string() })),
  providers: z.array(ProviderDescriptor),
  modules: z.record(z.string(), z.boolean()).optional(),
  alignmentRuntime: z.object({ available: z.boolean(), missing: z.array(z.string()).optional() }).optional(),
  speechRuntime: z.object({ available: z.boolean(), missing: z.array(z.string()).optional() }).optional(),
  jianying: z.unknown().optional(),
  engines: z
    .object({
      ready: z.boolean().optional(),
      coreReady: z.boolean().optional(),
      root: z.object({ value: z.string(), source: z.string() }).optional(),
      counts: z
        .object({
          total: z.number(),
          installed: z.number(),
          managed: z.number(),
          external: z.number(),
          unused: z.number(),
          partial: z.number(),
        })
        .optional(),
    })
    .optional(),
});

const sections = [
  ["models", "模型与供应商"],
  ["storage", "存储"],
  ["diagnostics", "诊断与修复"],
  ["appearance", "外观"],
] as const;

const legacySections: Record<string, string> = {
  runtime: "diagnostics",
};

const themeLabel: Record<string, string> = {
  system: "跟随系统",
  light: "浅色",
  dark: "深色",
};

export function SettingsPage() {
  const session = useSession();
  const requested = legacySections[session.route.section] || session.route.section;
  const section = sections.some((item) => item[0] === requested) ? requested : "models";
  return (
    <PageFrame title="设置" description="选择模型与供应商，管理存储、应用维护和外观。" scroll={false}>
      <Tabs.Root className="split-page grid min-h-0 flex-1 grid-cols-[190px_minmax(0,1fr)]" value={section} onValueChange={(value) => void session.navigate("settings", "", value)}>
        <Tabs.List className="flex flex-col gap-1 border-r border-line p-3" aria-label="设置分区">
          {sections.map(([value, label]) => (
            <Tabs.Trigger key={value} value={value} className="nav-item data-[state=active]:bg-accent-soft data-[state=active]:text-[var(--lw-accent-text)]">
              {label}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
        <div className="scroll-region p-5">
          <div className="narrow-content">
            <Tabs.Content value="models">
              <ModelSettings
                fail={(reason) => session.setError(reason instanceof Error ? reason.message : String(reason))}
                onOpenJobs={() => void session.navigate("jobs")}
              />
            </Tabs.Content>
            <Tabs.Content value="storage"><StoragePanel /></Tabs.Content>
            <Tabs.Content value="diagnostics">
              <section className="panel-card flex flex-col divide-y divide-line" aria-label="诊断与修复">
                <EngineSettings />
                <DiagnosticsSection />
                <RuntimeSection />
              </section>
            </Tabs.Content>
            <Tabs.Content value="appearance">
              <section className="panel-card flex flex-col gap-4 p-5" aria-labelledby="appearance-title">
                <div>
                  <h2 id="appearance-title" className="m-0">外观</h2>
                  <p className="hint m-0 mt-1">
                    在左下角切换主题，即时生效。
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
                  <span className="text-xs font-medium text-muted">当前主题</span>
                  <Badge tone="accent" dot>{themeLabel[session.client.theme]}</Badge>
                </div>
              </section>
            </Tabs.Content>
          </div>
        </div>
      </Tabs.Root>
    </PageFrame>
  );
}

function StoragePanel() {
  const session = useSession();
  const [runtime, setRuntime] = useState<z.infer<typeof RuntimeView> | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    api("/runtime", RuntimeView, { signal: controller.signal }).then((value) => {
      if (!controller.signal.aborted) setRuntime(value);
    }).catch((reason) => { if (!controller.signal.aborted) session.handleError(reason); });
    return () => controller.abort();
  }, []);
  if (!runtime) return <p>加载存储位置…</p>;
  return <section className="panel-card flex flex-col gap-5 p-5" aria-labelledby="storage-title">
    <div>
      <h2 id="storage-title" className="m-0">存储</h2>
      <p className="hint m-0 mt-1">项目与模型保存在本机。更换工作区会重启服务，原目录中的内容会保留。</p>
    </div>
    <dl className="key-value-list">
      {[["项目数据", runtime.dataDir], ["模型默认位置", runtime.modelDir], ["日志", runtime.logDir]].map(([label, value]) =>
        <div className="contents" key={label}><dt>{label}</dt><dd className="numeric">{value}</dd></div>)}
    </dl>
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
      <small className="hint">模型的下载位置可在“模型与供应商”中选择。</small>
      {desktop()?.pickDirectory && desktop()?.setPreferences && desktop()?.restartRuntime ?
        <Button type="button" onClick={() => void (async () => {
          const bridge = desktop();
          const picked = await bridge?.pickDirectory?.();
          if (!picked || !bridge?.setPreferences || !bridge.restartRuntime) return;
          if (picked.replace(/[/\\]+$/, "") === runtime.dataDir.replace(/[/\\]+$/, "")) return;
          await bridge.setPreferences({ dataDir: picked });
          await bridge.restartRuntime();
        })().catch((reason) => session.handleError(reason))}>更换工作区并重启</Button>
        : <small className="hint">浏览器中的存储位置由启动命令决定。</small>}
    </div>
  </section>;
}

function RuntimeSection() {
  const session = useSession();
  const [runtime, setRuntime] = useState<z.infer<typeof RuntimeView> | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    api("/runtime", RuntimeView, { signal: controller.signal })
      .then((value) => { if (!controller.signal.aborted) setRuntime(value); })
      .catch((reason) => { if (!controller.signal.aborted) session.handleError(reason); });
    return () => controller.abort();
  }, []);
  if (!runtime) return <p>加载运行时…</p>;
  const rows = [
    ["数据目录", runtime.dataDir],
    ["模型配置", runtime.configFile],
    ["模型目录", runtime.modelDir],
    ["组件目录", runtime.engineDir],
    ["日志目录", runtime.logDir],
  ];
  return (
    <details className="p-5">
      <summary className="font-medium">运行信息与命令行</summary>
      <div className="mt-3 flex flex-col gap-4">
        <dl className="key-value-list">
          {rows.map(([label, value]) => (
            <div className="contents" key={label}><dt>{label}</dt><dd className="numeric">{value}</dd></div>
          ))}
        </dl>
        <div className="flex flex-wrap gap-3">
          {Object.entries(runtime.tools).map(([name, ready]) => (
            <span className="inline-flex items-center gap-1.5 text-xs" key={name}>
              <span className="text-muted">{name}</span>
              <Badge tone={ready ? "ok" : "warn"} dot>{ready ? "已找到" : "未找到"}</Badge>
            </span>
          ))}
        </div>
        {runtime.cli && (
          <pre className="code-block">{`${runtime.cli.command} capabilities --json`}</pre>
        )}
      </div>
    </details>
  );
}

function DiagnosticsSection() {
  const session = useSession();
  const [doctor, setDoctor] = useState<z.infer<typeof DoctorView> | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  useEffect(() => {
    api("/doctor", DoctorView).then(setDoctor).catch((reason) => session.setError(String(reason)));
  }, []);
  const counts = doctor?.engines?.counts;
  return (
    <details className="p-5">
      <summary className="font-medium">诊断及应用信息</summary>
      <div className="mt-3 flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="hint m-0">
            LightWeaver 桌面客户端；工具版本、Node/SQLite 与供应商诊断。
          </p>
          <Button size="sm" type="button" disabled={!doctor} onClick={() => setDetailOpen(true)}>详情</Button>
        </div>
        {counts && (
          <small>
            运行组件：应用提供 {counts.installed}/{counts.total} · 使用外部路径{" "}
            {counts.external} · 未配置 {counts.unused + counts.partial}
          </small>
        )}
        {!doctor && <p>正在读取诊断…</p>}
        {doctor && (
          <>
            <dl className="key-value-list"><dt>Node</dt><dd className="numeric">{doctor.node}</dd><dt>SQLite</dt><dd className="numeric">{doctor.sqlite}</dd></dl>
            <div className="flex flex-col">
              {doctor.checks.map((check) => {
                const status = toolStatus(check);
                return (
                  <div className="flex min-w-0 items-center justify-between gap-3 border-b border-line py-2 last:border-0" key={check.tool}>
                    <span className="min-w-0 font-medium">{check.tool}</span>
                    <span className="flex min-w-0 items-center gap-3">
                      {status.detail && <small className="truncate" title={status.detail}>{status.detail}</small>}
                      <Badge tone={check.ok ? "ok" : "warn"} dot>{status.badge}</Badge>
                    </span>
                  </div>
                );
              })}
            </div>
          </>
        )}
        <Modal open={detailOpen && doctor !== null} title="诊断详情" onOpenChange={setDetailOpen}>
          <pre className="code-block max-h-[min(32rem,calc(100vh-8rem))]">{doctor ? JSON.stringify(doctor, null, 2) : ""}</pre>
        </Modal>
        {session.error && <p className="error">{session.error}</p>}
      </div>
    </details>
  );
}

function toolStatus(check: { ok: boolean; version: string }) {
  if (!check.ok) return { badge: "不可用", detail: "" };
  const version = check.version.trim();
  if (!version) return { badge: "可用", detail: "" };
  const numbered = version.match(/\bversion\s+n?(\d+(?:\.\d+){1,3})\b/i);
  if (numbered) return { badge: numbered[1], detail: version };
  if (version.length <= 24) return { badge: version, detail: "" };
  return { badge: "可用", detail: version };
}
