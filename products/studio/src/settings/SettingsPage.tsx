import { useEffect, useRef, useState } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import { ModelSettingsView, ModelSettingsPatch, ProviderDescriptor, z } from "@lightweaver/weaver/contracts";
import { api, ApiError } from "../api";
import { desktop } from "../desktop";
import { useSession } from "../session/context";
import { UiSelect } from "../ui/UiSelect";
import { PageHeader } from "../ui/PageHeader";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";
import { Badge } from "../ui/Badge";
import { InputWithActions } from "../ui/InputWithActions";
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
  interchangePython: z.string(),
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
});

const sections = [
  ["models", "模型与供应商"],
  ["runtime", "运行时与路径"],
  ["appearance", "外观"],
  ["storage", "存储位置"],
  ["diagnostics", "诊断及应用信息"],
] as const;

export function SettingsPage() {
  const session = useSession();
  const section = sections.some((item) => item[0] === session.route.section) ? session.route.section : "models";
  return (
    <main className="flex min-h-0 flex-1 flex-col">
      <PageHeader title="设置" description="管理模型与供应商、运行时与引擎安装、外观、存储和应用诊断。" />
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
                onOpenRuntime={() => void session.navigate("settings", "", "runtime")}
                onOpenJobs={() => void session.navigate("jobs")}
              />
            </Tabs.Content>
            <Tabs.Content value="runtime">
              <div className="flex flex-col gap-4">
                <EngineSettings />
                <RuntimePanel />
              </div>
            </Tabs.Content>
            <Tabs.Content value="appearance">
              <section className="panel-card flex flex-col gap-3 p-5">
                <div className="flex items-center gap-3">
                  <h2 className="m-0">外观</h2>
                  <UiSelect
                    label="主题"
                    value={session.client.theme}
                    onValueChange={(value) => {
                      if (value === "system" || value === "light" || value === "dark") session.client.setTheme(value);
                    }}
                    options={[{ value: "system", label: "跟随系统" }, { value: "light", label: "浅色" }, { value: "dark", label: "深色" }]}
                  />
                </div>
                <p className="hint m-0">主题写在客户端状态里。有桌面桥时同时写入桌面偏好。</p>
              </section>
            </Tabs.Content>
            <Tabs.Content value="storage"><StoragePanel /></Tabs.Content>
            <Tabs.Content value="diagnostics"><DiagnosticsPanel /></Tabs.Content>
          </div>
        </div>
      </Tabs.Root>
    </main>
  );
}

function RuntimePanel() {
  const session = useSession();
  const [runtime, setRuntime] = useState<z.infer<typeof RuntimeView> | null>(null);
  const [settings, setSettings] = useState<z.infer<typeof ModelSettingsView> | null>(null);
  const [fields, setFields] = useState<Partial<Record<RuntimeField, string>>>({});
  const [environment, setEnvironment] = useState("");
  const [saving, setSaving] = useState(false);
  const dirtyFields = useRef(new Set<RuntimeField>());
  const fieldsRef = useRef(fields);
  fieldsRef.current = fields;
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      api("/runtime", RuntimeView, { signal: controller.signal }),
      api("/models/settings", ModelSettingsView, { signal: controller.signal }),
    ]).then(([nextRuntime, nextSettings]) => {
      if (controller.signal.aborted) return;
      setRuntime(nextRuntime);
      setSettings(nextSettings);
      setEnvironment(`${nextRuntime.modelDir.replace(/[/\\]+$/, "")}/python-env`);
      setFields(runtimeFieldValues(nextSettings));
    }).catch((reason) => { if (!controller.signal.aborted) session.setError(String(reason)); });
    const onCapabilitiesChanged = () => {
      api("/models/settings", ModelSettingsView, { signal: controller.signal })
        .then((nextSettings) => {
          if (controller.signal.aborted) return;
          setSettings(nextSettings);
          setFields((current) => {
            const next = runtimeFieldValues(nextSettings);
            for (const key of dirtyFields.current) next[key] = current[key] ?? "";
            return next;
          });
        })
        .catch((reason) => { if (!controller.signal.aborted) session.setError(String(reason)); });
    };
    window.addEventListener("lightweaver-capabilities-changed", onCapabilitiesChanged);
    return () => {
      controller.abort();
      window.removeEventListener("lightweaver-capabilities-changed", onCapabilitiesChanged);
    };
  }, []);
  if (!runtime || !settings) return <p>加载运行时…</p>;
  const save = async () => {
    setSaving(true);
    try {
      const submittedFields = fields;
      const payload = ModelSettingsPatch.parse({ expectedRevision: settings.revision, ...submittedFields });
      const key = JSON.stringify(["model-settings", payload]);
      let attempt = session.stableRequest(key);
      const submit = () =>
        api("/models/settings", ModelSettingsView, {
          method: "PUT",
          body: { ...payload, requestId: attempt.requestId },
        });
      let next: z.infer<typeof ModelSettingsView>;
      let retriedTransport = false;
      let retriedReuse = false;
      while (true) {
        try {
          next = await submit();
          break;
        } catch (reason) {
          if (
            reason instanceof ApiError &&
            reason.protocol.code === "REQUEST_ID_REUSED" &&
            !retriedReuse
          ) {
            retriedReuse = true;
            attempt = session.rotateStableRequest(key, attempt);
            continue;
          }
          if (!(reason instanceof ApiError) && !retriedTransport) {
            retriedTransport = true;
            continue;
          }
          throw reason;
        }
      }
      session.completeStableRequest(key, attempt);
      setSettings(next);
      setFields((current) => current === submittedFields ? runtimeFieldValues(next) : current);
      if (fieldsRef.current === submittedFields) dirtyFields.current.clear();
      window.dispatchEvent(new Event("lightweaver-capabilities-changed"));
      session.setNotice("运行时路径已保存，本地配置文件优先于环境变量和内置默认值");
    } catch (reason) {
      session.handleError(reason);
    }
    finally { setSaving(false); }
  };
  const rows = [
    ["数据目录", runtime.dataDir],
    ["配置文件", runtime.configFile],
    ["配置基准", runtime.configBase],
    ["模型目录", runtime.modelDir],
    ["引擎目录", runtime.engineDir],
    ["日志目录", runtime.logDir],
  ];
  return (
    <section className="panel-card flex flex-col gap-4 p-5">
      <h2 className="m-0">运行时与路径</h2>
      <p>模型 Python、transcribe 运行库、bindings 与 llama-server 的路径由上方“本地运行环境”一键下载并写入，通常不需要手动填写。这里显示当前数据、配置、引擎与工具位置。</p>
      <p>需要沿用自己已有的运行库、GPU 构建或单独指定已有配置时，展开下面的高级设置。配置值按当前私有配置文件、环境变量、内置 config.yaml 默认值的顺序生效；相对路径按配置基准目录解析。</p>
      <details className="subtle-card p-4">
        <summary className="font-medium">高级：手动指定运行时路径</summary>
        <div className="mt-3 flex flex-col gap-4">
      <div className="grid gap-3 md:grid-cols-2">
        {runtimeFields.map(({ key, label, directory }) => (
          <InputWithActions
            key={key}
            label={label}
            aria-label={label}
            value={fields[key] || ""}
            disabled={saving}
            hint={`当前来源：${settings.values[key]?.source || "unset"}`}
            onChange={(event) => {
              dirtyFields.current.add(key);
              setFields((current) => ({ ...current, [key]: event.target.value }));
            }}
            actions={desktop() && <Button type="button" disabled={saving} onClick={() => void (async () => {
              try {
                const bridge = desktop();
                const picked = directory ? await bridge?.pickDirectory?.() : await bridge?.pickModelFile?.();
                if (picked) {
                  dirtyFields.current.add(key);
                  setFields((current) => ({ ...current, [key]: picked }));
                }
              } catch (reason) { session.setError(String(reason)); }
            })()}>选择{directory ? "目录" : "文件"}</Button>}
          />
        ))}
      </div>
      <label className="field">
        <span>对齐设备</span>
        <input value={fields.alignmentDevice || "cpu"} placeholder="cpu 或 cuda:0" disabled={saving} onChange={(event) => {
          dirtyFields.current.add("alignmentDevice");
          setFields((current) => ({ ...current, alignmentDevice: event.target.value }));
        }} />
      </label>
      <div className="actions">
        <Button variant="primary" type="button" disabled={saving} onClick={() => void save()}>{saving ? "保存中…" : "保存运行时路径"}</Button>
        {desktop()?.pickModelFile && desktop()?.setPreferences && desktop()?.restartRuntime && (
          <Button
            type="button"
            onClick={() => {
              const bridge = desktop();
              void bridge?.pickModelFile?.().then(async (file) => {
                if (!file || !bridge?.setPreferences || !bridge.restartRuntime) return;
                await bridge.setPreferences({ configFile: file, configBase: parentDir(file) });
                await bridge.restartRuntime();
              }).catch((reason) => session.setError(reason instanceof Error ? reason.message : String(reason)));
            }}
          >
            绑定已有配置并重启
          </Button>
        )}
      </div>
      <details className="subtle-card p-4">
        <summary className="font-medium">手工创建模型 Python 环境（备用）</summary>
        <div className="mt-3 flex flex-col gap-3">
          <p className="hint m-0">一键配置失败或需要自定义环境时使用：在应用目录外创建独立环境，安装后把上方“模型 Python”指定为该环境的解释器。ASR 的 transcribe 运行库、bindings 与 TEN VAD 由“本地运行环境”安装。</p>
          <label className="field"><span>模型环境目标目录</span><input value={environment} onChange={(event) => setEnvironment(event.target.value)} /></label>
          <pre className="code-block">{modelEnvironmentCommands(runtime, environment).join("\n")}</pre>
          <p className="hint m-0">交接使用的 Python：{runtime.interchangePython || "由启动环境指定"}。它与可选模型环境分开。</p>
          <div className="flex flex-col gap-2">
            {runtime.requirements.map((item) => (
              <div className="panel-card flex flex-wrap items-center justify-between gap-2 px-3 py-2" key={item.name}>
                <small className="numeric break-all">{item.file}</small>
                <a className="ui-button no-underline" data-variant="secondary" data-size="sm" download href={`/api/runtime/requirements/${encodeURIComponent(item.name)}`}>下载 {item.name}</a>
              </div>
            ))}
          </div>
        </div>
      </details>
        </div>
      </details>
      <dl className="key-value-list panel-card px-4">
        {rows.map(([label, value]) => (
          <div className="contents" key={label}><dt>{label}</dt><dd className="numeric">{value}</dd></div>
        ))}
      </dl>
      <div className="grid gap-2 sm:grid-cols-2">
        {Object.entries(runtime.tools).map(([name, ready]) => (
          <div className="subtle-card flex items-center justify-between gap-2 p-3" key={name}>
            <span>{name}</span><Badge tone={ready ? "ok" : "warn"} dot>{ready ? "已找到" : "未找到"}</Badge>
          </div>
        ))}
      </div>
      {runtime.cli && (
        <details className="subtle-card p-4">
          <summary className="font-medium">外部 agent 与命令行</summary>
          <p className="hint mt-2 mb-3">在 {runtime.cli.shell} 中运行。命令已指定当前数据目录和配置；进入项目后也可从“更多”复制给 agent。</p>
          <pre className="code-block">{`${runtime.cli.command} capabilities --json`}</pre>
        </details>
      )}
    </section>
  );
}

type RuntimeField = "modelPython" | "speechPython" | "asrLibrary" | "asrBindings" | "visualServer" | "alignmentDevice";
const runtimeFields: { key: Exclude<RuntimeField, "alignmentDevice">; label: string; directory?: boolean }[] = [
  { key: "modelPython", label: "模型 Python" },
  { key: "speechPython", label: "语音 Python" },
  { key: "asrLibrary", label: "ASR transcribe native library" },
  { key: "asrBindings", label: "ASR transcribe Python bindings", directory: true },
  { key: "visualServer", label: "EmbeddingGemma llama-server" },
];

type RuntimeFieldValues = Record<Exclude<RuntimeField, "alignmentDevice">, string> & {
  alignmentDevice: string;
};

function runtimeFieldValues(settings: z.infer<typeof ModelSettingsView>): RuntimeFieldValues {
  const fields = Object.fromEntries(
    runtimeFields.map(({ key }) => [key, settings.values[key]?.value || ""]),
  ) as Record<Exclude<RuntimeField, "alignmentDevice">, string>;
  return {
    ...fields,
    alignmentDevice: settings.values.alignmentDevice?.value || "cpu",
  };
}

function modelEnvironmentCommands(runtime: z.infer<typeof RuntimeView>, directory: string) {
  if (!directory.trim()) return ["先选择模型环境目标目录"];
  const windows = runtime.platform === "win32";
  const quote = (value: string) => windows ? `'${value.replaceAll("'", "''")}'` : `'${value.replaceAll("'", "'\\''")}'`;
  const prefix = windows ? "& " : "";
  const python = `${directory.replace(/[/\\]+$/, "")}/${windows ? "Scripts/python.exe" : "bin/python"}`;
  const requirements = runtime.requirements.find((item) => item.name === "requirements.models.txt");
  if (!requirements) return ["安装资源缺少 requirements.models.txt，请重新安装应用"];
  return [
    `${prefix}${quote(runtime.interchangePython || (windows ? "python" : "python3"))} -B -m venv ${quote(directory)}`,
    `${prefix}${quote(python)} -m pip install -r ${quote(requirements.file)}`,
    `模型 Python 路径：${python}`,
  ];
}

function parentDir(file: string) {
  const index = Math.max(file.lastIndexOf("/"), file.lastIndexOf("\\"));
  return index > 0 ? file.slice(0, index) : file;
}

function StoragePanel() {
  const session = useSession();
  const [dataDir, setDataDir] = useState("");
  useEffect(() => {
    api("/runtime", RuntimeView)
      .then((runtime) => setDataDir(runtime.dataDir))
      .catch((reason) => session.setError(String(reason)));
  }, []);
  const bridge = desktop();
  return (
    <section className="panel-card flex flex-col gap-4 p-5">
      <div>
        <h2 className="m-0">存储位置</h2>
        <p className="hint mb-0 mt-1">更换目录会停止当前作业并重启服务。正在使用的数据库不会在运行中被替换，原来的目录保留。</p>
      </div>
      <dl className="key-value-list subtle-card px-4">
        <dt>数据目录</dt>
        <dd className="numeric">{dataDir || "加载中"}</dd>
      </dl>
      {bridge?.pickDirectory && bridge.setPreferences && bridge.restartRuntime ? (
        <div className="actions">
          <Button
            type="button"
            onClick={() =>
              void bridge.pickDirectory?.().then(async (picked) => {
                if (!picked || !bridge.setPreferences || !bridge.restartRuntime) return;
                await bridge.setPreferences({ dataDir: picked });
                await bridge.restartRuntime();
              }).catch((reason) => session.setError(reason instanceof Error ? reason.message : String(reason)))
            }
          >
            选择数据目录并重启
          </Button>
        </div>
      ) : (
        <p className="hint m-0">浏览器里的数据目录由启动命令决定。</p>
      )}
    </section>
  );
}

function DiagnosticsPanel() {
  const session = useSession();
  const [doctor, setDoctor] = useState<z.infer<typeof DoctorView> | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  useEffect(() => {
    api("/doctor", DoctorView).then(setDoctor).catch((reason) => session.setError(String(reason)));
  }, []);
  return (
    <section className="panel-card flex flex-col gap-4 p-5">
      <div>
        <div className="flex items-center gap-3">
          <h2 className="m-0">诊断及应用信息</h2>
          <Button size="sm" type="button" disabled={!doctor} onClick={() => setDetailOpen(true)}>详情</Button>
        </div>
        <p className="hint mb-0 mt-1">LightWeaver 桌面客户端</p>
      </div>
      {!doctor && <p>正在读取诊断…</p>}
      {doctor && (
        <>
          <dl className="key-value-list"><dt>Node</dt><dd className="numeric">{doctor.node}</dd><dt>SQLite</dt><dd className="numeric">{doctor.sqlite}</dd></dl>
          <div className="grid items-start gap-2 sm:grid-cols-2">
            {doctor.checks.map((check) => {
              const status = toolStatus(check);
              return (
                <div className="subtle-card flex min-w-0 flex-col gap-2 p-3" key={check.tool}>
                  <div className="flex min-w-0 items-center justify-between gap-3">
                    <span className="font-medium">{check.tool}</span>
                    <Badge tone={check.ok ? "ok" : "warn"} dot>{status.badge}</Badge>
                  </div>
                  {status.detail && <p className="hint m-0 break-words text-xs leading-5">{status.detail}</p>}
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
    </section>
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
