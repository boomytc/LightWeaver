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
          "inline-flex h-10 cursor-pointer items-center justify-center rounded-lg border border-line bg-panel px-4 text-sm font-semibold text-ink outline-none select-none",
          "transition-[background-color,border-color] duration-200",
          "hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
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
