import type { ReactNode } from "react";
import * as Popover from "@radix-ui/react-popover";
import { useSession } from "../session/context";
import { HintProvider } from "../ui/Hint";
import { ToastStack } from "../ui/ToastStack";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { InsetButton } from "../ui/InsetButton";
import { SearchInput } from "../ui/SearchInput";
import { SoftPillButton } from "../ui/SoftPillButton";

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
  const theme = session.client.theme;
  return (
    <HintProvider>
      <div className="app-frame text-ink">
        <aside className="app-rail">
          <div className="app-brand">LightWeaver</div>
          <Popover.Root open={session.findOpen} onOpenChange={session.setFindOpen}>
            <Popover.Anchor asChild>
              <div>
                <SearchInput
                  label="查找项目"
                  placeholder="查找项目"
                  data-lw-find=""
                  onFocus={() => session.setFindOpen(true)}
                  onChange={(query) => {
                    const text = query.trim();
                    const match = session.projects.find((project) => (project.document.title || "").includes(text));
                    if (match && text) void session.navigate("projects", match.projectId);
                  }}
                />
              </div>
            </Popover.Anchor>
          </Popover.Root>
          <nav className="app-nav" aria-label="全局">
            {nav.map(([page, label]) => (
              <button
                key={page}
                type="button"
                className={session.route.page === page ? "nav-item is-on" : "nav-item"}
                aria-current={session.route.page === page ? "page" : undefined}
                onClick={() => void session.navigate(page)}
              >
                {label}
              </button>
            ))}
          </nav>
          <button
            type="button"
            className="nav-item"
            onClick={() => session.client.setTheme(theme === "dark" ? "light" : theme === "light" ? "system" : "dark")}
          >
            {theme === "dark" ? "深色" : theme === "light" ? "浅色" : "跟随系统"}
          </button>
        </aside>
        <div className="app-stage">
          <div className="app-sheet">{children}</div>
        </div>
        <ToastStack items={session.toasts} onDismiss={session.dismissToast} />
        <ConfirmDialog
          open={session.leaveOpen}
          title="有未保存的修改"
          description="修改还没写入项目。"
          onOpenChange={(open) => {
            if (!open) session.answerLeave("cancel");
          }}
        >
          <SoftPillButton onClick={() => session.answerLeave("save")}>保存</SoftPillButton>
          <InsetButton onClick={() => session.answerLeave("keep")}>保留草稿</InsetButton>
          <InsetButton onClick={() => session.answerLeave("discard")}>放弃</InsetButton>
          <InsetButton onClick={() => session.answerLeave("cancel")}>取消</InsetButton>
        </ConfirmDialog>
        <ConfirmDialog
          open={session.jobsOpen}
          title="还有未结束的作业"
          description="没有后台托盘，退出会停掉这些作业。"
          onOpenChange={(open) => {
            if (!open) session.answerJobs(false);
          }}
        >
          <InsetButton onClick={() => session.answerJobs(false)}>留在应用</InsetButton>
          <SoftPillButton onClick={() => session.answerJobs(true)}>停止作业并退出</SoftPillButton>
        </ConfirmDialog>
      </div>
    </HintProvider>
  );
}


