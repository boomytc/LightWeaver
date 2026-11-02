import type { ReactNode } from "react";
import { Button } from "./Button";
import { ListSkeleton } from "./Skeleton";

export function AsyncRegion({
  state,
  error,
  onRetry,
  empty,
  skeleton,
  children,
}: {
  state: "loading" | "ready" | "failed";
  error?: string;
  onRetry?: () => void;
  empty?: ReactNode;
  skeleton?: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      {state === "loading" && (skeleton ?? <ListSkeleton rows={3} />)}
      {state === "failed" && (
        <div className="subtle-card mb-2 flex flex-col gap-2 p-3">
          <b>读取失败</b>
          <small className="hint">{error || "无法读取数据，请检查本地服务后重试。"}</small>
          {onRetry && (
            <div className="actions">
              <Button size="sm" onClick={onRetry}>重试</Button>
            </div>
          )}
        </div>
      )}
      {children}
      {state === "ready" && empty}
    </>
  );
}
