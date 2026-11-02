import { useEffect, useMemo, useState } from "react";
import { EngineSetupResult, RunRecord, z } from "@lightweaver/weaver/contracts";
import { api } from "../api";
import { runLabel } from "../domain/format";
import { isActiveRun, RESUMABLE_RUN_STATES, RunDetail } from "../domain/run";
import { useRunStream } from "./useRunStream";
import { notifyRunsChanged, useRunList } from "./useRunList";
import { useSession } from "../session/context";
import { PageHeader } from "../ui/PageHeader";
import { Button } from "../ui/Button";
import { Badge } from "../ui/Badge";
import { JobsIcon, ProjectIcon, RefreshIcon } from "../ui/Icons";

type Filter = "all" | "active" | "resumable" | "completed";

const kindLabels: Record<string, string> = {
  build: "影片制作",
  analyze: "素材分析",
  "reference-match": "参考成片匹配",
  "semantic-search": "语义检索",
  "visual-search": "画面检索",
  capture: "网页捕获",
  "import-proposal": "导入候选方案",
  "import-analysis": "导入分析结果",
  "model-download": "模型下载",
  "model-setup": "下载并启用模型",
  "engine-install": "引擎安装",
  "engine-setup": "本地运行环境配置",
  "caption-translate": "字幕翻译",
  "caption-speakers": "说话人分段",
};

const engineRoleLabels: Record<string, string> = {
  "transcribe-native": "transcribe 运行库",
  "transcribe-bindings": "Python bindings",
  "ten-vad": "TEN VAD",
  "llama-server": "llama-server",
  "python-model": "模型 Python 环境",
  "python-speech": "语音 Python 环境",
};

function nodeLabel(key: string): string {
  if (key === "activate") return "校验并启用模型";
  if (key.startsWith("download-")) return "下载模型文件";
  if (key === "adopt") return "写入运行时配置";
  const match = /^install-(.+)$/.exec(key);
  if (!match) return key;
  return `安装 ${engineRoleLabels[match[1]] || match[1]}`;
}

function kindLabel(kind: string): string {
  return kindLabels[kind] || kind;
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
  const { runs, refresh } = useRunList((reason) => session.setError(errorMessage(reason)));
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
  return (
    <main className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        title="任务"
        description="查看本地制作、分析、模型与运行环境作业，取消或恢复未完成的步骤。"
        actions={<>
          <div className="seg" role="group" aria-label="作业状态筛选">
            {([["all", "全部"], ["active", "运行中"], ["resumable", "可恢复"], ["completed", "已完成"]] as const).map(([value, label]) => (
              <button key={value} type="button" className={filter === value ? "is-on" : ""} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>
            ))}
          </div>
          <Button size="icon" variant="ghost" aria-label="刷新作业" onClick={() => void refresh()}><RefreshIcon /></Button>
        </>}
      />
      <div className="split-page grid min-h-0 flex-1 grid-cols-[minmax(260px,340px)_minmax(0,1fr)]">
        <aside className="scroll-region border-r border-line p-3">
          <div className="mb-2 flex items-center justify-between px-1"><small>{visibleRuns.length} 个作业</small>{isActiveRun(selectedRun?.state || "") && <Badge tone="accent" dot pulse>实时更新</Badge>}</div>
          <div className="flex flex-col gap-1">
            {visibleRuns.map((run) => (
              <button key={run.id} type="button" className={`row-item ${selected === run.id ? "is-on" : ""}`} onClick={() => selectRun(run.id)}>
                <span className="dropzone-icon size-8"><JobsIcon /></span>
                <span className="row-item-copy">
                  <span className="flex items-center gap-2"><b>{kindLabel(run.kind)}</b><RunBadge state={run.state} /></span>
                  <small className="numeric mt-1">{run.id.slice(0, 12)}{run.projectId ? ` · ${run.projectId}` : ""}</small>
                </span>
              </button>
            ))}
            {visibleRuns.length === 0 && <div className="subtle-card p-6 text-center"><b>{runs.length ? "当前筛选没有作业" : "还没有作业"}</b><p className="hint mx-auto mt-1 mb-0 text-xs">制作、分析或模型任务会显示在这里。</p></div>}
          </div>
        </aside>
        <section className="scroll-region p-5">
          {selectedRun ? (
            <div className="narrow-content flex flex-col gap-4">
              <div className="section-title items-start">
                <div className="flex-col !items-start gap-1">
                  <div className="flex flex-wrap items-center gap-2"><h2 className="m-0">{kindLabel(selectedRun.kind)}</h2><RunBadge state={selectedRun.state} /></div>
                  <small className="numeric">作业 {selectedRun.id}</small>
                </div>
                <div>
                  {selectedRun.projectId && <Button size="sm" variant="ghost" onClick={() => void session.navigate("projects", selectedRun.projectId || "")}><ProjectIcon />打开项目</Button>}
                  {["engine-setup", "engine-install"].includes(selectedRun.kind) && <Button size="sm" variant="ghost" onClick={() => void session.navigate("settings", "", "diagnostics")}>打开诊断与修复</Button>}
                  {selectedRun.kind === "model-setup" && <Button size="sm" variant="ghost" onClick={() => void session.navigate("settings", "", "models")}>打开模型</Button>}
                  <Button size="sm" disabled={!isActiveRun(selectedRun.state)} onClick={() => void changeRun("cancel", selectedRun.id)}>取消</Button>
                  <Button size="sm" disabled={!RESUMABLE_RUN_STATES.has(selectedRun.state)} onClick={() => void changeRun("resume", selectedRun.id)}>{selectedRun.kind === "model-setup" && selectedRun.error?.code === "CONFIG_CONFLICT" ? "重新启用" : "恢复"}</Button>
                </div>
              </div>
              {stream.error && <p className="error m-0">{stream.error}</p>}
              {selectedRun.error && <div className="rounded-[10px] border border-line bg-[var(--lw-danger-bg)] p-3 text-danger"><b>作业错误</b><p className="m-0 mt-1">{selectedRun.error.message}</p></div>}
              <dl className="key-value-list panel-card px-4">
                <dt>作业类型</dt><dd>{kindLabel(selectedRun.kind)} · {selectedRun.kind}</dd>
                <dt>当前状态</dt><dd>{runLabel(selectedRun.state)}</dd>
                <dt>所属项目</dt><dd>{selectedRun.projectId || "无项目"}</dd>
                <dt>更新时间</dt><dd className="numeric">{selectedRun.updatedAt}</dd>
              </dl>
              <section className="panel-card p-4">
                <div className="section-title mb-3"><h3 className="m-0 text-sm">节点执行步骤</h3>{detail && <Badge>{detail.nodes.filter((node) => node.state === "succeeded").length}/{detail.nodes.length} 完成</Badge>}</div>
                {!detail && <p className="hint">正在读取作业详情…</p>}
                <div className="flex flex-col gap-2">
                  {detail?.nodes.map((node, index) => (
                    <div className="subtle-card flex items-start gap-3 p-3" key={node.key}>
                      <span className="storyboard-index mt-1">{String(index + 1).padStart(2, "0")}</span>
                      <div className="min-w-0 flex-1">
                        <b className="text-xs">{nodeLabel(node.key)}</b>
                        <small className="numeric block">{node.key} · 尝试 {node.attempts} 次</small>
                        {node.error != null && <p className="error mb-0 mt-1 text-xs">{JSON.stringify(node.error)}</p>}
                        {selectedRun.kind === "engine-setup" && node.key === "adopt" &&
                          skippedMessages(node.result).map((skip) => (
                            <p className="error mb-0 mt-1 text-xs" role="alert" key={skip.id}>
                              {skippedLabel(skip.id)}：{skip.message}
                            </p>
                          ))}
                      </div>
                      <RunBadge state={node.state} />
                    </div>
                  ))}
                </div>
              </section>
              {detail && <details className="panel-card p-4"><summary className="font-medium">原始诊断数据</summary><pre className="code-block mt-3 max-h-[420px]">{JSON.stringify(detail, null, 2)}</pre></details>}
            </div>
          ) : <div className="subtle-card flex h-full min-h-64 flex-col items-center justify-center p-8 text-center"><JobsIcon className="mb-3 size-6" /><b>选择一个作业查看详情</b><p className="hint mx-auto mt-1 mb-0">状态、错误、节点步骤和原始诊断会显示在右侧。</p></div>}
        </section>
      </div>
    </main>
  );
}

function RunBadge({ state }: { state: string }) {
  const tone = isActiveRun(state) ? "accent" : state === "succeeded" ? "ok" : RESUMABLE_RUN_STATES.has(state as z.infer<typeof RunRecord>["state"]) ? "warn" : "neutral";
  return <Badge tone={tone} dot pulse={isActiveRun(state)}>{runLabel(state)}</Badge>;
}
