import { useRef, useState } from "react";

export function useAction() {
  const [pending, setPending] = useState("");
  const busy = useRef(false);
  const run = async (id: string, action: () => Promise<void>) => {
    if (busy.current) return;
    busy.current = true;
    setPending(id);
    try {
      await action();
    } finally {
      busy.current = false;
      setPending("");
    }
  };
  return {
    pending,
    isPending: (id: string) => pending === id,
    run,
  };
}
