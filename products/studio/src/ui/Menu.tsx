import type { ReactNode } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Button } from "./Button";
import { ChevronDownIcon } from "./Icons";

export function Menu({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button variant="ghost" size="sm">
          {label}
          <ChevronDownIcon />
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="z-50 min-w-48 rounded-[10px] border border-line bg-elevated p-1.5 text-ink shadow-[var(--lw-shadow-menu)]"
        >
          {children}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export function MenuItem({
  children,
  onSelect,
  disabled = false,
}: {
  children: ReactNode;
  onSelect: () => void;
  disabled?: boolean;
}) {
  return (
    <DropdownMenu.Item
      disabled={disabled}
      className="cursor-pointer rounded-[6px] px-2.5 py-2 text-[13px] outline-none data-[disabled]:pointer-events-none data-[highlighted]:bg-subtle-bg data-[disabled]:opacity-45"
      onSelect={onSelect}
    >
      {children}
    </DropdownMenu.Item>
  );
}
