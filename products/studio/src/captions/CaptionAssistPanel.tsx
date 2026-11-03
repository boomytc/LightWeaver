import { useEffect, useRef, useState } from "react";
import { CaptionTrack, CaptionTranslationResult, RunRecord, z } from "@lightweaver/weaver/contracts";
import { api, ApiError } from "../api";
import { localeName, runLabel } from "../domain/format";
import { isActiveRun, RESUMABLE_RUN_STATES, RunDetail } from "../domain/run";
import { notifyRunsChanged } from "../jobs/useRunList";
import { useRunStream } from "../jobs/useRunStream";
import { useSession } from "../session/context";
import { useAction } from "../ui/useAction";
import { Field } from "../ui/Field";
import { Button } from "../ui/Button";

export function CaptionAssistPanel({
  projectId,
  sourceLocale,
  expectedRevision,
  currentTrack,
  disabled,
  fail,
  onApply,
}: {
  projectId: string;
  sourceLocale: string;
  expectedRevision: string;
  currentTrack: z.infer<typeof CaptionTrack>;
  disabled: boolean;
  fail: (error: unknown) => void;
  onApply: (runId: string) => void;
}) {
  const session = useSession();
  const requestSequence = useRef(0);
  const action = useAction();
  const [targetLocale, setTargetLocale] = useState(sourceLocale === "en" ? "zh" : "en");
  const [detail, setDetail] = useState<z.infer<typeof RunDetail> | null>(null);
  useEffect(() => () => { requestSequence.current++; }, []);
  const run = detail?.run;
  const hasActiveRun = !!run && isActiveRun(run.state);
  const canResume = !!run && RESUMABLE_RUN_STATES.has(run.state);
  const stream = useRunStream({
    projectId,
    runId: run?.id || "",
    onDetail: (next) => {
      if (next.run.id !== run?.id) return;
      setDetail(next);
      if (!isActiveRun(next.run.state)) notifyRunsChanged();
    },
  });
  const result = run?.state === "succeeded"
    ? CaptionTranslationResult.safeParse(detail?.nodes[0]?.result) : null;
  const appliedResult = !!result?.success && JSON.stringify(result.data.track) === JSON.stringify(currentTrack);
  const staleResult = result?.success && !appliedResult && result.data.revision !== expectedRevision;
  const status = run && !hasActiveRun && run.state !== "succeeded" && !action.pending ? runLabel(run.state) : "";
  const submit = () => void action.run("submit", async () => {
    if (disabled || hasActiveRun) return;
    const sequence = ++requestSequence.current;
    const payload = { locale: sourceLocale, targetLocale: targetLocale.trim(), expectedRevision };
    const key = JSON.stringify(["caption-translate", projectId, payload]);
    const attempt = session.stableRequest(key);
    const send = () => api(`/projects/${projectId}/captions/assist`, RunRecord, {
      method: "POST", body: { ...payload, requestId: attempt.requestId },
    });
    setDetail(null);
    try {
      let next: z.infer<typeof RunRecord>;
      try { next = await send(); }
      catch (error) { if (error instanceof ApiError) throw error; next = await send(); }
      session.completeStableRequest(key, attempt);
      notifyRunsChanged();
      if (sequence === requestSequence.current) setDetail({ run: next, nodes: [] });
    } catch (error) {
      if (sequence === requestSequence.current) fail(error);
    }
  });
  const changeRun = (kind: "cancel" | "resume") => void action.run(kind, async () => {
    if (!run || (kind === "cancel" ? !hasActiveRun : !canResume)) return;
    const sequence = ++requestSequence.current;
    try {
      const next = await api(`/runs/${run.id}/${kind}`, RunRecord, { method: "POST", body: {} });
      notifyRunsChanged();
      if (sequence === requestSequence.current) setDetail({ run: next, nodes: [] });
    } catch (error) {
      if (sequence === requestSequence.current) fail(error);
    } finally {
      if (sequence === requestSequence.current) stream.retry();
    }
  });
  return (
    <section className="mt-4 flex flex-col gap-3 border-t border-line pt-4">
      <p className="hint m-0">生成后可预览并采用译文，音频保持原样。</p>
      <div className="actions">
        <Field label="译文目标语言">
          <input
            value={targetLocale}
            disabled={hasActiveRun || !!action.pending}
            onChange={(event) => setTargetLocale(event.target.value)}
            placeholder="例如 en"
          />
        </Field>
        <Button
          disabled={
            disabled ||
            !targetLocale.trim() || targetLocale.trim() === sourceLocale ||
            hasActiveRun || !!action.pending || !currentTrack.cues.length
          }
          onClick={submit}
        >
          {action.isPending("submit") ? "提交中…" : run?.state === "queued" ? "排队中…" : hasActiveRun ? "翻译中…" : result?.success ? "重新生成译文" : "生成译文"}
        </Button>
      </div>
      {run && (hasActiveRun || canResume) && (
        <div className="actions">
          {hasActiveRun && <Button
            disabled={
              run.state === "cancelling" || !!action.pending
            }
            onClick={() => changeRun("cancel")}
          >
            {run.state === "cancelling" || action.isPending("cancel") ? "取消中…" : "取消翻译"}
          </Button>}
          {canResume && <Button
            disabled={!!action.pending}
            onClick={() => changeRun("resume")}
          >
            {action.isPending("resume") ? "恢复中…" : "继续翻译"}
          </Button>}
        </div>
      )}
      {status && <small role="status" aria-live="polite">{status}</small>}
      {!currentTrack.cues.length && <small className="hint">请先添加或导入字幕。</small>}
      {stream.error && <div className="actions"><small className="error">暂时无法读取翻译进度。</small><Button size="sm" onClick={stream.retry}>重试连接</Button></div>}
      {run?.error && <p className="error">{run.error.message}</p>}
      {result?.success && (
        <div className="translation-review">
          <div className="section-title">
            <b>
              原文 {localeName(result.data.sourceLocale)} → 译文{" "}
              {localeName(result.data.targetLocale)}
            </b>
            {appliedResult ? <span className="text-ok text-xs" role="status">译文已采用</span> : !staleResult && <Button
              disabled={disabled || !!action.pending}
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
              项目已更新，请重新生成译文。
            </p>
          )}
        </div>
      )}
    </section>
  );
}
