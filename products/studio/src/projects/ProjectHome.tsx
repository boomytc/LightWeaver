import { CreateProject } from "./CreateProject";
import { useSession } from "../session/context";
import { ProjectRevision } from "@lightweaver/weaver/contracts";
import { api, requestId } from "../api";
import { desktop } from "../desktop";

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
      method: "POST", body: { file, requestId: requestId() },
    });
    await acceptImport(project);
  });
  const recent = new Set(session.client.recentProjectIds);
  const ordered = [...session.projects].sort((left, right) => {
    const leftRecent = recent.has(left.projectId) ? session.client.recentProjectIds.indexOf(left.projectId) : 99;
    const rightRecent = recent.has(right.projectId) ? session.client.recentProjectIds.indexOf(right.projectId) : 99;
    return leftRecent - rightRecent;
  });
  return (
    <div className="grid min-h-0 flex-1 grid-cols-[300px_minmax(0,1fr)]">
      <aside className="overflow-auto border-r border-line p-4">
        <h2 className="m-0 mb-3 text-sm font-medium text-muted">最近项目</h2>
        {ordered.map((project) => (
          <button
            key={project.projectId}
            type="button"
            className="row-item my-1 w-full px-3 py-3 text-left"
            onClick={() => void session.navigate("projects", project.projectId)}
          >
            <b className="block">{project.document.title || "未命名项目"}</b>
            <small className="text-muted">{project.projectId}</small>
          </button>
        ))}
        {ordered.length === 0 && <p className="hint">还没有项目。</p>}
      </aside>
      <section className="overflow-auto p-8">
        <section aria-label="导入项目" className="mx-auto max-w-xl">
          <h2>打开已有项目包</h2>
          <p className="hint">导入 LightWeaver bundle ZIP 或完整目录，创建独立项目并校验媒体摘要。</p>
          {desktop() ? (
            <div className="actions">
              <button disabled={session.busy} onClick={() => void importPath("file")}>选择项目包 ZIP</button>
              <button disabled={session.busy} onClick={() => void importPath("directory")}>选择项目包目录</button>
            </div>
          ) : (
            <input type="file" accept=".zip" aria-label="导入项目包 ZIP" disabled={session.busy} onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              void session.act(async () => {
                const body = new FormData();
                body.append("file", file);
                body.append("requestId", requestId());
                await acceptImport(await api("/projects/import-bundle/upload", ProjectRevision, { method: "POST", body }));
              });
            }} />
          )}
        </section>
        <CreateProject
          onCreated={async (project) => {
            await session.refreshLists();
            await session.navigate("projects", project.projectId);
          }}
          fail={(reason) => session.setError(reason instanceof Error ? reason.message : String(reason))}
        />
      </section>
    </div>
  );
}
