import { useEffect, useState } from "react";
import { RunRecord, z } from "@lightweaver/weaver/contracts";
import { api } from "../api";
import { runLabel } from "../domain/format";
import { isActiveRun, RESUMABLE_RUN_STATES, RunDetail } from "../domain/run";
import { useRunStream } from "./useRunStream";
import { useSession } from "../session/context";

export function JobsPage() {
  const session = useSession();
  const [runs, setRuns] = useState<z.infer<typeof RunRecord>[]>([]);
  const [selected, setSelected] = useState("");
  const [detail, setDetail] = useState<z.infer<typeof RunDetail> | null>(null);
  const load = () => api("/runs", z.array(RunRecord)).then(setRuns).catch((reason) => session.setError(String(reason)));
  useEffect(() => {
    void load();
  }, []);
  useRunStream({
    runId: selected,
    enabled: Boolean(selected),
    onDetail: (next) => {
      if (next.run.id !== selected) return;
      setDetail(next);
      void load();
    },
    onError: (reason) => session.setError(reason instanceof Error ? reason.message : String(reason)),
  });
  return (
    <main className="min-h-0 flex-1 overflow-auto p-4">
      {runs.length === 0 && <p>还没有作业。</p>}
      {runs.map((run) => (
        <article key={run.id} className="my-3 rounded-md border border-line bg-panel p-3">
          <div className="section-title">
            <button type="button" onClick={() => setSelected(run.id)}>
              {run.kind} · {runLabel(run.state)}
            </button>
            <div>
              <button
                type="button"
                disabled={!isActiveRun(run.state)}
                onClick={() =>
                  void api(`/runs/${run.id}/cancel`, RunRecord, { method: "POST", body: {} }).then(() => {
                    setSelected(run.id);
                    return load();
                  })
                }
              >
                取消
              </button>
              <button
                type="button"
                disabled={!RESUMABLE_RUN_STATES.has(run.state)}
                onClick={() =>
                  void api(`/runs/${run.id}/resume`, RunRecord, { method: "POST", body: {} }).then(() => {
                    setSelected(run.id);
                    return load();
                  })
                }
              >
                恢复
              </button>
              {run.projectId && (
                <button type="button" onClick={() => void session.navigate("projects", run.projectId || "")}>
                  打开项目
                </button>
              )}
            </div>
          </div>
          <small>{run.id}</small>
          {run.error && <p className="error">{run.error.message}</p>}
          {detail?.run.id === run.id && (
            <details>
              <summary>进度详情</summary>
              <pre>{JSON.stringify(detail, null, 2)}</pre>
            </details>
          )}
        </article>
      ))}
    </main>
  );
}
