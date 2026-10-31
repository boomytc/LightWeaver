import { ProjectRevision } from "@lightweaver/weaver/contracts";
import { api, requestId } from "../api";
import { desktop } from "../desktop";
import { useSession } from "../session/context";
import { CreateProject } from "./CreateProject";
import { PageHeader } from "../ui/PageHeader";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Dropzone } from "../ui/Dropzone";
import { FolderIcon, ProjectIcon } from "../ui/Icons";

export function ProjectHome() {
  const session = useSession();
  const acceptImport = async (project: ProjectRevision) => {
    await session.refreshLists();
    await session.navigate("projects", project.projectId);
    session.setNotice("项目包已导入为独立项目，原项目保持不变");
  };
  const importPath = (kind: "file" | "directory") => session.act(async () => {
    const bridge = desktop();
    const file = kind === "directory" ? await bridge?.pickDirectory?.() : await bridge?.pickModelFile?.();
    if (!file) return;
    const project = await api("/projects/import-bundle", ProjectRevision, {
      method: "POST",
      body: { file, requestId: requestId() },
    });
    await acceptImport(project);
  });
  const importFiles = (files: File[]) => {
    const file = files[0];
    if (!file) return;
    void session.act(async () => {
      const body = new FormData();
      body.append("file", file);
      body.append("requestId", requestId());
      await acceptImport(await api("/projects/import-bundle/upload", ProjectRevision, { method: "POST", body }));
    });
  };
  const recent = new Set(session.client.recentProjectIds);
  const ordered = [...session.projects].sort((left, right) => {
    const leftRecent = recent.has(left.projectId) ? session.client.recentProjectIds.indexOf(left.projectId) : 99;
    const rightRecent = recent.has(right.projectId) ? session.client.recentProjectIds.indexOf(right.projectId) : 99;
    return leftRecent - rightRecent;
  });
  return (
    <main className="flex min-h-0 flex-1 flex-col">
      <PageHeader title="项目" description="继续最近的创作，或从草稿与项目包开始一部新片。" />
      <div className="scroll-region page-scroll">
        <div className="page-content grid items-start gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(340px,0.7fr)]">
          <section aria-labelledby="project-list-title">
            <div className="section-title mb-3">
              <div>
                <h2 id="project-list-title" className="m-0">最近与全部项目</h2>
                <Badge>{ordered.length}</Badge>
              </div>
            </div>
            <div className="flex flex-col gap-2">
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
              {ordered.length === 0 && (
                <div className="subtle-card flex flex-col items-center px-6 py-12 text-center">
                  <span className="dropzone-icon mb-3 size-12"><ProjectIcon /></span>
                  <b>还没有项目</b>
                  <p className="hint mb-0 mt-1 text-xs">从右侧创建草稿，或打开已有的 LightWeaver 项目包。</p>
                </div>
              )}
            </div>
          </section>
          <div className="flex flex-col gap-4">
            <CreateProject
              onCreated={async (project) => {
                await session.refreshLists();
                await session.navigate("projects", project.projectId);
              }}
              fail={(reason) => session.setError(reason instanceof Error ? reason.message : String(reason))}
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
      </div>
    </main>
  );
}
