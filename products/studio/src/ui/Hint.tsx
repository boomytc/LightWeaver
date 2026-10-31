import type { ReactNode } from "react";
import * as Tooltip from "@radix-ui/react-tooltip";

export function HintProvider({ children }: { children: ReactNode }) {
  return <Tooltip.Provider delayDuration={400}>{children}</Tooltip.Provider>;
}

export function Hint({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content sideOffset={6} className="z-50 max-w-72 rounded-[6px] border border-line bg-elevated px-2.5 py-1.5 text-xs leading-5 text-ink shadow-[var(--lw-shadow-menu)]">
          {label}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
