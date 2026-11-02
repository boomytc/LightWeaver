import type { ReactNode } from "react";
import { PageHeader } from "./PageHeader";
import { cn } from "./cn";

export function PageFrame({
  title,
  description,
  actions,
  measure = "wide",
  scroll = true,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  measure?: "wide" | "narrow" | "full";
  scroll?: boolean;
  children: ReactNode;
}) {
  return (
    <main className="flex min-h-0 flex-1 flex-col" id="main" tabIndex={-1}>
      <PageHeader title={title} description={description} actions={actions} />
      {scroll ? (
        <div className="scroll-region page-scroll">
          <div className={cn(measure === "wide" && "page-content", measure === "narrow" && "narrow-content", measure === "full" && "w-full")}>
            {children}
          </div>
        </div>
      ) : (
        children
      )}
    </main>
  );
}
