import { useEffect, useRef, useState } from "react";
import { z } from "@lightweaver/weaver/contracts";
import { api } from "../api";
import { applyTheme, desktop, type LayoutPreference, type ThemePreference } from "../desktop";

const Layout = z.object({
  left: z.number().int().min(160).max(640),
  right: z.number().int().min(220).max(640),
  bottom: z.number().int().min(120).max(480),
  collapsed: z.object({
    left: z.boolean(),
    right: z.boolean(),
    bottom: z.boolean(),
  }),
});

export const DraftBackup = z.object({
  projectId: z.string().min(1),
  base: z.string().min(1),
  document: z.unknown().optional(),
  creativePlanDraft: z.unknown().optional(),
  updatedAt: z.string(),
});
export type DraftBackup = z.infer<typeof DraftBackup>;

export const ClientState = z.object({
  revision: z.string(),
  theme: z.enum(["system", "light", "dark"]),
  recentProjectIds: z.array(z.string()),
  layout: Layout,
  drafts: z.array(DraftBackup),
});
export type ClientState = z.infer<typeof ClientState>;

const fallbackLayout: LayoutPreference = {
  left: 280,
  right: 320,
  bottom: 200,
  collapsed: { left: false, right: false, bottom: false },
};

function fallbackState(): ClientState {
  return {
    revision: "",
    theme: "system",
    recentProjectIds: [],
    layout: fallbackLayout,
    drafts: [],
  };
}

type Desired = Omit<ClientState, "revision">;

export function useClientState() {
  const [state, setState] = useState<ClientState>(fallbackState);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const desired = useRef<Desired>(fallbackState());
  const revision = useRef("");
  const chain = useRef<Promise<void>>(Promise.resolve());

  const publish = (next: ClientState) => {
    revision.current = next.revision;
    desired.current = {
      theme: next.theme,
      recentProjectIds: next.recentProjectIds,
      layout: next.layout,
      drafts: next.drafts,
    };
    setState(next);
    applyTheme(next.theme);
  };

  const flush = () => {
    const run = chain.current.then(async () => {
      let guard = 0;
      while (guard < 3) {
        guard += 1;
        const sent = {
          theme: desired.current.theme,
          recentProjectIds: desired.current.recentProjectIds,
          layout: desired.current.layout,
          drafts: desired.current.drafts,
        };
        try {
          const next = await api("/client/state", ClientState, {
            method: "PUT",
            body: { expectedRevision: revision.current, ...sent },
          });
          const changed =
            desired.current.theme !== sent.theme ||
            desired.current.recentProjectIds !== sent.recentProjectIds ||
            desired.current.layout !== sent.layout ||
            desired.current.drafts !== sent.drafts;
          revision.current = next.revision;
          if (!changed) {
            publish(next);
            return;
          }
        } catch (reason) {
          const message = reason instanceof Error ? reason.message : String(reason);
          if (!message.includes("客户端状态") || guard >= 3) {
            setError(message);
            return;
          }
          const fresh = await api("/client/state", ClientState);
          revision.current = fresh.revision;
        }
      }
    });
    chain.current = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };

  const update = (patch: Partial<Desired>) => {
    desired.current = { ...desired.current, ...patch };
    setState((current) => ({ ...current, ...patch }));
    if (patch.theme) applyTheme(patch.theme);
    const bridge = desktop();
    if (bridge?.setPreferences && (patch.theme || patch.layout)) {
      void bridge
        .setPreferences({
          ...(patch.theme ? { theme: patch.theme } : {}),
          ...(patch.layout ? { layout: patch.layout } : {}),
        })
        .catch((reason) => setError(reason instanceof Error ? reason.message : String(reason)));
    }
    return flush();
  };

  useEffect(() => {
    const controller = new AbortController();
    api("/client/state", ClientState, { signal: controller.signal })
      .then((next) => {
        publish(next);
        setReady(true);
        try {
          const legacy = localStorage.getItem("lightweaver-draft-backup");
          if (!legacy || next.drafts.length > 0) return;
          const parsed = DraftBackup.parse(JSON.parse(legacy));
          desired.current = { ...desired.current, drafts: [parsed] };
          setState((current) => ({ ...current, drafts: [parsed] }));
          void flush().then(() => localStorage.removeItem("lightweaver-draft-backup"));
        } catch {
          setError("浏览器里有一份旧草稿备份，但无法迁入客户端状态");
        }
      })
      .catch((reason) => {
        if (!controller.signal.aborted)
          setError(reason instanceof Error ? reason.message : String(reason));
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (state.theme !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => applyTheme("system");
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, [state.theme]);

  return {
    ready,
    error,
    clearError: () => setError(""),
    theme: state.theme,
    layout: state.layout,
    recentProjectIds: state.recentProjectIds,
    drafts: state.drafts,
    setTheme: (theme: ThemePreference) => update({ theme }),
    setLayout: (layout: LayoutPreference) => update({ layout: Layout.parse(layout) }),
    rememberProject: (projectId: string) => {
      const recentProjectIds = [
        projectId,
        ...desired.current.recentProjectIds.filter((id) => id !== projectId),
      ].slice(0, 12);
      return update({ recentProjectIds });
    },
    upsertDraft: (draft: DraftBackup) => {
      const drafts = [
        DraftBackup.parse(draft),
        ...desired.current.drafts.filter((item) => item.projectId !== draft.projectId),
      ];
      return update({ drafts });
    },
    clearProjectDraft: (projectId: string) =>
      update({ drafts: desired.current.drafts.filter((item) => item.projectId !== projectId) }),
    keepalive: () => {
      if (!revision.current) return;
      void fetch("/api/client/state", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedRevision: revision.current,
          theme: desired.current.theme,
          recentProjectIds: desired.current.recentProjectIds,
          layout: desired.current.layout,
          drafts: desired.current.drafts,
        }),
        keepalive: true,
      });
    },
  };
}

export type ClientStore = ReturnType<typeof useClientState>;
