import { createContext, useContext, type ReactNode } from "react";
import type { ProjectSession } from "./useProjectSession";

const SessionContext = createContext<ProjectSession | null>(null);

export function SessionProvider({ value, children }: { value: ProjectSession; children: ReactNode }) {
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const value = useContext(SessionContext);
  if (!value) throw new Error("项目会话还没有准备好");
  return value;
}
