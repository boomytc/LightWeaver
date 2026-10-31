import { useEffect, useState } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import { ProviderDescriptor, z } from "@lightweaver/weaver/contracts";
import { api } from "../api";
import { desktop } from "../desktop";
import { useSession } from "../session/context";
import { UiSelect } from "../ui/UiSelect";
import { ModelSettings } from "./ModelSettings";

const RuntimeView = z.object({
  mode: z.string().optional(),
  dataDir: z.string(),
  configFile: z.string(),
  configBase: z.string(),
  modelDir: z.string(),
  logDir: z.string(),
  resourcesDir: z.string().optional(),
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
        <Tabs.List className="my-3 flex flex-wrap gap-1" aria-label="设置分区">
          {sections.map(([value, label]) => (
            <Tabs.Trigger key={value} value={value} className="data-[state=active]:border-accent">
              {label}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
        <Tabs.Content value="models">
          <ModelSettings
            fail={(reason) => session.setError(reason instanceof Error ? reason.message : String(reason))}
            onOpenRuntime={() => void session.navigate("settings", "", "runtime")}
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
  useEffect(() => {
    api("/runtime", RuntimeView).then(setRuntime).catch((reason) => session.setError(String(reason)));
  }, []);
  if (!runtime) return <p>加载运行时…</p>;
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
      {desktop()?.pickModelFile && desktop()?.setPreferences && desktop()?.restartRuntime && (
        <button
          type="button"
          onClick={() => {
            const bridge = desktop();
            void bridge?.pickModelFile?.().then(async (file) => {
              if (!file || !bridge?.setPreferences || !bridge.restartRuntime) return;
              await bridge.setPreferences({ configFile: file, configBase: parentDir(file) });
              await bridge.restartRuntime();
            });
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
    </section>
  );
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
            })
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
