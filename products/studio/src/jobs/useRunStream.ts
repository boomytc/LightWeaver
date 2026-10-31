import { useCallback, useEffect, useRef, useState } from "react";
import { z, EventRecord } from "@lightweaver/weaver/contracts";
import { api, ApiError } from "../api";
import { isActiveRun, RunDetail } from "../domain/run";

function errorMessage(reason: unknown) {
  return reason instanceof Error ? reason.message : String(reason);
}

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
  const [subscriptionAttempt, setSubscriptionAttempt] = useState(0);
  const [error, setError] = useState("");
  const attemptRef = useRef(0);
  const streamKey = `${projectId}\u0000${runId}`;
  const activeStreamKey = useRef(streamKey);
  const lastSequence = useRef(0);
  const retry = useCallback(() => {
    setError("");
    setSubscriptionAttempt((attempt) => attempt + 1);
  }, []);

  useEffect(() => {
    if (activeStreamKey.current === streamKey) return;
    activeStreamKey.current = streamKey;
    lastSequence.current = 0;
    setError("");
  }, [streamKey]);

  useEffect(() => {
    if (!enabled || !runId) {
      setError("");
      return;
    }
    const attempt = ++attemptRef.current;
    const controller = new AbortController();
    let closed = false;
    let reconnectTimer = 0;
    let requestSequence = 0;
    const source = new EventSource(
      `/api/runs/${encodeURIComponent(runId)}/events?after=${lastSequence.current}`,
    );
    const close = () => {
      if (closed) return;
      closed = true;
      window.clearTimeout(reconnectTimer);
      controller.abort();
      source.close();
    };
    const report = (reason: unknown) => {
      if (closed || attempt !== attemptRef.current) return;
      const message = errorMessage(reason);
      setError(message);
      optionsRef.current.onError?.(reason);
    };
    const reconnect = () => {
      if (closed || reconnectTimer) return;
      source.close();
      reconnectTimer = window.setTimeout(() => {
        if (!closed && attempt === attemptRef.current)
          setSubscriptionAttempt((current) => current + 1);
      }, 1000);
    };
    const pull = () => {
      const request = ++requestSequence;
      return api(`/runs/${runId}`, RunDetail, { signal: controller.signal })
        .then((detail) => {
          if (
            closed ||
            attempt !== attemptRef.current ||
            request !== requestSequence ||
            detail.run.id !== runId
          )
            return;
          if (projectId && detail.run.projectId && detail.run.projectId !== projectId) return;
          setError("");
          optionsRef.current.onDetail(detail);
          if (!isActiveRun(detail.run.state)) close();
        })
        .catch((error) => {
          if (!controller.signal.aborted && request === requestSequence) {
            report(error);
            if (!(error instanceof ApiError) || error.protocol.retryable) reconnect();
          }
        });
    };
    source.onerror = reconnect;
    source.addEventListener("weaver", (event) => {
      if (closed || attempt !== attemptRef.current) return;
      const message = event as MessageEvent<string>;
      let raw: unknown;
      try {
        raw = JSON.parse(message.data);
      } catch (reason) {
        report(reason);
        return;
      }
      const parsed = EventRecord.safeParse(raw);
      if (!parsed.success) {
        report(parsed.error);
        return;
      }
      if (parsed.data.runId !== runId) return;
      lastSequence.current = Math.max(lastSequence.current, parsed.data.seq);
      optionsRef.current.onEvent?.(parsed.data);
      void pull();
    });
    void pull();
    return close;
  }, [enabled, projectId, runId, subscriptionAttempt]);

  return { retry, error };
}
