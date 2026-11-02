import type { ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";

export function Modal({
  open,
  title,
  onOpenChange,
  children,
}: {
  open: boolean;
  title: string;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="ui-overlay fixed inset-0 z-40" />
        <Dialog.Content className="ui-dialog fixed top-1/2 left-1/2 z-50 flex max-h-[min(760px,calc(100vh-2rem))] w-[min(560px,calc(100%-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden p-5">
          <Dialog.Title className="mb-3 text-base font-semibold">{title}</Dialog.Title>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
