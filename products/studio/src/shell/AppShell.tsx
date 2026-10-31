import type { ReactNode } from "react";
import * as Popover from "@radix-ui/react-popover";
import { useSession } from "../session/context";
import { HintProvider } from "../ui/Hint";
import { ConfirmDialog } from "../ui/ConfirmDialog";

const nav = [
  ["projects", "项目"],
  ["methods", "方法"],
  ["voices", "音色"],
  ["library", "素材库"],
  ["jobs", "任务"],
  ["settings", "设置"],
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const session = useSession();
  return (
    <HintProvider>
      <div className="flex h-full min-h-0 flex-col bg-canvas text-ink">
        <header className="flex items-center gap-3 border-b border-line bg-panel px-3 py-2">
          <strong>LightWeaver</strong>
          <nav className="flex flex-wrap gap-1" aria-label="全局">
            {nav.map(([page, label]) => (
              <button
                key={page}
                type="button"
                className={session.route.page === page ? "border-accent" : "border-transparent bg-transparent"}
                onClick={() => void session.navigate(page)}
              >
                {label}
              </button>
            ))}
          </nav>
          <Popover.Root open={session.findOpen} onOpenChange={session.setFindOpen}>
            <Popover.Anchor className="ml-auto" />
            <Popover.Portal>
              <Popover.Content className="z-50 w-72 rounded-md border border-line bg-panel p-3 text-ink shadow-lg">
                <label className="field">
                  <span>查找项目</span>
                  <input
                    data-lw-find=""
                    placeholder="项目名"
                    onChange={(event) => {
                      const query = event.target.value.trim();
                      const match = session.projects.find((project) => (project.document.title || "").includes(query));
                      if (match && query) void session.navigate("projects", match.projectId);
                    }}
                  />
                </label>
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
        </header>
        {session.error && (
          <div role="alert" className="flex items-start justify-between gap-3 border-b border-line bg-danger-bg px-3 py-2 text-danger">
            <span>操作未完成：{session.error}</span>
            <button type="button" onClick={session.clearError}>
              关闭
            </button>
          </div>
        )}
        {session.notice && (
          <button type="button" className="border-x-0 border-t-0 bg-ok-bg text-left text-ok" onClick={session.clearNotice}>
            {session.notice}（点击关闭）
          </button>
        )}
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
        <ConfirmDialog
          open={session.leaveOpen}
          title="有未保存的修改"
          description="可以先保存，保留可恢复草稿，放弃这些修改，或取消并留在这里。"
          onOpenChange={(open) => {
            if (!open) session.answerLeave("cancel");
          }}
        >
          <button type="button" className="primary" onClick={() => session.answerLeave("save")}>
            保存
          </button>
          <button type="button" onClick={() => session.answerLeave("keep")}>
            保留草稿
          </button>
          <button type="button" onClick={() => session.answerLeave("discard")}>
            放弃
          </button>
          <button type="button" onClick={() => session.answerLeave("cancel")}>
            取消
          </button>
        </ConfirmDialog>
        <ConfirmDialog
          open={session.jobsOpen}
          title="还有未结束的作业"
          description="可以留在应用里，或停止作业后退出。没有托盘。"
          onOpenChange={(open) => {
            if (!open) session.answerJobs(false);
          }}
        >
          <button type="button" onClick={() => session.answerJobs(false)}>
            留在应用
          </button>
          <button type="button" className="primary" onClick={() => session.answerJobs(true)}>
            停止作业并退出
          </button>
        </ConfirmDialog>
      </div>
    </HintProvider>
  );
}
