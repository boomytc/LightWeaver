import { LibraryPanel } from "./library/LibraryPanel";
import { JobsPage } from "./jobs/JobsPage";
import { ProjectHome } from "./projects/ProjectHome";
import { SessionProvider } from "./session/context";
import { useProjectSession } from "./session/useProjectSession";
import { useClientState } from "./client/state";
import { AppShell } from "./shell/AppShell";
import { SettingsPage } from "./settings/SettingsPage";
import { ProjectWorkspace } from "./workspace/ProjectWorkspace";

export function App() {
  const client = useClientState();
  const session = useProjectSession(client);
  const kind = session.route.page === "voices" ? "voice" : session.route.page === "methods" ? "method" : "material";
  return (
    <SessionProvider value={session}>
      <AppShell>
        {session.route.page === "projects" && !session.route.projectId && <ProjectHome />}
        {session.route.page === "projects" && session.route.projectId && <ProjectWorkspace />}
        {(session.route.page === "methods" || session.route.page === "voices" || session.route.page === "library") && (
          <LibraryPanel
            key={session.route.page}
            kind={kind}
            library={session.library}
            providers={session.providers}
            refresh={session.refreshLists}
            fail={(reason) => session.setError(reason instanceof Error ? reason.message : String(reason))}
          />
        )}
        {session.route.page === "jobs" && <JobsPage />}
        {session.route.page === "settings" && <SettingsPage />}
      </AppShell>
    </SessionProvider>
  );
}
