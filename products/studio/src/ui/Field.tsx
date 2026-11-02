import type { ReactNode } from "react";

export function Field({
  label,
  required = false,
  hint,
  error,
  success,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: ReactNode;
  error?: ReactNode;
  success?: ReactNode;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span>
        {label}
        {required && <b className="field-required">必填</b>}
      </span>
      {children}
      {hint && <small className="hint">{hint}</small>}
      {error ? <small className="error" role="alert">{error}</small> : success ? <small className="text-ok">{success}</small> : null}
    </label>
  );
}
