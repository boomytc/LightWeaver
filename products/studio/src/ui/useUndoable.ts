import { useEffect, useRef } from "react";

type NoticeOptions = { actionLabel: string; onAction: () => void };

export function useUndoable({ delayMs = 5000 }: { delayMs?: number } = {}) {
  const timers = useRef(new Map<string, number>());
  useEffect(() => () => {
    for (const timer of timers.current.values()) window.clearTimeout(timer);
    timers.current.clear();
  }, []);
  const cancel = (key: string) => {
    const timer = timers.current.get(key);
    if (timer !== undefined) window.clearTimeout(timer);
    timers.current.delete(key);
  };
  const schedule = (
    key: string,
    commit: () => void,
    options: { onUndo: () => void; notify: (options: NoticeOptions) => void },
  ) => {
    cancel(key);
    const timer = window.setTimeout(() => {
      timers.current.delete(key);
      commit();
    }, delayMs);
    timers.current.set(key, timer);
    options.notify({
      actionLabel: "撤销",
      onAction: () => {
        cancel(key);
        options.onUndo();
      },
    });
  };
  return { schedule, cancel };
}
