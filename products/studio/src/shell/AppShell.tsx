import type { ReactNode } from "react";
import * as Popover from "@radix-ui/react-popover";
import { AudioLines, Clapperboard, Library, ListChecks, Monitor, Moon, Settings, SlidersHorizontal, Sun } from "lucide-react";
import { useSession } from "../session/context";
import { HintProvider } from "../ui/Hint";
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
          <div className="app-brand">
            <span className="app-mark" aria-hidden="true">织</span>
            LightWeaver
          </div>
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
                <NavIcon page={page} />
                {label}
              </button>
            ))}
          </nav>
          <button
            type="button"
            className="nav-item"
            onClick={() => session.client.setTheme(theme === "dark" ? "light" : theme === "light" ? "system" : "dark")}
          >
            <NavIcon page={theme === "dark" ? "theme-dark" : theme === "light" ? "theme-light" : "theme-system"} />
            {theme === "dark" ? "深色" : theme === "light" ? "浅色" : "跟随系统"}
          </button>
        </aside>
        <div className="app-stage">
          {session.error && (
            <div role="alert" className="app-banner flex items-start justify-between gap-3 bg-danger-bg px-3 py-2 text-danger">
              <span>操作未完成：{session.error}</span>
              <button type="button" onClick={session.clearError}>关闭</button>
            </div>
          )}
          {session.notice && (
            <button type="button" className="app-banner bg-ok-bg text-left text-ok" onClick={session.clearNotice}>
              {session.notice}
            </button>
          )}
          <div className="app-sheet">{children}</div>
        </div>
        <ConfirmDialog
          open={session.leaveOpen}
          title="有未保存的修改"
          description="可以先保存，保留可恢复草稿，放弃这些修改，或取消并留在这里。"
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
          description="可以留在应用里，或停止作业后退出。没有托盘。"
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

function NavIcon({ page }: { page: string }) {
  const Icon = page === "projects" ? Clapperboard
    : page === "methods" ? SlidersHorizontal
    : page === "voices" ? AudioLines
    : page === "library" ? Library
    : page === "jobs" ? ListChecks
    : page === "settings" ? Settings
    : page === "theme-dark" ? Moon
    : page === "theme-light" ? Sun
    : Monitor;
  return <Icon size={16} strokeWidth={1.75} aria-hidden />;
}
