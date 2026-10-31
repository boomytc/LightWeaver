import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "./cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "icon";

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: ButtonVariant;
    size?: ButtonSize;
    compact?: boolean;
    emphasized?: boolean;
  }
>(function Button(
  {
    className,
    variant = "secondary",
    size = "md",
    compact = false,
    emphasized = false,
    type = "button",
    ...props
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn("ui-button", className)}
      data-variant={variant}
      data-size={size}
      data-compact={compact || undefined}
      data-emphasized={emphasized || undefined}
      {...props}
    />
  );
});
