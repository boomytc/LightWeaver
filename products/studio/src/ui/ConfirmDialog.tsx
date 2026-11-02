import type { ReactNode } from "react";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { Button } from "./Button";

export function ConfirmDialog({
  open,
  title,
  description,
  tone = "default",
  confirmLabel,
  cancelLabel = "取消",
  onConfirm,
  onClose,
  secondary,
  extra,
}: {
  open: boolean;
  title: string;
  description: string;
  tone?: "default" | "danger";
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onClose: () => void;
  secondary?: { label: string; onClick: () => void };
  extra?: ReactNode;
}) {
  return (
    <AlertDialog.Root open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="ui-overlay fixed inset-0 z-40" />
        <AlertDialog.Content className="ui-dialog fixed top-1/2 left-1/2 z-50 w-[min(480px,calc(100%-2rem))] -translate-x-1/2 -translate-y-1/2 p-5">
          <AlertDialog.Title className="text-base font-semibold">{title}</AlertDialog.Title>
          <AlertDialog.Description className="mt-2 text-sm text-muted">{description}</AlertDialog.Description>
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <AlertDialog.Cancel asChild>
              <Button onClick={onClose}>{cancelLabel}</Button>
            </AlertDialog.Cancel>
            {secondary && <Button onClick={secondary.onClick}>{secondary.label}</Button>}
            <AlertDialog.Action asChild>
              <Button variant={tone === "danger" ? "danger" : "primary"} onClick={onConfirm}>{confirmLabel}</Button>
            </AlertDialog.Action>
          </div>
          {extra}
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
