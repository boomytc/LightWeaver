// Adapted from OpenSource UI inset-button (MIT).
// Copyright (c) 2026 Bidyut Kundu. https://github.com/bidyut10/opensourceui
import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { cn } from "./cn";

export const InsetButton = forwardRef<HTMLButtonElement, { children: ReactNode } & ComponentPropsWithoutRef<"button">>(
  function InsetButton({ className, children, type = "button", disabled, ...props }, ref) {
    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled}
        data-slot="inset-button"
        className={cn(
          "inline-flex h-10 cursor-pointer items-center justify-center rounded-lg border-0 bg-canvas px-4 text-sm font-semibold text-ink outline-none select-none",
          "shadow-[inset_0_1px_2px_rgba(23,24,28,0.08)] transition-[background-color,box-shadow] duration-200",
          "hover:bg-panel focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
          "disabled:pointer-events-none disabled:opacity-40",
          className,
        )}
        {...props}
      >
        {children}
      </button>
    );
  },
);
