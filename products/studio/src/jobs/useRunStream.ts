import { useEffect, useRef } from "react";
import { z, EventRecord } from "@lightweaver/weaver/contracts";
import { api } from "../api";
import { isActiveRun, RunDetail } from "../domain/run";

export function useRunStream(options: {
  runId: string;
  enabled?: boolean;
  projectId?: string;
  onDetail: (detail: z.infer<typeof RunDetail>) => void;
  onEvent?: (event: z.infer<typeof EventRecord>) => void;
  onError?: (error: unknown) => void;
}) {
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const { runId, enabled = true, projectId = "" } = options;

  useEffect(() => {
    if (!enabled || !runId) return;
    const source = new EventSource(`/api/runs/${encodeURIComponent(runId)}/events`);
    const controller = new AbortController();
    let closed = false;
    let sequence = 0;
    const close = () => {
      if (closed) return;
      closed = true;
      controller.abort();
      source.close();
    };
    const pull = () => {
      const requestSequence = ++sequence;
      return api(`/runs/${runId}`, RunDetail, { signal: controller.signal })
        .then((detail) => {
          if (closed || requestSequence !== sequence || detail.run.id !== runId) return;
          if (projectId && detail.run.projectId && detail.run.projectId !== projectId) return;
          optionsRef.current.onDetail(detail);
          if (!isActiveRun(detail.run.state)) close();
        })
        .catch((error) => {
          if (!controller.signal.aborted && requestSequence === sequence)
            optionsRef.current.onError?.(error);
        });
    };
    source.addEventListener("weaver", (event) => {
      if (closed) return;
      const message = event as MessageEvent<string>;
      const parsed = EventRecord.safeParse(JSON.parse(message.data));
      if (!parsed.success) {
        optionsRef.current.onError?.(parsed.error);
        return;
      }
      if (parsed.data.runId !== runId) return;
      optionsRef.current.onEvent?.(parsed.data);
      void pull();
    });
    void pull();
    return close;
  }, [enabled, projectId, runId]);
}
