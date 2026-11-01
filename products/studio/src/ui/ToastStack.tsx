// Adapted from OpenSource UI toast-notification-banner (MIT).
// Copyright (c) 2026 Bidyut Kundu. https://github.com/bidyut10/opensourceui
import { useEffect, useRef, useState } from "react";

const IDLE_MS = 3000;
const EXIT_MS = 220;

export type ToastTone = "ok" | "danger";

export type ToastItem = {
  id: string;
  message: string;
  tone: ToastTone;
  scope: { projectId: string; generation: number } | null;
};

export function ToastStack({ items, onDismiss }: { items: ToastItem[]; onDismiss: (id: string) => void }) {
  if (items.length === 0) return null;
  return (
    <div className="pointer-events-none fixed top-[68px] right-5 z-40 flex w-80 flex-col gap-2" aria-live="polite">
      {items.map((item) => (
        <ToastCard key={item.id} item={item} onDismiss={() => onDismiss(item.id)} />
      ))}
    </div>
  );
}

function ToastCard({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
  const [phase, setPhase] = useState<"open" | "closing">("open");
  const contact = useRef({ pointer: false, focus: false });
  const timer = useRef<number | null>(null);
  const dismiss = useRef(onDismiss);
  dismiss.current = onDismiss;

  const clearTimer = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  };
  const arm = () => {
    clearTimer();
    if (item.tone === "danger" || contact.current.pointer || contact.current.focus) return;
    timer.current = window.setTimeout(() => {
      if (contact.current.pointer || contact.current.focus) return;
      setPhase("closing");
    }, IDLE_MS);
  };

  useEffect(() => {
    arm();
    return clearTimer;
  }, []);

  useEffect(() => {
    if (phase !== "closing") return;
    const id = window.setTimeout(() => dismiss.current(), EXIT_MS);
    return () => window.clearTimeout(id);
  }, [phase]);

  return (
    <div
      role={item.tone === "danger" ? "alert" : "status"}
      data-slot="toast-notification-banner"
      data-phase={phase}
      data-tone={item.tone}
      className="toast-card pointer-events-auto flex items-start gap-3 rounded-[14px] border border-line bg-elevated/95 px-3.5 py-3 shadow-[var(--lw-shadow-menu)] backdrop-blur-xl"
      onPointerEnter={() => {
        contact.current.pointer = true;
        clearTimer();
      }}
      onPointerLeave={() => {
        contact.current.pointer = false;
        arm();
      }}
      onFocus={() => {
        contact.current.focus = true;
        clearTimer();
      }}
      onBlur={(event) => {
        if (event.currentTarget.contains(event.relatedTarget)) return;
        contact.current.focus = false;
        arm();
      }}
    >
      <span className={`mt-1 size-2 shrink-0 rounded-full ${item.tone === "danger" ? "bg-danger" : "bg-ok"}`} aria-hidden="true" />
      <p className="m-0 max-h-[50vh] min-w-0 flex-1 overflow-y-auto whitespace-pre-line break-words text-[13px] leading-5">{item.message}</p>
      <button
        type="button"
        aria-label="关闭"
        className="shrink-0 border-0 bg-transparent p-0 text-xs text-muted shadow-none hover:bg-transparent hover:text-ink"
        onClick={() => setPhase("closing")}
      >
        关闭
      </button>
    </div>
  );
}
