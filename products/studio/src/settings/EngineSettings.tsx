import { useCallback, useEffect, useRef, useState } from "react";
import {
  EngineVerifyResult,
  EngineView,
  ModelSettingsView,
  RunRecord,
  z,
} from "@lightweaver/weaver/contracts";
import type {
  EngineCatalogItem,
  EngineItemStatus,
} from "@lightweaver/weaver/contracts";
import { api, ApiError, requestId } from "../api";
import { openLink } from "../desktop";
import { isActiveRun } from "../domain/run";
import { notifyRunsChanged } from "../jobs/useRunList";
import { useRunStream } from "../jobs/useRunStream";
import { useSession } from "../session/context";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";

type EngineViewValue = z.infer<typeof EngineView>;
type EngineItemStatusValue = z.infer<typeof EngineItemStatus>;
type EngineItem = z.infer<typeof EngineCatalogItem>;
type EngineVerifyValue = z.infer<typeof EngineVerifyResult>;
type EngineRun = z.infer<typeof RunRecord>;

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
type EngineUsage =
  | "managed"
  | "managed-unused"
  | "external"
  | "unused"
  | "partial";
const usageBadge: Record<
  Exclude<EngineUsage, "unused">,
  { label: string; tone: "ok" | "warn" | "accent" | "neutral" }
> = {
  managed: { label: "已安装 · 已采用", tone: "ok" },
  "managed-unused": { label: "已安装 · 未采用", tone: "warn" },
  external: { label: "使用外部路径", tone: "accent" },
  partial: { label: "部分绑定可用", tone: "warn" },
};
/**
 * 安装状态和当前绑定是两件事：状态徽标只看本应用管理的安装目录，
 * 使用徽标回答“当前实际用的是哪条路径”，避免出现“未安装 + 已就绪”的矛盾观感。
 */
function usageOf(
  state: string,
  active: readonly { ready: boolean; state: string }[],
): EngineUsage {
  const ready = active.length > 0 && active.every((binding) => binding.ready);
  const unset = active.length > 0 && active.every((binding) => binding.state === "unset");
  if (state === "installed") return unset ? "managed-unused" : "managed";
  if (ready) return "external";
  if (unset) return "unused";
  return "partial";
}

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
  model_python: "模型 Python",
  speech_python: "语音 Python",
};

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
      <section className="flex flex-col gap-3" aria-label="引擎运行时">
        <h2 className="m-0">引擎运行时</h2>
        <p>加载引擎运行时…</p>
      </section>
    );

  const statuses = new Map(view.items.map((item) => [item.id, item]));
  const usageCounts = view.catalog.items.reduce(
    (counts, item) => {
      const current = statuses.get(item.id);
      if (current) counts[usageOf(current.status.state, current.active)] += 1;
      return counts;
    },
    { managed: 0, "managed-unused": 0, external: 0, unused: 0, partial: 0 } as Record<
      EngineUsage,
      number
    >,
  );
  return (
    <section className="flex flex-col gap-4" aria-labelledby="engine-settings-title">
      <div>
        <h2 id="engine-settings-title" className="m-0">引擎运行时</h2>
        <p className="hint mb-0 mt-1">
          引擎产物固定版本与 SHA-256，与模型权重分开。下载、校验、采用是三个显式操作；安装到引擎根目录，采用后写入当前配置，不复制或移动引擎目录。
        </p>
      </div>
      <dl className="key-value-list panel-card px-4">
        <div className="contents">
          <dt>引擎根目录</dt>
          <dd className="numeric">{view.installRoot.value}（{sourceName(view.installRoot.source)}）</dd>
        </div>
      </dl>
      <small>
        本应用管理：已安装 {usageCounts.managed + usageCounts["managed-unused"]} /{" "}
        {view.catalog.items.length} · 使用外部路径 {usageCounts.external} · 未使用{" "}
        {usageCounts.unused + usageCounts.partial}
      </small>
      <div className="model-inventory-grid">
        {view.catalog.items.map((item) => {
          const status = statuses.get(item.id);
          return status ? (
            <EngineCard
              key={item.id}
              item={item}
              itemStatus={status}
              revision={view.settings.revision}
              installRoot={view.installRoot.value}
              onRefresh={refresh}
            />
          ) : null;
        })}
      </div>
    </section>
  );
}

function EngineCard({
  item,
  itemStatus,
  revision,
  installRoot,
  onRefresh,
}: {
  item: EngineItem;
  itemStatus: EngineItemStatusValue;
  revision: string;
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
  const usage = usageOf(status.state, itemStatus.active);
  const usageInfo = usage === "unused" ? null : usageBadge[usage];
  const installing = install.active || install.starting;
  const blocked = !item.available || !!busy;
  const installLabel = pythonEnvironment
    ? installing
      ? "创建中…"
      : "创建/更新环境"
    : installing
      ? "安装中…"
      : "安装";

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

  const adopt = () =>
    act("adopt", async () => {
      const key = JSON.stringify(["engine-use", item.id]);
      let attempt = session.stableRequest(key);
      let saved: z.infer<typeof ModelSettingsView>;
      let retriedTransport = false;
      let retriedReuse = false;
      while (true) {
        try {
          saved = await api(
            `/engines/${encodeURIComponent(item.id)}/use`,
            ModelSettingsView,
            {
              method: "POST",
              body: { expectedRevision: revision, requestId: attempt.requestId },
            },
          );
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
            if (reason.protocol.code === "ENGINE_VERIFY_FAILED") {
              const details = EngineVerifyResult.safeParse(reason.protocol.details);
              if (details.success) setVerifyResult(details.data);
            }
            if (reason.protocol.code === "REVISION_CONFLICT") await onRefresh();
          }
          throw reason;
        }
      }
      session.completeStableRequest(key, attempt);
      await onRefresh();
      window.dispatchEvent(new Event("lightweaver-capabilities-changed"));
      const setting = item.bindings[0].setting;
      const value = saved.values[setting]?.value || "";
      if (setting === "model_python" || setting === "speech_python")
        session.setNotice(
          `已写入${setting === "speech_python" ? "语音" : "模型"} Python${value ? `：${value}` : ""}`,
        );
      else
        session.setNotice(
          `已采用 ${item.name}${value ? `：${value}` : "，配置已更新"}`,
        );
    });

  return (
    <article className="panel-card model-inventory-card">
      <div className="model-inventory-head">
        <b title={item.name}>{item.name}</b>
        <Badge tone={engineStateTone[status.state]} dot>
          {engineStateLabel[status.state]}
        </Badge>
        {usageInfo && (
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
        <small>
          当前配置使用外部路径（手工配置或系统默认），本应用管理的安装目录未安装。
          安装并通过校验后点“采用”，可把绑定切换到受管理副本。
        </small>
      )}
      {usage === "managed-unused" && (
        <small>已安装到本应用目录，尚未采用；点“采用”写入当前配置。</small>
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
          {pythonEnvironment && <small>采用后写入对应 Python 环境路径。</small>}
        </div>
      </details>
      {verifyResult && <VerifySummary result={verifyResult} />}
      {install.run && (
        <InstallSummary
          run={install.run}
          progress={install.progress}
          onCancel={() => void install.cancel()}
        />
      )}
      <div className="actions">
        <Button
          variant="primary"
          disabled={blocked || installing}
          aria-label={`${installLabel} ${item.name}`}
          onClick={() => {
            setVerifyResult(null);
            void install.start(installRoot);
          }}
        >
          {installLabel}
        </Button>
        <Button
          disabled={blocked || installing}
          aria-label={`校验 ${item.name}`}
          onClick={() => void verify()}
        >
          {busy === "verify" ? "校验中…" : "校验"}
        </Button>
        <Button
          disabled={blocked || installing || status.state === "missing"}
          aria-label={`采用 ${item.name}`}
          onClick={() => void adopt()}
        >
          {busy === "adopt" ? "采用中…" : "采用"}
        </Button>
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
      {pythonEnvironment && (
        <p className="hint m-0">
          {item.id === "python-model"
            ? "无法一键创建时，仍可按上方“安装可选模型 Python 环境”中的手工命令操作，再把解释器路径填入“模型 Python”。"
            : "无法一键创建时，可手工创建虚拟环境并安装 requirements.speech.txt，再把解释器路径写入“语音 Python”配置。"}
        </p>
      )}
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
