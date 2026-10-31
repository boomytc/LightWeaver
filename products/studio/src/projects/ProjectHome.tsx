import { CreateProject } from "./CreateProject";
import { useSession } from "../session/context";

export function ProjectHome() {
  const session = useSession();
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
