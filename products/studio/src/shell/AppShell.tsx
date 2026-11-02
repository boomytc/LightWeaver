import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import * as Popover from "@radix-ui/react-popover";
import { useSession } from "../session/context";
import { HintProvider } from "../ui/Hint";
import { ToastStack } from "../ui/ToastStack";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { SearchInput } from "../ui/SearchInput";
import { Segmented } from "../ui/Segmented";
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
  const [narrow, setNarrow] = useState(() => window.matchMedia("(max-width: 1100px)").matches);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 1100px)");
    const onChange = () => setNarrow(query.matches);
    onChange();
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  const routeKey = `${session.route.page}/${session.route.projectId}/${session.route.section}`;
  const previousRouteKey = useRef(routeKey);
  useEffect(() => {
    if (previousRouteKey.current === routeKey) return;
    previousRouteKey.current = routeKey;
    const frame = window.requestAnimationFrame(() => {
      const main = document.getElementById("main");
      if (main && !main.contains(document.activeElement)) main.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [routeKey]);
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
  const resultsId = "find-results";
  const activeOptionId = matches[active] ? `find-result-${active}` : undefined;
  const searchChange = (value: string) => {
    setQuery(value);
    setActiveIndex(0);
    session.setFindOpen(true);
  };
  const searchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
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
  };
  return (
    <HintProvider>
      <div className="app-frame text-ink">
        <a className="skip-link" href="#main">跳到主要内容</a>
        <aside className="app-rail">
          <div className="app-brand">
            <span className="brand-mark"><BrandIcon /></span>
            <span>LightWeaver</span>
          </div>
          <Popover.Root open={session.findOpen} onOpenChange={session.setFindOpen}>
            {narrow ? (
              <Popover.Anchor asChild>
                <button
                  type="button"
                  className="nav-item"
                  aria-label="查找项目"
                  title="查找项目"
                  onClick={() => {
                    setQuery("");
                    setActiveIndex(0);
                    session.setFindOpen(true);
                  }}
                >
                  <SearchIcon />
                  <span className="nav-item-label">查找项目</span>
                </button>
              </Popover.Anchor>
            ) : (
              <Popover.Anchor asChild>
                <div className="project-search">
                  <span className="project-search-icon"><SearchIcon /></span>
                  <SearchInput
                    label="查找项目"
                    placeholder="查找项目"
                    className="search-field"
                    data-lw-find=""
                    role="combobox"
                    aria-expanded={session.findOpen}
                    aria-controls={resultsId}
                    aria-autocomplete="list"
                    aria-activedescendant={activeOptionId}
                    value={query}
                    onFocus={() => session.setFindOpen(true)}
                    onChange={searchChange}
                    onClear={() => {
                      setQuery("");
                      setActiveIndex(0);
                    }}
                    onKeyDown={searchKeyDown}
                  />
                  {!query && <kbd className="project-search-shortcut">{navigator.platform.includes("Mac") ? "⌘F" : "Ctrl+F"}</kbd>}
                </div>
              </Popover.Anchor>
            )}
            <Popover.Portal>
              <Popover.Content
                className={narrow ? "search-popover search-popover-narrow z-50" : "search-popover z-50"}
                align="start"
                sideOffset={6}
                onOpenAutoFocus={narrow ? undefined : (event) => event.preventDefault()}
              >
                {narrow && (
                  <div className="search-popover-input">
                    <SearchInput
                      label="查找项目"
                      placeholder="查找项目"
                      role="combobox"
                      aria-expanded={session.findOpen}
                      aria-controls={resultsId}
                      aria-autocomplete="list"
                      aria-activedescendant={activeOptionId}
                      value={query}
                      autoFocus
                      onChange={searchChange}
                      onClear={() => {
                        setQuery("");
                        setActiveIndex(0);
                      }}
                      onKeyDown={searchKeyDown}
                    />
                  </div>
                )}
                <div id={resultsId} role="listbox" aria-label="项目查找结果">
                  {matches.map((project, index) => (
                    <button
                      key={project.projectId}
                      id={`find-result-${index}`}
                      type="button"
                      role="option"
                      aria-selected={index === active}
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
                  {matches.length === 0 && (
                    <p className="hint m-0 px-2 py-3 text-center text-xs">
                      {query ? `没有匹配「${query}」的项目，试试片名或项目 ID。` : "还没有可查找的项目。"}
                    </p>
                  )}
                </div>
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
                        aria-label={label}
                        title={label}
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
                          className={`nav-item nav-item-pinned mt-1 h-8 pl-8 text-xs ${pinnedProject.active ? "is-on" : ""}`}
                          title={pinnedProject.title}
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
          <Segmented
            className="theme-switch"
            mode="toggle"
            label="界面主题"
            value={session.client.theme}
            onChange={(value) => {
              if (value === "system" || value === "light" || value === "dark") session.client.setTheme(value);
            }}
            options={[
              { value: "light", label: <SunIcon />, ariaLabel: "浅色", title: "浅色" },
              { value: "system", label: <SystemIcon />, ariaLabel: "跟随系统", title: "跟随系统" },
              { value: "dark", label: <MoonIcon />, ariaLabel: "深色", title: "深色" },
            ]}
          />
        </aside>
        <div className="app-stage">
          <div className="app-sheet">{children}</div>
        </div>
        <ToastStack items={session.toasts} onDismiss={session.dismissToast} />
        <ConfirmDialog
          open={session.leaveOpen}
          title="有未保存的修改"
          description="保存会写入新的项目修订；保留草稿可在下次打开时恢复；放弃会删除本地草稿与草稿备份。"
          confirmLabel="保存并离开"
          onConfirm={() => session.answerLeave("save")}
          secondary={{ label: "保留草稿", onClick: () => session.answerLeave("keep") }}
          onClose={() => session.answerLeave("cancel")}
          extra={
            <div className="mt-3 flex justify-end">
              <Button variant="danger" onClick={() => session.answerLeave("discard")}>放弃修改</Button>
            </div>
          }
        />
        <ConfirmDialog
          open={session.jobsOpen}
          title="还有未结束的作业"
          description="退出会停止进行中的作业；留在应用可继续执行。"
          tone="danger"
          confirmLabel="停止作业并退出"
          cancelLabel="留在应用"
          onConfirm={() => session.answerJobs(true)}
          onClose={() => session.answerJobs(false)}
        />
      </div>
    </HintProvider>
  );
}
