import { useEffect, useRef, useState } from "react";

export const FLASH_MS = 3000;

export function useFlash(ms = FLASH_MS): [string | undefined, (next?: string) => void] {
  const [message, setMessage] = useState<string>();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  function flash(next?: string) {
    if (timer.current) clearTimeout(timer.current);
    timer.current = undefined;
    const text = next?.trim();
    setMessage(text || undefined);
    if (!text) return;
    timer.current = setTimeout(() => {
      setMessage(undefined);
      timer.current = undefined;
    }, ms);
  }

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return [message, flash];
}
