import type { ReactNode } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";

export function Menu({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger className="border border-line bg-panel px-3 py-1.5">
        {label}
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className="z-50 min-w-44 rounded-md border border-line bg-panel p-1 text-ink shadow-lg">
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
      className="cursor-pointer rounded px-2 py-1.5 outline-none data-[highlighted]:bg-canvas"
      onSelect={onSelect}
    >
      {children}
    </DropdownMenu.Item>
  );
}
