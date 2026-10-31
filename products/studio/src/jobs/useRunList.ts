import { useCallback, useEffect, useRef, useState } from "react";
import { RunRecord, z } from "@lightweaver/weaver/contracts";
import { api } from "../api";
import { isActiveRun } from "../domain/run";

export const RUNS_CHANGED_EVENT = "lightweaver-runs-changed";

export function notifyRunsChanged() {
  window.dispatchEvent(new Event(RUNS_CHANGED_EVENT));
}

export function useRunList(onError?: (reason: unknown) => void) {
  const [runs, setRuns] = useState<z.infer<typeof RunRecord>[]>([]);
  const errorRef = useRef(onError);
  errorRef.current = onError;
  const sequence = useRef(0);
  const refresh = useCallback(async () => {
    const request = ++sequence.current;
    try {
      const next = await api("/runs", z.array(RunRecord));
      if (request === sequence.current) setRuns(next);
    } catch (reason) {
      if (request === sequence.current) errorRef.current?.(reason);
    }
  }, []);
  useEffect(() => {
    void refresh();
    const onChanged = () => void refresh();
    const onVisibility = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    window.addEventListener(RUNS_CHANGED_EVENT, onChanged);
    window.addEventListener("focus", onChanged);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener(RUNS_CHANGED_EVENT, onChanged);
      window.removeEventListener("focus", onChanged);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refresh]);
  const active = runs.some((run) => isActiveRun(run.state));
  useEffect(() => {
    const intervalMs = active ? 2000 : 5000;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "hidden") return;
      void refresh();
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [active, refresh]);
  return { runs, refresh };
}
