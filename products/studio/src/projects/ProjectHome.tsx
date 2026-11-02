import { useEffect, useRef } from "react";
import { ProjectRevision } from "@lightweaver/weaver/contracts";
import { api, ApiError, requestId } from "../api";
import { desktop } from "../desktop";
import { useSession } from "../session/context";
import { CreateProject } from "./CreateProject";
import { PageFrame } from "../ui/PageFrame";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Dropzone } from "../ui/Dropzone";
import { ListSkeleton } from "../ui/Skeleton";
import { FolderIcon, ProjectIcon } from "../ui/Icons";

export function ProjectHome() {
  const session = useSession();
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const retry = useRef<{ key: string; requestId: string } | null>(null);
  const importBundle = async (source: { kind: "path"; file: string } | { kind: "upload"; file: File }) => {
    const key = source.kind === "path" ? `path:${source.file}`
      : JSON.stringify([source.file.name, source.file.size, source.file.lastModified]);
    const imported = await session.act(async () => {
      let attempt = retry.current?.key === key ? retry.current : { key, requestId: requestId() };
      retry.current = attempt;
      const submit = () => {
        if (source.kind === "path")
          return api("/projects/import-bundle", ProjectRevision, {
            method: "POST", body: { file: source.file, requestId: attempt.requestId },
          });
        const body = new FormData();
        body.append("file", source.file);
        body.append("requestId", attempt.requestId);
        return api("/projects/import-bundle/upload", ProjectRevision, { method: "POST", body });
      };
      let project: ProjectRevision;
      try { project = await submit(); }
      catch (reason) {
        if (!(reason instanceof ApiError) || reason.protocol.code !== "REQUEST_ID_REUSED") throw reason;
        attempt = { key, requestId: requestId() };
        retry.current = attempt;
        project = await submit();
      }
      return { project, attempt };
    });
    if (!imported || !mounted.current) return;
    const { project, attempt } = imported;
    try {
      await session.refreshLists();
      if (!mounted.current) return;
      await session.navigate("projects", project.projectId);
      session.setNotice("项目包已导入为独立项目，原项目保持不变");
      if (retry.current === attempt) retry.current = null;
    } catch (reason) {
      if (mounted.current) session.setError(reason instanceof Error ? reason.message : String(reason));
    }
  };
  const importPath = async (kind: "file" | "directory") => {
    const file = await session.act(async () => {
      const bridge = desktop();
      return kind === "directory" ? bridge?.pickDirectory?.() : bridge?.pickModelFile?.();
    });
    if (file) await importBundle({ kind: "path", file });
  };
  const importFiles = async (files: File[]) => {
    if (files[0]) await importBundle({ kind: "upload", file: files[0] });
  };
  const recent = new Set(session.client.recentProjectIds);
  const ordered = [...session.projects].sort((left, right) => {
    const leftRecent = recent.has(left.projectId) ? session.client.recentProjectIds.indexOf(left.projectId) : 99;
    const rightRecent = recent.has(right.projectId) ? session.client.recentProjectIds.indexOf(right.projectId) : 99;
    return leftRecent - rightRecent;
  });
  return (
    <PageFrame title="项目" description="继续最近的创作，或从草稿与项目包开始一部新片。">
      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(340px,0.7fr)]">
          <section className="panel-card p-5 xl:col-span-2" aria-labelledby="start-project-title">
            <div className="section-title mb-3">
              <div>
                <h2 id="start-project-title" className="m-0">从想做到看到成片</h2>
                <small>新项目可以按这个顺序开始。已有项目可以直接从列表继续。</small>
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="subtle-card p-4">
                <Badge tone="accent">1 · 建立项目</Badge>
                <b className="mt-2 block">选择空白草稿或示例</b>
                <p className="hint mb-0 mt-1 text-xs">片名和工作流只描述创作意图，之后仍可自由搭配卡片、静帧和视频。</p>
              </div>
              <div className="subtle-card p-4">
                <Badge tone="accent">2 · 编排内容</Badge>
                <b className="mt-2 block">添加画面、旁白或原声</b>
                <p className="hint mb-0 mt-1 text-xs">卡片不需要素材；静帧和视频会直接提示去对应素材区导入。</p>
              </div>
              <div className="subtle-card p-4">
                <Badge tone="accent">3 · 制作交付</Badge>
                <b className="mt-2 block">保存并制作</b>
                <p className="hint mb-0 mt-1 text-xs">制作完成后从固定横幅进入交付，失败原因和建议会留在任务面板。</p>
              </div>
            </div>
          </section>
          <section aria-labelledby="project-list-title">
            <div className="section-title mb-3">
              <div>
                <h2 id="project-list-title" className="m-0">最近与全部项目</h2>
                <Badge>{ordered.length}</Badge>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              {session.listsStatus === "loading" && <ListSkeleton rows={3} />}
              {ordered.map((project) => {
                const draft = session.client.drafts.find((item) => item.projectId === project.projectId);
                return (
                  <button
                    key={project.projectId}
                    type="button"
                    className="row-item surface-card p-4"
                    onClick={() => void session.navigate("projects", project.projectId)}
                  >
                    <span className="dropzone-icon size-10"><ProjectIcon /></span>
                    <span className="row-item-copy">
                      <span className="flex items-center gap-2">
                        <b className="truncate">{project.document.title || "未命名项目"}</b>
                        {recent.has(project.projectId) && <Badge tone="accent">最近打开</Badge>}
                        {draft && <Badge tone="warn" dot>可恢复草稿</Badge>}
                      </span>
                      <small className="numeric mt-1">{project.projectId} · rev {project.id.slice(0, 10)}</small>
                      <small className="mt-1">
                        {project.document.locales.join(" / ") || "未设置语言"} · {project.document.profiles.map((profile) => profile.id).join(" / ") || "未设置规格"}
                      </small>
                    </span>
                  </button>
                );
              })}
              {session.listsStatus === "failed" && (
                <div className="subtle-card flex flex-col gap-2 p-4">
                  <b>项目列表读取失败</b>
                  <small className="hint">{session.listsError || "无法读取项目列表，请重试。"}</small>
                  <div className="actions">
                    <Button size="sm" onClick={() => void session.refreshLists().catch(() => {})}>重试</Button>
                  </div>
                </div>
              )}
              {session.listsStatus === "ready" && ordered.length === 0 && (
                <div className="subtle-card flex flex-col items-center px-6 py-12 text-center">
                  <span className="dropzone-icon mb-3 size-12"><ProjectIcon /></span>
                  <b>还没有项目</b>
                  <p className="hint mb-0 mt-1 text-xs">创建空白草稿或从示例开始，也可以打开已有的 LightWeaver 项目包。</p>
                </div>
              )}
            </div>
          </section>
          <div className="flex flex-col gap-4">
            <CreateProject
              onCreated={async (project) => {
                await session.refreshLists();
                if (mounted.current) await session.navigate("projects", project.projectId);
              }}
              fail={(reason) => { if (mounted.current) session.setError(reason instanceof Error ? reason.message : String(reason)); }}
            />
            <section className="panel-card p-5" aria-labelledby="import-project-title">
              <div className="mb-4">
                <h2 id="import-project-title" className="m-0">打开已有项目包</h2>
                <p className="hint mb-0 mt-1 text-xs">导入 bundle ZIP 或完整目录，创建独立项目并校验媒体摘要。</p>
              </div>
              <Dropzone
                inputAriaLabel="导入项目包 ZIP"
                accept=".zip"
                disabled={session.busy}
                onFiles={importFiles}
                title="拖入项目包 ZIP"
                description="原项目与媒体保持不变"
                browseLabel={desktop() ? "选择 ZIP" : "选择文件"}
                onBrowse={desktop() ? () => void importPath("file") : undefined}
              />
              {desktop() && (
                <Button className="mt-3 w-full" disabled={session.busy} onClick={() => void importPath("directory")}>
                  <FolderIcon />选择项目包目录
                </Button>
              )}
            </section>
          </div>
        </div>
    </PageFrame>
  );
}
