import type { HTMLAttributes } from "react";
import { cn } from "./cn";

export function Badge({
  tone = "neutral",
  dot = false,
  pulse = false,
  className,
  children,
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  tone?: "neutral" | "accent" | "ok" | "warn" | "danger";
  dot?: boolean;
  pulse?: boolean;
}) {
  return (
    <span className={cn("ui-badge", className)} data-tone={tone} {...props}>
      {dot && <span className={pulse ? "status-dot is-active" : "status-dot"} aria-hidden="true" />}
      {children}
    </span>
  );
}
