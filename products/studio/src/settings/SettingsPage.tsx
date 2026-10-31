import { useEffect, useState } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import { ModelSettingsView, ModelSettingsPatch, ProviderDescriptor, z } from "@lightweaver/weaver/contracts";
import { api } from "../api";
import { desktop } from "../desktop";
import { useSession } from "../session/context";
import { UiSelect } from "../ui/UiSelect";
import { ModelSettings } from "./ModelSettings";

const RuntimeView = z.object({
  platform: z.string(),
  mode: z.string().optional(),
  dataDir: z.string(),
  configFile: z.string(),
  configBase: z.string(),
  modelDir: z.string(),
  logDir: z.string(),
  resourcesDir: z.string().optional(),
  interchangePython: z.string(),
  cli: z.object({ node: z.string(), entry: z.string() }).nullable(),
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
    <main className="min-h-0 flex-1 overflow-auto p-4">
      <h1 className="m-0 text-xl">设置</h1>
      <Tabs.Root value={section} onValueChange={(value) => void session.navigate("settings", "", value)}>
        <Tabs.List className="seg my-4" aria-label="设置分区">
          {sections.map(([value, label]) => (
            <Tabs.Trigger key={value} value={value}>
              {label}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
        <Tabs.Content value="models">
          <ModelSettings
            fail={(reason) => session.setError(reason instanceof Error ? reason.message : String(reason))}
            onOpenRuntime={() => void session.navigate("settings", "", "runtime")}
            onOpenJobs={() => void session.navigate("jobs")}
          />
        </Tabs.Content>
        <Tabs.Content value="runtime">
          <RuntimePanel />
        </Tabs.Content>
        <Tabs.Content value="appearance">
          <section>
            <h2>外观</h2>
            <UiSelect
              label="主题"
              value={session.client.theme}
              onValueChange={(value) => {
                if (value === "system" || value === "light" || value === "dark") session.client.setTheme(value);
              }}
              options={[
                { value: "system", label: "跟随系统" },
                { value: "light", label: "浅色" },
                { value: "dark", label: "深色" },
              ]}
            />
            <p className="hint">主题写在客户端状态里。有桌面桥时同时写入桌面偏好。</p>
          </section>
        </Tabs.Content>
        <Tabs.Content value="storage">
          <StoragePanel />
        </Tabs.Content>
        <Tabs.Content value="diagnostics">
          <DiagnosticsPanel />
        </Tabs.Content>
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
    return () => controller.abort();
  }, []);
  if (!runtime || !settings) return <p>加载运行时…</p>;
  const save = async () => {
    setSaving(true);
    try {
      const body = ModelSettingsPatch.parse({ expectedRevision: settings.revision, ...fields });
      const next = await api("/models/settings", ModelSettingsView, { method: "PUT", body });
      setSettings(next);
      setFields(runtimeFieldValues(next));
      window.dispatchEvent(new Event("lightweaver-capabilities-changed"));
      session.setNotice("运行时路径已保存，环境变量覆盖仍优先");
    } catch (reason) { session.setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setSaving(false); }
  };
  const rows = [
    ["数据目录", runtime.dataDir],
    ["配置文件", runtime.configFile],
    ["配置基准", runtime.configBase],
    ["模型目录", runtime.modelDir],
    ["日志目录", runtime.logDir],
  ];
  return (
    <section>
      <h2>运行时与路径</h2>
      <p>Python 模型环境是可选的，启动时不会自动安装。相对路径按配置基准目录解析。</p>
      <p>绑定已有配置时，原文件保留，相对路径仍按该文件所在目录解析，重启后生效。</p>
      <div className="grid gap-3 md:grid-cols-2">
        {runtimeFields.map(({ key, label, directory }) => (
          <label className="field" key={key}>
            <span>{label}</span>
            <input aria-label={label} value={fields[key] || ""} disabled={saving} onChange={(event) => setFields((current) => ({ ...current, [key]: event.target.value }))} />
            <small>当前来源：{settings.values[key]?.source || "unset"}</small>
            {desktop() && <button type="button" disabled={saving} onClick={() => void (async () => {
              try {
                const bridge = desktop();
                const picked = directory ? await bridge?.pickDirectory?.() : await bridge?.pickModelFile?.();
                if (picked) setFields((current) => ({ ...current, [key]: picked }));
              } catch (reason) { session.setError(String(reason)); }
            })()}>选择{directory ? "目录" : "文件"}</button>}
          </label>
        ))}
      </div>
      <label className="field">
        <span>对齐设备</span>
        <input value={fields.alignmentDevice || "cpu"} placeholder="cpu 或 cuda:0" disabled={saving} onChange={(event) => setFields((current) => ({ ...current, alignmentDevice: event.target.value }))} />
      </label>
      <button className="primary" type="button" disabled={saving} onClick={() => void save()}>{saving ? "保存中…" : "保存运行时路径"}</button>
      <details className="my-4">
        <summary>安装可选模型 Python 环境</summary>
        <p>在应用目录外创建独立环境，安装后把上方“模型 Python”指定为该环境的解释器。ASR 的 transcribe native library 和 bindings 仍需单独获取并选择。</p>
        <label className="field"><span>模型环境目标目录</span><input value={environment} onChange={(event) => setEnvironment(event.target.value)} /></label>
        <pre>{modelEnvironmentCommands(runtime, environment).join("\n")}</pre>
        <p>交接使用的 Python：{runtime.interchangePython || "由启动环境指定"}。它与可选模型环境分开。</p>
        {runtime.requirements.map((item) => <div key={item.name}><a download href={`/api/runtime/requirements/${encodeURIComponent(item.name)}`}>下载 {item.name}</a><small>{item.file}</small></div>)}
      </details>
      {desktop()?.pickModelFile && desktop()?.setPreferences && desktop()?.restartRuntime && (
        <button
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
        </button>
      )}
      <ul>
        {rows.map(([label, value]) => (
          <li key={label}>
            <b>{label}：</b>
            {value}
          </li>
        ))}
      </ul>
      <ul>
        {Object.entries(runtime.tools).map(([name, ready]) => (
          <li key={name}>
            {name}：{ready ? "已找到" : "未找到"}
          </li>
        ))}
      </ul>
      {runtime.cli && <details><summary>外部 agent 与命令行</summary><p>此入口使用包内 Node，默认读取同一桌面数据和配置。可用 --data-dir、--config-file 和 --config-base 显式覆盖。</p><pre>{`${runtime.platform === "win32" ? "& " : ""}'${runtime.cli.node.replaceAll("'", runtime.platform === "win32" ? "''" : "'\\''")}' '${runtime.cli.entry.replaceAll("'", runtime.platform === "win32" ? "''" : "'\\''")}' capabilities --json`}</pre></details>}
    </section>
  );
}

type RuntimeField = "modelPython" | "asrLibrary" | "asrBindings" | "visualServer" | "alignmentDevice";
const runtimeFields: { key: Exclude<RuntimeField, "alignmentDevice">; label: string; directory?: boolean }[] = [
  { key: "modelPython", label: "模型 Python" },
  { key: "asrLibrary", label: "ASR transcribe native library" },
  { key: "asrBindings", label: "ASR transcribe Python bindings", directory: true },
  { key: "visualServer", label: "EmbeddingGemma llama-server" },
];

function runtimeFieldValues(settings: z.infer<typeof ModelSettingsView>) {
  return {
    ...Object.fromEntries(runtimeFields.map(({ key }) => [key, settings.values[key]?.value || ""])),
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
    <section>
      <h2>存储位置</h2>
      <p>数据目录：{dataDir || "加载中"}</p>
      <p>更换目录会停止当前作业并重启服务。正在使用的数据库不会在运行中被替换。原来的目录保留。</p>
      {bridge?.pickDirectory && bridge.setPreferences && bridge.restartRuntime ? (
        <button
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
        </button>
      ) : (
        <p className="hint">浏览器里的数据目录由启动命令决定。</p>
      )}
    </section>
  );
}

function DiagnosticsPanel() {
  const session = useSession();
  const [doctor, setDoctor] = useState<z.infer<typeof DoctorView> | null>(null);
  useEffect(() => {
    api("/doctor", DoctorView).then(setDoctor).catch((reason) => session.setError(String(reason)));
  }, []);
  return (
    <section>
      <h2>诊断及应用信息</h2>
      <p>LightWeaver 桌面客户端</p>
      {!doctor && <p>正在读取诊断…</p>}
      {doctor && (
        <>
          <p>
            Node {doctor.node} · SQLite {doctor.sqlite}
          </p>
          <ul>
            {doctor.checks.map((check) => (
              <li key={check.tool}>
                {check.tool}：{check.ok ? check.version || "可用" : "不可用"}
              </li>
            ))}
          </ul>
          <details>
            <summary>诊断详情</summary>
            <pre>{JSON.stringify(doctor, null, 2)}</pre>
          </details>
        </>
      )}
      {session.error && <p className="error">{session.error}</p>}
    </section>
  );
}
