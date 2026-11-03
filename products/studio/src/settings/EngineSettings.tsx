import { useCallback, useEffect, useRef, useState } from "react";
import {
  EngineSetupResult,
  EngineVerifyResult,
  EngineView,
  RunRecord,
  z,
} from "@lightweaver/weaver/contracts";
import type {
  EngineCatalogItem,
  EngineItemStatus,
} from "@lightweaver/weaver/contracts";
import { api, ApiError, requestId } from "../api";
import { openLink } from "../desktop";
import { isActiveRun, type RunDetail } from "../domain/run";
import { notifyRunsChanged } from "../jobs/useRunList";
import { useRunStream } from "../jobs/useRunStream";
import { useSession } from "../session/context";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { ProgressBar } from "../ui/ProgressBar";

type EngineViewValue = z.infer<typeof EngineView>;
type EngineItemStatusValue = z.infer<typeof EngineItemStatus>;
type EngineItem = z.infer<typeof EngineCatalogItem>;
type EngineVerifyValue = z.infer<typeof EngineVerifyResult>;
type EngineRun = z.infer<typeof RunRecord>;
type EngineAction = "install" | "update" | "repair" | "none";

function nextEngineAction({ item, current, verification }: {
  item: EngineItem;
  current: EngineItemStatusValue;
  verification: EngineVerifyValue | null;
}): EngineAction {
  if (!item.available) return "none";
  const { status, usage } = current;
  if (status.version && status.version !== item.version) return "update";
  if (status.state === "missing") return usage === "external" || usage === "bundled" ? "none" : "install";
  if (status.state === "unchecked") return "none";
  if (status.state === "invalid" || verification && verification.state !== "verified") return status.version ? "repair" : "none";
  return "none";
}

const EngineProgress = z.object({
  engineId: z.string(),
  phase: z.string(),
  received: z.number().optional(),
  total: z.number().optional(),
  message: z.string().optional(),
});
type EngineProgressValue = z.infer<typeof EngineProgress>;

const engineStateLabel: Record<string, string> = {
  missing: "未安装",
  installed: "已安装",
  unchecked: "已放置待校验",
  invalid: "不完整或版本不符",
};
const engineStateTone: Record<string, "neutral" | "ok" | "warn" | "danger"> = {
  missing: "neutral",
  installed: "ok",
  unchecked: "warn",
  invalid: "danger",
};
type EngineUsage = EngineItemStatusValue["usage"];
const usageBadge: Record<
  Exclude<EngineUsage, "unused">,
  { label: string; tone: "ok" | "warn" | "accent" | "neutral" }
> = {
  bundled: { label: "应用自带", tone: "ok" },
  managed: { label: "已安装 · 已采用", tone: "ok" },
  "managed-unused": { label: "已安装 · 未采用", tone: "warn" },
  external: { label: "使用外部路径", tone: "accent" },
  partial: { label: "部分绑定可用", tone: "warn" },
};
const runStateLabel: Record<string, string> = {
  queued: "排队中",
  running: "进行中",
  cancelling: "取消中",
  succeeded: "已完成",
  failed: "失败",
  cancelled: "已取消",
  interrupted: "已中断",
  partial: "部分完成",
};
const phaseLabel: Record<string, string> = {
  download: "下载",
  extract: "解压",
  verify: "校验",
  publish: "发布",
  venv: "创建环境",
  pip: "安装依赖",
};
const pathStateLabel: Record<string, string> = {
  unset: "未配置",
  missing: "路径不存在",
  "wrong-type": "路径类型不匹配",
  unavailable: "无法访问",
  present: "路径已找到",
};
const fileStateLabel: Record<string, string> = {
  missing: "缺失",
  invalid: "不匹配",
  verified: "校验通过",
};
const verifyStateLabel: Record<string, string> = {
  missing: "未找到安装目录",
  invalid: "校验未通过",
  verified: "校验通过",
};
const sourceLabel: Record<string, string> = {
  default: "内置默认",
  environment: "环境变量",
  file: "本地配置文件",
  unset: "未设置",
};
const settingLabel: Record<string, string> = {
  asr_library: "ASR transcribe native library",
  asr_bindings: "ASR transcribe Python bindings",
  vad_library: "TEN VAD 运行库",
  visual_server: "EmbeddingGemma llama-server",
  llama_server: "llama-server",
  translation_server: "字幕翻译 llama-server",
  python: "Python 运行环境",
};

const setupLabels: Record<string, string> = {
  "transcribe-native": "transcribe 运行库",
  "transcribe-bindings": "Python bindings",
  "ten-vad": "TEN VAD",
  "llama-server": "llama-server",
  "python-runtime": "Python 运行环境",
};

function setupItems(view: EngineViewValue): EngineItem[] {
  return view.setupComponents.flatMap(
    (id) => view.catalog.items.find((item) => item.id === id) ?? [],
  );
}

const GIB = 1024 ** 3;
/** 与后端一致的下载余量。 */
const SPACE_MARGIN_BYTES = 256 * 1024 * 1024;

function formatBytes(bytes: number) {
  if (bytes >= GIB) return `${(bytes / GIB).toFixed(1)} GB`;
  if (bytes >= 1024 * 1024) return `${Math.round(bytes / (1024 * 1024))} MB`;
  return `${bytes} B`;
}

function skippedLabel(id: string, view: EngineViewValue) {
  if (id.startsWith("model:")) {
    const modelId = id.slice("model:".length);
    return view.models.find((model) => model.id === modelId)?.name || modelId;
  }
  return setupLabels[id] || id;
}

function setupNodeLabel(key: string, view: EngineViewValue) {
  if (key.startsWith("install-")) {
    const id = key.slice("install-".length);
    return setupLabels[id] || id;
  }
  if (key.startsWith("model-")) {
    const id = key.slice("model-".length);
    return view.models.find((model) => model.id === id)?.name || id;
  }
  return key;
}

function sourceName(source: string) {
  return sourceLabel[source] || source;
}

function progressPercent(progress: EngineProgressValue | null) {
  if (progress?.received === undefined || !progress.total) return null;
  return Math.max(
    0,
    Math.min(100, Math.floor((progress.received / progress.total) * 100)),
  );
}

export function EngineSettings() {
  const session = useSession();
  const [view, setView] = useState<EngineViewValue | null>(null);
  const sequence = useRef(0);
  const sessionRef = useRef(session);
  sessionRef.current = session;

  const refresh = useCallback(async (signal?: AbortSignal) => {
    const request = ++sequence.current;
    try {
      const next = await api("/engines", EngineView, { signal });
      if (!signal?.aborted && request === sequence.current) setView(next);
    } catch (reason) {
      if (!signal?.aborted) sessionRef.current.handleError(reason);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    const onCapabilitiesChanged = () => void refresh();
    window.addEventListener("lightweaver-capabilities-changed", onCapabilitiesChanged);
    return () => {
      controller.abort();
      window.removeEventListener("lightweaver-capabilities-changed", onCapabilitiesChanged);
    };
  }, [refresh]);

  if (!view)
    return (
      <section className="flex flex-col gap-3 p-5" aria-label="本地运行环境">
        <h2 className="m-0">运行组件检查与修复</h2>
        <p>加载本地运行环境…</p>
      </section>
    );

  const statuses = new Map(view.items.map((item) => [item.id, item]));
  const setupStatuses = view.setupComponents.flatMap((id) => {
    const current = statuses.get(id);
    return current ? [current] : [];
  });
  const usageCounts = setupStatuses.reduce(
    (counts, current) => {
      counts[current.usage] += 1;
      return counts;
    },
    { bundled: 0, managed: 0, "managed-unused": 0, external: 0, unused: 0, partial: 0 } as Record<
      EngineUsage,
      number
    >,
  );
  return (
    <section className="flex flex-col gap-4 p-5" aria-label="本地运行环境">
      <SetupPanel view={view} statuses={statuses} onRefresh={refresh} />
      <details className="border-t border-line pt-4">
        <summary className="font-medium">组件清单与高级手动操作</summary>
        <div className="mt-3 flex flex-col gap-3">
          <small className="numeric">组件目录：{view.installRoot.value}</small>
          <small>
            本应用提供 {usageCounts.bundled + usageCounts.managed + usageCounts["managed-unused"]}/
            {setupStatuses.length} · 使用外部路径 {usageCounts.external} · 未配置{" "}
            {usageCounts.unused + usageCounts.partial}
          </small>
          <p className="hint m-0">
            通常不需要展开：已安装组件自动使用，仅在需要更新、修复或校验时操作。
          </p>
          <div className="model-inventory-grid">
            {view.catalog.items.map((item) => {
              const status = statuses.get(item.id);
              return status ? (
                <EngineCard
                  key={item.id}
                  item={item}
                  itemStatus={status}
                  installRoot={view.installRoot.value}
                  onRefresh={refresh}
                />
              ) : null;
            })}
          </div>
        </div>
      </details>
    </section>
  );
}

type RunDetailValue = z.infer<typeof RunDetail>;

function SetupPanel({
  view,
  statuses,
  onRefresh,
}: {
  view: EngineViewValue;
  statuses: Map<string, EngineItemStatusValue>;
  onRefresh: () => Promise<void>;
}) {
  const session = useSession();
  const setup = useSetupRun(() => view.settings.revision, onRefresh);
  const items = setupItems(view);
  const rows = items.map((item) => {
    const current = statuses.get(item.id);
    return {
      item,
      status: current,
      ready: current?.usage === "bundled" || current?.usage === "managed" || current?.usage === "external",
    };
  });
  const ready = rows.length > 0 && rows.every((row) => row.ready);
  const needsSetup = !ready || view.updates.length > 0;
  const busy = setup.active || setup.starting;
  const failed =
    setup.run !== null &&
    !setup.active &&
    setup.run.state !== "succeeded";
  const catalog = new Map(view.catalog.items.map((item) => [item.id, item]));
  const missingEngineBytes = items.reduce((total, item) => {
    const installed = statuses.get(item.id)?.status.state === "installed";
    return installed ? total : total + item.estimatedBytes;
  }, 0);
  const requiredBytes = missingEngineBytes + SPACE_MARGIN_BYTES;
  const diskFree = view.diskFreeBytes;
  const insufficient = diskFree !== null && requiredBytes > diskFree;
  const updateNames = view.updates.map(
    (id) => catalog.get(id)?.name || setupLabels[id] || id,
  );
  const adoptNode = setup.detail?.nodes.find((node) => node.key === "adopt");
  const setupResult = adoptNode
    ? EngineSetupResult.safeParse(adoptNode.result)
    : null;
  const skipped = setupResult?.success ? setupResult.data.skipped : [];
  const partial = setup.run?.state === "succeeded" && skipped.length > 0;
  const label = busy
    ? "配置中…"
    : !needsSetup
      ? "刷新状态"
      : partial
        ? "继续修复"
        : view.updates.length > 0
          ? "更新并配置"
          : failed ? "重试配置" : "检查并修复";
  const readyCount = rows.filter((row) => row.ready).length;
  const externalCount = rows.filter((row) => row.status?.usage === "external").length;
  const missingCount = rows.filter(
    (row) => row.status?.usage === "unused" || row.status?.usage === "partial",
  ).length;
  const runNodes = setup.detail?.nodes.filter((node) => node.key !== "adopt") ?? [];
  const runSucceeded = runNodes.filter((node) => node.state === "succeeded").length;
  const progress = runNodes.length > 0 ? Math.round((runSucceeded / runNodes.length) * 100) : undefined;

  return (
    <section className="flex flex-col gap-4" aria-labelledby="setup-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2 id="setup-title" className="m-0">运行组件检查与修复</h2>
          <p className="hint m-0 mt-1">
            正式安装包自带基础组件，模型所需依赖会自动准备；出现组件缺失或损坏时，在这里检查并修复。
          </p>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {setup.active ? (
            <Button type="button" onClick={() => void setup.cancel()}>取消配置</Button>
          ) : (
            <Button
              variant={needsSetup ? "primary" : "secondary"}
              type="button"
              disabled={setup.starting || needsSetup && insufficient}
              aria-label={label}
              onClick={() => { if (needsSetup) void setup.start({ includeModels: false }); else void onRefresh(); }}
            >
              {label}
            </Button>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Badge tone={ready ? "ok" : "warn"} dot>已就绪 {readyCount}/{rows.length}</Badge>
        {externalCount > 0 && <small>外部路径 {externalCount}</small>}
        {missingCount > 0 && <small>未配置 {missingCount}</small>}
        {view.updates.length > 0 && <small>可更新 {view.updates.length}</small>}
      </div>
      {needsSetup && <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {diskFree !== null && <small>引擎目录可用 {formatBytes(diskFree)}</small>}
        {requiredBytes > SPACE_MARGIN_BYTES ? (
          <small>本次预计需要 {formatBytes(requiredBytes)}（含 256 MB 余量）</small>
        ) : (
          <small>无需额外下载空间（仍预留 256 MB 余量）。</small>
        )}
      </div>}
      {needsSetup && insufficient && diskFree !== null && (
        <small className="error" role="alert">
          磁盘空间不足：预计需要 {formatBytes(requiredBytes)}，引擎目录可用{" "}
          {formatBytes(diskFree)}。清理空间或更换组件目录后重试。
        </small>
      )}
      {updateNames.length > 0 && (
        <small>
          可更新组件：{updateNames.join("、")}；更新会重新下载并采用这些组件。
        </small>
      )}
      {setup.run && (
        <div className="flex flex-col gap-2 border-t border-line pt-4" aria-live="polite">
          <small>配置作业 · {runStateLabel[setup.run.state]}</small>
          {setup.active && (
            <ProgressBar
              value={progress}
              label="配置进度"
              stage={
                setup.message ||
                (runNodes.length > 0
                  ? `${runSucceeded}/${runNodes.length} 个步骤完成`
                  : "等待步骤开始")
              }
            />
          )}
          {setup.message && !setup.active && <small>{setup.message}</small>}
          {setup.run.error && (
            <small className="error" role="alert">
              {setup.run.error.message}
            </small>
          )}
          {setup.run.state === "succeeded" && !partial && (
            <small>配置完成，绑定已刷新。</small>
          )}
          {partial && (
            <>
              <small className="error">配置完成，部分组件未完成，可重试：</small>
              {skipped.map((skip) => (
                <small className="error" key={skip.id}>
                  {skippedLabel(skip.id, view)}：{skip.message}
                </small>
              ))}
            </>
          )}
          {setup.run.state === "cancelled" && (
            <small>作业已取消，已安装的组件保留；可再次点击配置继续。</small>
          )}
          {runNodes.length > 0 && (
            <details>
              <summary className="text-xs">查看作业步骤</summary>
              <div className="model-files mt-2">
                {runNodes.map((node) => (
                  <small key={node.key}>
                    {setupNodeLabel(node.key, view)}：
                    {skippedNodeLabel(node) ||
                      setupNodeStateLabel[node.state] ||
                      node.state}
                  </small>
                ))}
                {adoptNode && (
                  <small>就绪检查：{setupNodeStateLabel[adoptNode.state] || adoptNode.state}</small>
                )}
              </div>
            </details>
          )}
        </div>
      )}
      {ready && !setup.run && (
        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
          <small>运行组件已就绪。</small>
          <Button
            size="sm"
            type="button"
            onClick={() => void session.navigate("settings", "", "models")}
          >
            选择模型
          </Button>
        </div>
      )}
    </section>
  );
}

/** 可选组件的安装节点成功但实际跳过时，不要显示“已完成”。 */
function skippedNodeLabel(node: { result: unknown }): string {
  const result = node.result;
  return result &&
    typeof result === "object" &&
    "skipped" in result &&
    (result as { skipped?: unknown }).skipped === true
    ? "已跳过（可重试）"
    : "";
}

const setupNodeStateLabel: Record<string, string> = {
  queued: "等待",
  running: "进行中",
  succeeded: "已完成",
  failed: "失败",
  cancelled: "已取消",
  interrupted: "已中断",
};

function useSetupRun(
  revision: () => string,
  onFinished: () => Promise<void>,
) {
  const session = useSession();
  const [run, setRun] = useState<EngineRun | null>(null);
  const [detail, setDetail] = useState<RunDetailValue | null>(null);
  const [message, setMessage] = useState("");
  const [starting, setStarting] = useState(false);
  const settled = useRef("");
  const finished = useRef(onFinished);
  finished.current = onFinished;
  const revisionRef = useRef(revision);
  revisionRef.current = revision;

  const settle = (next: EngineRun, value?: RunDetailValue) => {
    setRun(next);
    if (isActiveRun(next.state) || settled.current === next.id) return;
    settled.current = next.id;
    notifyRunsChanged();
    if (next.state === "succeeded") {
      const adopt = value?.nodes.find((node) => node.key === "adopt");
      const result = adopt ? EngineSetupResult.safeParse(adopt.result) : null;
      const skipped = result?.success ? result.data.skipped.length : 0;
      session.setNotice(
        skipped > 0
          ? "本地运行环境已配置，部分组件未完成，可重试"
          : "本地运行环境已配置完成",
      );
      window.dispatchEvent(new Event("lightweaver-capabilities-changed"));
    }
    void finished.current();
  };

  useRunStream({
    runId: run?.id || "",
    enabled: run !== null && isActiveRun(run.state),
    onDetail: (value) => {
      setDetail(value);
      settle(value.run, value);
    },
    onEvent: (event) => {
      if (
        event.type !== "engine-install-progress" &&
        event.type !== "engine-setup-progress"
      )
        return;
      const data = z
        .object({
          engineId: z.string().optional(),
          phase: z.string().optional(),
          message: z.string().optional(),
        })
        .safeParse(event.data);
      if (!data.success) return;
      const who = data.data.engineId
        ? setupLabels[data.data.engineId] || data.data.engineId
        : "";
      const what =
        data.data.message ||
        (data.data.phase ? phaseLabel[data.data.phase] || data.data.phase : "");
      const next = [who, what].filter(Boolean).join(" · ");
      if (next) setMessage(next);
    },
    onError: (reason) => session.handleError(reason),
  });

  return {
    run,
    detail,
    message,
    starting,
    active: run !== null && isActiveRun(run.state),
    start: async (options: {
      includeModels: boolean;
    }) => {
      setStarting(true);
      try {
        const key = JSON.stringify([
          "engine-setup",
          revisionRef.current(),
          options.includeModels,
        ]);
        let attempt = session.stableRequest(key);
        let next: EngineRun;
        let retriedTransport = false;
        let retriedReuse = false;
        while (true) {
          try {
            next = await api("/engines/setup", RunRecord, {
              method: "POST",
              body: {
                expectedRevision: revisionRef.current(),
                requestId: attempt.requestId,
                includeModels: options.includeModels,
              },
            });
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
            if (reason instanceof ApiError) {
              if (
                reason.protocol.code === "CONFIG_CONFLICT" ||
                reason.protocol.code === "REVISION_CONFLICT"
              )
                await finished.current();
            }
            throw reason;
          }
        }
        session.completeStableRequest(key, attempt);
        setMessage("");
        setDetail(null);
        settled.current = "";
        settle(next);
      } catch (reason) {
        session.handleError(reason);
      } finally {
        setStarting(false);
      }
    },
    cancel: async () => {
      if (!run) return;
      try {
        settle(
          await api(`/runs/${encodeURIComponent(run.id)}/cancel`, RunRecord, {
            method: "POST",
          }),
        );
      } catch (reason) {
        session.handleError(reason);
      }
    },
  };
}

function EngineCard({
  item,
  itemStatus,
  installRoot,
  onRefresh,
}: {
  item: EngineItem;
  itemStatus: EngineItemStatusValue;
  installRoot: string;
  onRefresh: () => Promise<void>;
}) {
  const session = useSession();
  const [busy, setBusy] = useState("");
  const [verifyResult, setVerifyResult] = useState<EngineVerifyValue | null>(null);
  const install = useEngineInstall(item.id, item.name, onRefresh);
  const status = itemStatus.status;
  const documentationUrl = item.documentationUrl;
  const pythonEnvironment = item.kind === "python-env";
  const usage = itemStatus.usage;
  const usageInfo = usage === "unused" ? null : usageBadge[usage];
  const installing = install.active || install.starting;
  const blocked = !item.available || !!busy;
  const verification = verifyResult?.root === status.root && verifyResult.directory === status.directory &&
    verifyResult.version === status.version ? verifyResult : null;
  const state = verification && verification.state !== "verified" ? verification.state : status.state;
  const action = nextEngineAction({ item, current: itemStatus, verification });
  const actionLabels: Record<Exclude<EngineAction, "none">, string> = {
    install: pythonEnvironment ? "创建环境" : "安装",
    update: pythonEnvironment ? "更新环境" : "更新",
    repair: pythonEnvironment ? "修复环境" : "修复",
  };
  const actionLabel = installing ? pythonEnvironment ? "创建中…" : "安装中…"
    : action === "none" ? "" : actionLabels[action];
  const showStateBadge = state === "missing" && (usage === "external" || usage === "bundled") ? false
    : state !== "installed" || !usageInfo || usage === "external" || usage === "partial";

  const act = async (label: string, run: () => Promise<void>) => {
    setBusy(label);
    try {
      await run();
    } catch (reason) {
      session.handleError(reason);
    } finally {
      setBusy("");
    }
  };

  const verify = () =>
    act("verify", async () => {
      const result = await api(
        `/engines/${encodeURIComponent(item.id)}/verify`,
        EngineVerifyResult,
        { method: "POST", body: { root: installRoot } },
      );
      setVerifyResult(result);
      if (result.state === "verified") session.setNotice(`${item.name} 校验通过`);
      await onRefresh();
    });


  return (
    <article className="panel-card model-inventory-card">
      <div className="model-inventory-head">
        <b title={item.name}>{item.name}</b>
        {showStateBadge && <Badge tone={engineStateTone[state]} dot>
          {engineStateLabel[state]}
        </Badge>}
        {usageInfo && (state === "installed" || usage === "external" || usage === "partial") && (
          <Badge tone={usageInfo.tone} dot>
            {usageInfo.label}
          </Badge>
        )}
        {pythonEnvironment && <Badge tone="accent">Python 环境</Badge>}
        {!item.available && <Badge tone="warn">当前平台不可用</Badge>}
      </div>
      <p className="hint mt-1 mb-0">{item.summary}</p>
      <small>
        清单版本 {item.version} · 平台 {item.platform}
        {status.version ? ` · 已安装 ${status.version}` : ""}
      </small>
      <small className="numeric break-all">
        {pythonEnvironment ? "环境目录" : "管理安装目录"}：{status.directory}
      </small>
      {status.reason && <small>状态说明：{status.reason}</small>}
      {usage === "external" && (
        <small>当前使用外部路径{status.state === "installed" ? "，可按需改用本应用的组件" : ""}。</small>
      )}
      {usage === "partial" && (
        <small>当前绑定部分可用，检查下面各设置的路径与来源。</small>
      )}
      {!item.available && (
        <small>不可用原因：{item.unavailableReason || "当前平台没有已核验的引擎产物"}</small>
      )}
      {itemStatus.active.length > 0 && (
        <div className="model-files">
          {itemStatus.active.map((binding) => (
            <small className="numeric" key={binding.setting}>
              {settingLabel[binding.setting] || binding.setting}：
              {binding.value.value || "未配置"} · {pathStateLabel[binding.state]} · 来源{" "}
              {sourceName(binding.value.source)}
            </small>
          ))}
        </div>
      )}
      <details className="model-inventory-details">
        <summary>发布文件与目录状态</summary>
        <div className="model-inventory-meta">
          <small>发布版本：{item.version} · 已安装版本：{status.version || "未知"}</small>
          {item.files.map((file) => {
            const actual = status.files.find((entry) => entry.path === file.path);
            return (
              <small className="numeric" key={file.path}>
                {file.path} · 清单 {file.size.toLocaleString()} B ·{" "}
                {actual?.actualSize === undefined
                  ? "文件缺失"
                  : `实际 ${actual.actualSize.toLocaleString()} B`}
              </small>
            );
          })}
        </div>
      </details>
      {verification && <VerifySummary result={verification} />}
      {install.run && (
        <InstallSummary
          run={install.run}
          progress={install.progress}
          onCancel={() => void install.cancel()}
        />
      )}
      <div className="actions">
        {(action !== "none" || installing) && <Button
          variant="primary"
          disabled={blocked || installing}
          aria-label={`${actionLabel} ${item.name}`}
          onClick={() => {
            if (action === "none") return;
            setVerifyResult(null);
            void install.start(installRoot);
          }}
        >
          {actionLabel}
        </Button>}
        {status.state !== "missing" && <Button
          disabled={blocked || installing}
          aria-label={`校验 ${item.name}`}
          onClick={() => void verify()}
        >
          {busy === "verify" ? "校验中…" : "校验"}
        </Button>}
        {documentationUrl && (
          <Button
            size="sm"
            variant="ghost"
            aria-label={`查看 ${item.name} 文档`}
            onClick={() =>
              void openLink(documentationUrl).catch((reason) =>
                session.handleError(reason),
              )
            }
          >
            文档
          </Button>
        )}
      </div>
    </article>
  );
}

function useEngineInstall(
  engineId: string,
  name: string,
  onFinished: () => Promise<void>,
) {
  const session = useSession();
  const [run, setRun] = useState<EngineRun | null>(null);
  const [progress, setProgress] = useState<EngineProgressValue | null>(null);
  const [starting, setStarting] = useState(false);
  const settled = useRef("");
  const finished = useRef(onFinished);
  finished.current = onFinished;

  const settle = (next: EngineRun) => {
    setRun(next);
    if (isActiveRun(next.state) || settled.current === next.id) return;
    settled.current = next.id;
    notifyRunsChanged();
    if (next.state === "succeeded") session.setNotice(`${name}已就绪`);
    void finished.current();
  };

  useRunStream({
    runId: run?.id || "",
    enabled: run !== null && isActiveRun(run.state),
    onDetail: (detail) => settle(detail.run),
    onEvent: (event) => {
      if (event.type !== "engine-install-progress") return;
      const parsed = EngineProgress.safeParse(event.data);
      if (parsed.success && parsed.data.engineId === engineId)
        setProgress(parsed.data);
    },
    onError: (reason) => session.handleError(reason),
  });

  return {
    run,
    progress,
    starting,
    active: run !== null && isActiveRun(run.state),
    start: async (root: string) => {
      setStarting(true);
      try {
        const next = await api(
          `/engines/${encodeURIComponent(engineId)}/install`,
          RunRecord,
          { method: "POST", body: { root, requestId: requestId() } },
        );
        setProgress(null);
        settle(next);
      } catch (reason) {
        session.handleError(reason);
      } finally {
        setStarting(false);
      }
    },
    cancel: async () => {
      if (!run) return;
      try {
        settle(
          await api(`/runs/${encodeURIComponent(run.id)}/cancel`, RunRecord, {
            method: "POST",
          }),
        );
      } catch (reason) {
        session.handleError(reason);
      }
    },
  };
}

function InstallSummary({
  run,
  progress,
  onCancel,
}: {
  run: EngineRun;
  progress: EngineProgressValue | null;
  onCancel: () => void;
}) {
  const active = isActiveRun(run.state);
  const percent = progressPercent(progress);
  return (
    <div className="model-files" aria-live="polite">
      <div className="section-title">
        <b>引擎作业 · {runStateLabel[run.state]}</b>
        {active && (
          <Button size="sm" type="button" onClick={onCancel}>
            取消
          </Button>
        )}
      </div>
      <small className="numeric">
        {run.id} · {new Date(run.updatedAt).toLocaleString()}
      </small>
      {active && progress && (
        <small>
          {phaseLabel[progress.phase] || progress.phase}
          {progress.message ? ` · ${progress.message}` : ""}
          {percent !== null ? ` · ${percent}%` : ""}
        </small>
      )}
      {active && percent !== null && (
        <div className="run-progress" aria-label={`安装进度 ${percent}%`}>
          <span style={{ width: `${percent}%` }} />
        </div>
      )}
      {run.error && (
        <small className="error" role="alert">
          {run.error.message}
        </small>
      )}
      {!active && run.state === "succeeded" && (
        <small>安装完成，目录状态已刷新。</small>
      )}
      {!active && run.state === "cancelled" && <small>作业已取消，可重新点击安装或校验。</small>}
    </div>
  );
}

function VerifySummary({ result }: { result: EngineVerifyValue }) {
  const tone =
    result.state === "verified" ? "ok" : result.state === "missing" ? "neutral" : "danger";
  return (
    <div className="model-files">
      <div className="section-title">
        <b>校验结果</b>
        <Badge tone={tone}>{verifyStateLabel[result.state]}</Badge>
      </div>
      <small>
        {new Date(result.verifiedAt).toLocaleString()} · 版本{" "}
        {result.version || "未知"}
      </small>
      {result.detail && <small>{result.detail}</small>}
      {result.reason && (
        <small className="error" role="alert">
          {result.reason}
        </small>
      )}
      {result.files.map((file) => (
        <small className="numeric" key={file.path}>
          {file.path} · {fileStateLabel[file.state]}
          {file.actualSize !== undefined
            ? ` · 实际 ${file.actualSize.toLocaleString()} B`
            : ""}
          {file.reason ? ` · ${file.reason}` : ""}
        </small>
      ))}
      {result.state === "missing" && <small>目录中没有任何发布文件，需要先安装。</small>}
      {result.state === "invalid" && result.files.length === 0 && !result.reason && (
        <small>未通过完整性校验。</small>
      )}
    </div>
  );
}
