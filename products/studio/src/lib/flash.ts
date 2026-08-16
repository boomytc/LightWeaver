import { useCallback, useEffect, useRef, useState } from "react";

export const FLASH_MS = 3000;

export type FlashKind = "ok" | "error";

export type Flash = {
  kind: FlashKind;
  text: string;
};

export function useFlash(ms = FLASH_MS): {
  flash: Flash | undefined;
  ok: (next?: string) => void;
  error: (next?: string) => void;
} {
  const [flash, setFlash] = useState<Flash>();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const show = useCallback(
    (kind: FlashKind, next?: string) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = undefined;
      const text = next?.trim();
      if (!text) {
        setFlash(undefined);
        return;
      }
      setFlash({ kind, text });
      timer.current = setTimeout(() => {
        setFlash(undefined);
        timer.current = undefined;
      }, ms);
    },
    [ms],
  );

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return {
    flash,
    ok: useCallback((next?: string) => show("ok", next), [show]),
    error: useCallback((next?: string) => show("error", next), [show]),
  };
}


