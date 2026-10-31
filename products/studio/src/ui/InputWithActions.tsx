import type { InputHTMLAttributes, ReactNode } from "react";
import { Field } from "./Field";

export function InputWithActions({
  label,
  hint,
  actions,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <Field label={label}>
      <div className="input-with-actions">
        <input {...props} />
        {actions && <div className="input-actions">{actions}</div>}
      </div>
      {hint && <small>{hint}</small>}
    </Field>
  );
}
