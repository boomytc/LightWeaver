// Adapted from OpenSource UI soft-pill-button (MIT).
// Copyright (c) 2026 Bidyut Kundu. https://github.com/bidyut10/opensourceui
import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { cn } from "./cn";

type Variant = "light" | "accent";
type Size = "sm" | "md";

const sizeClass: Record<Size, string> = {
  sm: "h-9 gap-1.5 px-4 text-xs",
  md: "h-10 gap-2 px-5 text-sm",
};

const variantClass: Record<Variant, string> = {
  light: "bg-panel text-ink shadow-[0_2px_4px_rgba(23,24,28,0.06),0_8px_20px_rgba(23,24,28,0.08)] hover:bg-canvas",
  accent: "bg-accent text-[var(--lw-accent-ink)] shadow-[0_2px_4px_rgba(59,108,255,0.22),0_8px_18px_rgba(59,108,255,0.16)] hover:brightness-95",
};

export const SoftPillButton = forwardRef<
  HTMLButtonElement,
  { children: ReactNode; variant?: Variant; size?: Size } & ComponentPropsWithoutRef<"button">
>(function SoftPillButton({ className, children, variant = "accent", size = "md", type = "button", disabled, ...props }, ref) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled}
      data-slot="soft-pill-button"
      className={cn(
        "inline-flex cursor-pointer items-center justify-center rounded-full border-0 font-semibold outline-none select-none",
        "transition-[background-color,box-shadow,transform,filter] duration-200",
        "active:translate-y-px disabled:pointer-events-none disabled:opacity-40",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        sizeClass[size],
        variantClass[variant],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
});
