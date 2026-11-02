import { useEffect, useRef, useState } from "react";
import { CaptionTrack, RunRecord, z } from "@lightweaver/weaver/contracts";
import { api, requestId } from "../api";
import { localeName, runLabel } from "../domain/format";
import { ACTIVE_RUN_STATES, RESUMABLE_RUN_STATES, RunDetail } from "../domain/run";
import { notifyRunsChanged } from "../jobs/useRunList";
import { Field } from "../ui/Field";
import { Button } from "../ui/Button";

const CaptionAssistResult = z.object({
  projectId: z.string(),
  revision: z.string(),
  sourceLocale: z.string(),
  targetLocale: z.string(),
  sourceTrackDigest: z.string(),
  track: CaptionTrack,
});

export function CaptionAssistPanel({
  projectId,
  sourceLocale,
  expectedRevision,
  currentTrack,
  disabled,
  fail,
  onApply,
  onRunChange,
}: {
  projectId: string;
  sourceLocale: string;
  expectedRevision: string;
  currentTrack: z.infer<typeof CaptionTrack>;
  disabled: boolean;
  fail: (error: unknown) => void;
  onApply: (runId: string) => void;
  onRunChange?: () => void;
}) {
  const requestSequence = useRef(0);
  const [targetLocale, setTargetLocale] = useState(
    sourceLocale === "en" ? "zh" : "en",
  );
  const [run, setRun] = useState<z.infer<typeof RunRecord> | null>(null);
  const [detail, setDetail] = useState<z.infer<typeof RunDetail> | null>(null);
  const [status, setStatus] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [runAction, setRunAction] = useState<"cancel" | "resume" | null>(null);
  useEffect(() => {
    requestSequence.current++;
    setRun(null);
    setDetail(null);
    setStatus("");
    setSubmitting(false);
    setRunAction(null);
  }, [projectId, sourceLocale]);
  const runId = run?.id;
  const runState = run?.state;
  useEffect(() => {
    if (!runId || !runState || !ACTIVE_RUN_STATES.has(runState)) return;
    const sequence = requestSequence.current;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = () =>
      api(`/runs/${runId}`, RunDetail, { signal: controller.signal })
        .then((next) => {
          if (
            controller.signal.aborted ||
            sequence !== requestSequence.current
          )
            return;
          setRun(next.run);
          setDetail(next);
          setStatus(runLabel(next.run.state));
          if (next.run.error) fail(new Error(next.run.error.message));
          if (ACTIVE_RUN_STATES.has(next.run.state))
            timer = setTimeout(poll, 1000);
          else {
            notifyRunsChanged();
            onRunChange?.();
          }
        })
        .catch((error) => {
          if (
            !controller.signal.aborted &&
            sequence === requestSequence.current
          )
            fail(error);
        });
    poll();
    return () => {
      controller.abort();
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [projectId, runId, runState]);
  const result =
    detail?.run.state === "succeeded"
      ? CaptionAssistResult.safeParse(detail.nodes[0]?.result)
      : null;
  const appliedResult = !!result?.success && JSON.stringify(result.data.track) === JSON.stringify(currentTrack);
  const staleResult = result?.success && !appliedResult && result.data.revision !== expectedRevision;
  const hasActiveRun = run ? ACTIVE_RUN_STATES.has(run.state) : false;
  const canResume = run ? RESUMABLE_RUN_STATES.has(run.state) : false;
  const submit = () => {
    if (disabled || submitting || hasActiveRun || runAction) return;
    const sequence = ++requestSequence.current;
    setSubmitting(true);
    setRun(null);
    setDetail(null);
    setStatus("提交中");
    api(`/projects/${projectId}/captions/assist`, RunRecord, {
      method: "POST",
      body: {
        locale: sourceLocale,
        targetLocale,
        expectedRevision,
        requestId: requestId(),
      },
    })
      .then((next) => {
        if (sequence !== requestSequence.current) return;
        setSubmitting(false);
        setRun(next);
        setStatus(runLabel(next.state));
        notifyRunsChanged();
        onRunChange?.();
      })
      .catch((error) => {
        if (sequence !== requestSequence.current) return;
        setSubmitting(false);
        setStatus("");
        fail(error);
      });
  };
  const changeRun = (action: "cancel" | "resume") => {
    if (!run || runAction) return;
    if (action === "cancel" && !hasActiveRun) return;
    if (action === "resume" && !canResume) return;
    const sequence = ++requestSequence.current;
    setRunAction(action);
    setStatus(action === "cancel" ? "正在取消作业" : "正在恢复作业");
    api(`/runs/${run.id}/${action}`, RunRecord, {
      method: "POST",
      body: {},
    })
      .then((next) => {
        if (sequence !== requestSequence.current) return;
        setRunAction(null);
        setRun(next);
        setDetail(null);
        setStatus(runLabel(next.state));
        notifyRunsChanged();
        onRunChange?.();
      })
      .catch((error) => {
        if (sequence !== requestSequence.current) return;
        setRunAction(null);
        setStatus(runLabel(run.state));
        fail(error);
      });
  };
  return (
    <section className="mt-4 flex flex-col gap-3 border-t border-line pt-4">
      <h3 className="m-0 text-sm">字幕翻译</h3>
      <p className="hint m-0">生成后可预览并采用译文，音频保持原样。</p>
      <div className="actions">
        <Field label="译文目标语言">
          <input
            value={targetLocale}
            onChange={(event) => setTargetLocale(event.target.value)}
            placeholder="例如 en"
          />
        </Field>
        <Button
          disabled={
            disabled ||
            !targetLocale.trim() || targetLocale.trim() === sourceLocale ||
            submitting ||
            hasActiveRun ||
            runAction !== null
          }
          onClick={submit}
        >
          {submitting ? "提交中…" : hasActiveRun ? "翻译中…" : result?.success ? "重新生成译文" : "生成译文"}
        </Button>
      </div>
      {run && (hasActiveRun || canResume) && (
        <div className="actions">
          {hasActiveRun && <Button
            disabled={
              !hasActiveRun ||
              run.state === "cancelling" ||
              runAction !== null
            }
            onClick={() => changeRun("cancel")}
          >
            取消作业
          </Button>}
          {canResume && <Button
            disabled={!canResume || runAction !== null}
            onClick={() => changeRun("resume")}
          >
            恢复未完成步骤
          </Button>}
        </div>
      )}
      {status && <small role="status" aria-live="polite">{status}</small>}
      {detail?.run.error && (
        <p className="error">{detail.run.error.message}</p>
      )}
      {result?.success && (
        <div className="translation-review">
          <div className="section-title">
            <b>
              原文 {localeName(result.data.sourceLocale)} → 译文{" "}
              {localeName(result.data.targetLocale)}
            </b>
            {appliedResult ? <span className="text-ok text-xs" role="status">译文已采用</span> : !staleResult && <Button
              disabled={disabled}
              onClick={() => {
                if (run) onApply(run.id);
              }}
            >
              采用译文
            </Button>}
          </div>
          {result.data.track.cues.map((cue) => (
            <div className="translation-cue" key={cue.id}>
              <small>原文</small>
              <p>
                {cue.translationSourceText ??
                  cue.sourceText ??
                  "原轨没有保留原始文本"}
              </p>
              <small>译文</small>
              <p>{cue.text}</p>
            </div>
          ))}
          {staleResult && (
            <p className="hint">
              字幕已更新，此次译文仅供查看。
            </p>
          )}
        </div>
      )}
    </section>
  );
}
