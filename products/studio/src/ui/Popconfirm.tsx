import { useRef, useState, type ReactNode } from "react";
import * as Popover from "@radix-ui/react-popover";
import { Button } from "./Button";

export function Popconfirm({
  title,
  description,
  confirmLabel = "删除",
  cancelLabel = "取消",
  tone = "danger",
  onConfirm,
  children,
}: {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
  onConfirm: () => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>{children}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className="ui-popover z-50 w-64 p-3"
          sideOffset={6}
          align="end"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            cancelRef.current?.focus();
          }}
        >
          <b className="block text-[13px]">{title}</b>
          {description && <p className="hint mb-0 mt-1 text-xs">{description}</p>}
          <div className="mt-3 flex justify-end gap-2">
            <Button ref={cancelRef} size="sm" onClick={() => setOpen(false)}>{cancelLabel}</Button>
            <Button
              size="sm"
              variant={tone === "danger" ? "danger" : "primary"}
              onClick={() => {
                onConfirm();
                setOpen(false);
              }}
            >
              {confirmLabel}
            </Button>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
