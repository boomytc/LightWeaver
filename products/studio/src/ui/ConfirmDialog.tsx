import type { ReactNode } from "react";
import * as AlertDialog from "@radix-ui/react-alert-dialog";

export function ConfirmDialog({
  open,
  title,
  description,
  onOpenChange,
  children,
}: {
  open: boolean;
  title: string;
  description: string;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}) {
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-40 bg-[#17181c]/35" />
        <AlertDialog.Content className="fixed top-1/2 left-1/2 z-50 w-[min(440px,calc(100%-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-[14px] border border-line bg-elevated p-5 text-ink shadow-[var(--lw-shadow-menu)]">
          <AlertDialog.Title className="text-base font-semibold">{title}</AlertDialog.Title>
          <AlertDialog.Description className="mt-2 text-sm text-muted">
            {description}
          </AlertDialog.Description>
          <div className="mt-4 flex flex-wrap justify-end gap-2">{children}</div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
