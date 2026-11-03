import { useEffect, useMemo, useState } from "react";
import { EngineSetupResult, RunRecord, z } from "@lightweaver/weaver/contracts";
import { api } from "../api";
import { runKindLabel } from "../domain/format";
import { isActiveRun, RESUMABLE_RUN_STATES, RunDetail } from "../domain/run";
import { useRunStream } from "./useRunStream";
import { notifyRunsChanged, useRunList } from "./useRunList";
import { useSession } from "../session/context";
import { PageFrame } from "../ui/PageFrame";
import { Segmented } from "../ui/Segmented";
import { AsyncRegion } from "../ui/AsyncRegion";
import { ProgressBar } from "../ui/ProgressBar";
import { RunStatus } from "../ui/RunStatus";
import { Button } from "../ui/Button";
import { Badge } from "../ui/Badge";
import { JobsIcon, ProjectIcon, RefreshIcon } from "../ui/Icons";

type Filter = "all" | "active" | "resumable" | "completed";

const engineRoleLabels: Record<string, string> = {
  "transcribe-native": "transcribe 运行库",
  "transcribe-bindings": "Python bindings",
  "ten-vad": "TEN VAD",
  "llama-server": "llama-server",
  "python-runtime": "Python 运行环境",
};

function nodeLabel(key: string): string {
  if (key === "activate") return "校验并启用模型";
  if (key.startsWith("download-")) return "下载模型文件";
  if (key === "adopt") return "检查组件与模型";
  const match = /^install-(.+)$/.exec(key);
  if (!match) return key;
  return `安装 ${engineRoleLabels[match[1]] || match[1]}`;
}

function skippedMessages(result: unknown) {
  const parsed = EngineSetupResult.safeParse(result);
  return parsed.success ? parsed.data.skipped : [];
}

function skippedLabel(id: string) {
  if (id.startsWith("model:")) return `模型 ${id.slice("model:".length)}`;
  return engineRoleLabels[id] || id;
}

function errorMessage(reason: unknown) {
  return reason instanceof Error ? reason.message : String(reason);
}

export function JobsPage() {
  const session = useSession();
  const [selected, setSelected] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [detail, setDetail] = useState<z.infer<typeof RunDetail> | null>(null);
  const { runs, refresh, status: runsStatus, error: runsError } = useRunList((reason) => session.setError(errorMessage(reason)));
  const visibleRuns = useMemo(() => runs.filter((run) =>
    filter === "all" ||
    (filter === "active" && isActiveRun(run.state)) ||
    (filter === "resumable" && RESUMABLE_RUN_STATES.has(run.state)) ||
    (filter === "completed" && run.state === "succeeded"),
  ), [filter, runs]);
  useEffect(() => {
    if (!visibleRuns.some((run) => run.id === selected)) {
      setSelected(visibleRuns[0]?.id || "");
      setDetail(null);
    }
  }, [visibleRuns, selected]);
  const stream = useRunStream({
    runId: selected,
    enabled: Boolean(selected),
    onDetail: (next) => {
      if (next.run.id !== selected) return;
      setDetail(next);
      void refresh();
    },
    onError: (reason) => session.setError(errorMessage(reason)),
  });
  const selectRun = (runId: string) => {
    setSelected(runId);
    setDetail(null);
    stream.retry();
  };
  const changeRun = async (kind: "cancel" | "resume", runId: string) => {
    try {
      const run = runs.find((item) => item.id === runId);
      if (kind === "resume" && run?.kind === "model-setup" && run.error?.code === "CONFIG_CONFLICT") {
        session.setNotice("模型设置已变化，请重新启用；已有文件会复用。");
        await session.navigate("settings", "", "models");
        return;
      }
      await api(`/runs/${runId}/${kind}`, RunRecord, { method: "POST", body: {} });
      setSelected(runId);
      if (kind === "resume") setDetail(null);
      stream.retry();
      notifyRunsChanged();
      await refresh();
    } catch (reason) {
      session.setError(errorMessage(reason));
    }
  };
  const selectedRun = runs.find((run) => run.id === selected);
  const totalNodes = detail?.nodes.length || 0;
  const completedNodes = detail?.nodes.filter((node) => node.state === "succeeded").length || 0;
  const progress = totalNodes ? Math.round(completedNodes / totalNodes * 100) : 0;
  const activeNode = detail?.nodes.find((node) => node.state === "running");
  return (
    <PageFrame
      title="任务"
      description="查看本地制作、分析、模型与运行环境作业，取消或恢复未完成的步骤。"
      scroll={false}
      actions={<Button size="icon" variant="ghost" aria-label="刷新作业" onClick={() => void refresh()}><RefreshIcon /></Button>}
    >
      <div className="split-page grid min-h-0 flex-1 grid-cols-[minmax(260px,340px)_minmax(0,1fr)]">
        <aside className="scroll-region border-r border-line p-3">
          <div className="mb-2 flex flex-col gap-2">
            <Segmented
              className="self-start"
              mode="toggle"
              label="作业状态筛选"
              value={filter}
              onChange={setFilter}
              options={[
                { value: "all", label: "全部" },
                { value: "active", label: "运行中" },
                { value: "resumable", label: "可恢复" },
                { value: "completed", label: "已完成" },
              ]}
            />
            <div className="flex items-center justify-between px-1"><small>{visibleRuns.length} 个作业</small>{isActiveRun(selectedRun?.state || "") && <Badge tone="accent" dot pulse>实时更新</Badge>}</div>
          </div>
          <div className="flex flex-col gap-1">
            <AsyncRegion
              state={runsStatus}
              error={runsError}
              onRetry={() => void refresh()}
              empty={
                visibleRuns.length === 0 ? (
                  <div className="subtle-card p-6 text-center">
                    <b>{runs.length ? "当前筛选没有作业" : "还没有作业"}</b>
                    <p className="hint mx-auto mt-1 mb-0 text-xs">制作、分析或模型任务会显示在这里。</p>
                  </div>
                ) : null
              }
            >
              {visibleRuns.map((run) => (
              <button key={run.id} type="button" className={`row-item ${selected === run.id ? "is-on" : ""}`} onClick={() => selectRun(run.id)}>
                <span className="dropzone-icon size-8"><JobsIcon /></span>
                <span className="row-item-copy">
                  <span className="flex items-center gap-2"><b>{runKindLabel(run.kind)}</b><RunStatus state={run.state} dot /></span>
                  <small className="numeric mt-1">{new Date(run.updatedAt).toLocaleString()}{run.projectId ? ` · ${run.projectId}` : ""}</small>
                </span>
              </button>
            ))}

          </AsyncRegion>
          </div>
        </aside>
        <section className="scroll-region p-5">
          {selectedRun ? (
            <div className="narrow-content flex flex-col gap-4">
              <div className="section-title items-start">
                <div className="flex-col gap-1" data-align="start">
                  <div className="flex flex-wrap items-center gap-2"><h2 className="m-0">{runKindLabel(selectedRun.kind)}</h2><RunStatus state={selectedRun.state} dot /></div>
                  <small className="numeric">更新于 {new Date(selectedRun.updatedAt).toLocaleString()}</small>
                </div>
                <div className="flex flex-wrap justify-end gap-1.5">
                  {selectedRun.projectId && <Button size="sm" variant="ghost" onClick={() => void session.navigate("projects", selectedRun.projectId || "")}><ProjectIcon />打开项目</Button>}
                  {["engine-setup", "engine-install"].includes(selectedRun.kind) && <Button size="sm" variant="ghost" onClick={() => void session.navigate("settings", "", "diagnostics")}>打开诊断与修复</Button>}
                  {selectedRun.kind === "model-setup" && <Button size="sm" variant="ghost" onClick={() => void session.navigate("settings", "", "models")}>打开模型</Button>}
                  {isActiveRun(selectedRun.state) && <Button size="sm" disabled={selectedRun.state === "cancelling"} onClick={() => void changeRun("cancel", selectedRun.id)}>{selectedRun.state === "cancelling" ? "取消中…" : "取消"}</Button>}
                  {RESUMABLE_RUN_STATES.has(selectedRun.state) && <Button size="sm" onClick={() => void changeRun("resume", selectedRun.id)}>{selectedRun.kind === "model-setup" && selectedRun.error?.code === "CONFIG_CONFLICT" ? "重新启用" : "继续任务"}</Button>}
                </div>
              </div>
              {detail && (
                <ProgressBar
                  value={progress}
                  label="作业进度"
                  stage={`${completedNodes}/${totalNodes} 节点${activeNode ? ` · ${nodeLabel(activeNode.key)}` : ""}`}
                />
              )}
              {stream.error && <p className="error m-0">{stream.error}</p>}
              {selectedRun.error && <div className="rounded-md border border-danger-line bg-danger-bg p-3 text-danger"><b>作业错误</b><p className="m-0 mt-1">{selectedRun.error.message}</p></div>}
              <section className="flex flex-col gap-2">
                <h3 className="m-0 text-sm">节点执行步骤</h3>
                {!detail && <p className="hint">正在读取作业详情…</p>}
                <div className="flex flex-col">
                  {detail?.nodes.map((node, index) => (
                    <div className="flex items-start gap-3 border-t border-line py-2.5" key={node.key}>
                      <span className="storyboard-index mt-0.5">{String(index + 1).padStart(2, "0")}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <b className="text-xs">{nodeLabel(node.key)}</b>
                        </div>
                        {node.error != null && (
                          <details className="mt-1">
                            <summary className="error w-fit text-xs">查看错误详情</summary>
                            <pre className="code-block mt-1 max-h-40">{JSON.stringify(node.error, null, 2)}</pre>
                          </details>
                        )}
                        {selectedRun.kind === "engine-setup" && node.key === "adopt" &&
                          skippedMessages(node.result).map((skip) => (
                            <p className="error mb-0 mt-1 text-xs" role="alert" key={skip.id}>
                              {skippedLabel(skip.id)}：{skip.message}
                            </p>
                          ))}
                      </div>
                      <RunStatus state={node.state} dot />
                    </div>
                  ))}
                </div>
              </section>
              {detail && <details className="panel-card p-4"><summary className="font-medium">原始诊断数据</summary><pre className="code-block mt-3 max-h-[420px]">{JSON.stringify(detail, null, 2)}</pre></details>}
            </div>
          ) : <div className="flex h-full min-h-64 flex-col items-center justify-center p-8 text-center"><JobsIcon className="mb-3 size-6" /><b>选择一个作业查看详情</b><p className="hint mx-auto mt-1 mb-0">状态、错误、节点步骤和原始诊断会显示在右侧。</p></div>}
        </section>
      </div>
    </PageFrame>
  );
}
