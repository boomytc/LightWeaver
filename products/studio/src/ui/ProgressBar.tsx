export function ProgressBar({
  value,
  label,
  stage,
}: {
  value?: number;
  label: string;
  stage?: string;
}) {
  const indeterminate = value === undefined;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <small className="hint">{label}</small>
        {stage && <small className="hint">{stage}</small>}
      </div>
      <div
        className={indeterminate ? "run-progress is-indeterminate" : "run-progress"}
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={indeterminate ? undefined : Math.round(value)}
      >
        <span style={indeterminate ? undefined : { width: `${Math.max(0, Math.min(100, value))}%` }} />
      </div>
    </div>
  );
}
