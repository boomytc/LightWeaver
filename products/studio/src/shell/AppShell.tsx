import { useEffect, useMemo, useState, type ReactNode } from "react";
import * as Popover from "@radix-ui/react-popover";
import { useSession } from "../session/context";
import { HintProvider } from "../ui/Hint";
import { ToastStack } from "../ui/ToastStack";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { SearchInput } from "../ui/SearchInput";
import { Button } from "../ui/Button";
import { Badge } from "../ui/Badge";
import { useRunList } from "../jobs/useRunList";
import { isActiveRun } from "../domain/run";
import {
  BrandIcon,
  JobsIcon,
  LibraryIcon,
  MethodIcon,
  MoonIcon,
  ProjectIcon,
  SearchIcon,
  SettingsIcon,
  SunIcon,
  SystemIcon,
  VoiceIcon,
} from "../ui/Icons";

const navGroups = [
  { label: "创作区", items: [["projects", "项目", ProjectIcon]] },
  {
    label: "资产与预设",
    items: [["methods", "方法", MethodIcon], ["voices", "音色", VoiceIcon], ["library", "素材库", LibraryIcon]],
  },
  { label: "系统与运维", items: [["jobs", "任务", JobsIcon], ["settings", "设置", SettingsIcon]] },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const session = useSession();
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const { runs, refresh: refreshRuns } = useRunList();
  useEffect(() => {
    void refreshRuns();
  }, [refreshRuns, session.activeRun, session.runDetail?.run.state, session.route.page]);
  const activeJobs = runs.filter((run) => isActiveRun(run.state)).length;
  const matches = useMemo(() => {
    const normalized = query.trim().normalize("NFKC").toLocaleLowerCase();
    const recent = new Set(session.client.recentProjectIds);
    return session.projects
      .filter((project) => !normalized || `${project.document.title}\n${project.projectId}`.normalize("NFKC").toLocaleLowerCase().includes(normalized))
      .sort((left, right) => Number(recent.has(right.projectId)) - Number(recent.has(left.projectId)))
      .slice(0, 8);
  }, [query, session.projects, session.client.recentProjectIds]);
  const active = Math.min(activeIndex, Math.max(0, matches.length - 1));
  const pinnedProject = useMemo(() => {
    if (session.route.projectId && session.draft) {
      return {
        id: session.route.projectId,
        title: session.draft.title || "未命名项目",
        dirty: session.dirty || session.planDirty,
        active: true,
      };
    }
    const recentId = session.client.recentProjectIds[0];
    const recent = recentId ? session.projects.find((item) => item.projectId === recentId) : undefined;
    if (!recent) return null;
    return {
      id: recent.projectId,
      title: recent.document.title || "未命名项目",
      dirty: session.client.drafts.some((item) => item.projectId === recent.projectId),
      active: false,
    };
  }, [session.route.projectId, session.draft, session.dirty, session.planDirty, session.client.recentProjectIds, session.client.drafts, session.projects]);
  const choose = async (projectId: string) => {
    await session.navigate("projects", projectId);
    session.setFindOpen(false);
    setQuery("");
    setActiveIndex(0);
  };
  return (
    <HintProvider>
      <div className="app-frame text-ink">
        <aside className="app-rail">
          <div className="app-brand">
            <span className="brand-mark"><BrandIcon /></span>
            <span>LightWeaver</span>
          </div>
          <Popover.Root open={session.findOpen} onOpenChange={session.setFindOpen}>
            <Popover.Anchor asChild>
              <div className="project-search">
                <span className="project-search-icon"><SearchIcon /></span>
                <SearchInput
                  label="查找项目"
                  placeholder="查找项目"
                  className="search-field"
                  data-lw-find=""
                  value={query}
                  onFocus={() => session.setFindOpen(true)}
                  onChange={(value) => {
                    setQuery(value);
                    setActiveIndex(0);
                    session.setFindOpen(true);
                  }}
                  onClear={() => {
                    setQuery("");
                    setActiveIndex(0);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                      event.preventDefault();
                      if (!matches.length) return;
                      const delta = event.key === "ArrowDown" ? 1 : -1;
                      setActiveIndex((active + delta + matches.length) % matches.length);
                    } else if (event.key === "Enter" && matches[active]) {
                      event.preventDefault();
                      void choose(matches[active].projectId);
                    } else if (event.key === "Escape") {
                      session.setFindOpen(false);
                    }
                  }}
                />
                {!query && <kbd className="project-search-shortcut">{navigator.platform.includes("Mac") ? "⌘F" : "Ctrl+F"}</kbd>}
              </div>
            </Popover.Anchor>
            <Popover.Portal>
              <Popover.Content
                className="search-popover z-50"
                align="start"
                sideOffset={6}
                onOpenAutoFocus={(event) => event.preventDefault()}
              >
                {matches.map((project, index) => (
                  <button
                    key={project.projectId}
                    type="button"
                    className="search-result"
                    data-active={index === active || undefined}
                    onPointerMove={() => setActiveIndex(index)}
                    onClick={() => void choose(project.projectId)}
                  >
                    <ProjectIcon className="shrink-0" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{project.document.title || "未命名项目"}</span>
                      <small className="numeric block truncate">{project.projectId}</small>
                    </span>
                  </button>
                ))}
                {matches.length === 0 && <p className="hint m-0 px-2 py-3 text-center text-xs">没有匹配的项目</p>}
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
          <nav className="app-nav" aria-label="全局">
            {navGroups.map((group) => (
              <div className="nav-group" key={group.label}>
                <div className="nav-group-label">{group.label}</div>
                {group.items.map(([page, label, Icon]) => {
                  const isPageOn = page === "projects"
                    ? session.route.page === "projects" && !session.route.projectId
                    : session.route.page === page;
                  return (
                    <div key={page}>
                      <button
                        type="button"
                        className={isPageOn ? "nav-item is-on" : "nav-item"}
                        aria-current={isPageOn ? "page" : undefined}
                        onClick={() => void session.navigate(page)}
                      >
                        <Icon />
                        <span className="nav-item-label">{label}</span>
                        {page === "jobs" && activeJobs > 0 && (
                          <Badge tone="accent" dot pulse aria-label={`${activeJobs} 个活跃作业`}>{activeJobs}</Badge>
                        )}
                      </button>
                      {page === "projects" && pinnedProject && (
                        <button
                          type="button"
                          className={`nav-item mt-1 h-8 pl-8 text-xs ${pinnedProject.active ? "is-on" : ""}`}
                          aria-current={pinnedProject.active ? "page" : undefined}
                          onClick={() => void session.navigate("projects", pinnedProject.id)}
                        >
                          <span className={`status-dot ${pinnedProject.dirty ? "text-warn" : "text-ok"}`} />
                          <span className="nav-item-label truncate">{pinnedProject.title}</span>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </nav>
          <div className="seg theme-switch" role="group" aria-label="界面主题">
            {([
              ["light", "浅色", SunIcon],
              ["system", "跟随系统", SystemIcon],
              ["dark", "深色", MoonIcon],
            ] as const).map(([value, label, Icon]) => (
              <button
                key={value}
                type="button"
                className={session.client.theme === value ? "is-on" : ""}
                aria-label={label}
                aria-pressed={session.client.theme === value}
                title={label}
                onClick={() => session.client.setTheme(value)}
              >
                <Icon />
              </button>
            ))}
          </div>
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
          <Button variant="primary" onClick={() => session.answerLeave("save")}>保存</Button>
          <Button onClick={() => session.answerLeave("keep")}>保留草稿</Button>
          <Button variant="danger" onClick={() => session.answerLeave("discard")}>放弃</Button>
          <Button variant="ghost" onClick={() => session.answerLeave("cancel")}>取消</Button>
        </ConfirmDialog>
        <ConfirmDialog
          open={session.jobsOpen}
          title="还有未结束的作业"
          description="退出应用会停止这些作业。需要继续执行时，可留在应用或关窗后选择后台运行。"
          onOpenChange={(open) => {
            if (!open) session.answerJobs(false);
          }}
        >
          <Button onClick={() => session.answerJobs(false)}>留在应用</Button>
          <Button variant="danger" onClick={() => session.answerJobs(true)}>停止作业并退出</Button>
        </ConfirmDialog>
      </div>
    </HintProvider>
  );
}
