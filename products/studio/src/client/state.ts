import { useEffect, useRef, useState } from "react";
import { z } from "@lightweaver/weaver/contracts";
import { api, ApiError } from "../api";
import {
  applyTheme,
  desktop,
  type LayoutPreference,
  type RecoveryDraft,
  type ThemePreference,
} from "../desktop";
import {
  applyClientOperations,
  compareUpdatedAt,
  mergeClientDrafts,
  type ClientBody,
  type ClientOperation,
} from "./stateOperations";

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

function bodyOf(state: ClientState): ClientBody {
  return {
    theme: state.theme,
    recentProjectIds: state.recentProjectIds,
    layout: state.layout,
    drafts: state.drafts,
  };
}

export function useClientState() {
  const [state, setState] = useState<ClientState>(fallbackState);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const visible = useRef<ClientState>(fallbackState());
  const acknowledged = useRef<ClientBody | null>(null);
  const revision = useRef("");
  const pending = useRef<ClientOperation[]>([]);
  const hydrated = useRef(false);
  const chain = useRef<Promise<void>>(Promise.resolve());
  const legacyMigration = useRef(false);

  const reportError = (reason: unknown) => {
    setError(reason instanceof Error ? reason.message : String(reason));
  };

  const renderVisible = () => {
    const base = acknowledged.current || bodyOf(visible.current);
    const body = applyClientOperations(base, pending.current.filter((operation) => operation.kind !== "clear-draft"));
    const next = { ...body, revision: revision.current };
    visible.current = next;
    setState(next);
    applyTheme(next.theme);
  };

  const enqueue = (operation: ClientOperation) => {
    pending.current.push(operation);
    renderVisible();
  };

  const flush = (): Promise<boolean> => {
    const run = chain.current
      .then(async () => {
        if (!hydrated.current || !acknowledged.current) return false;
        let conflicts = 0;
        while (pending.current.length > 0) {
          const batch = pending.current.slice();
          const body = applyClientOperations(acknowledged.current, batch);
          try {
            const next = await api("/client/state", ClientState, {
              method: "PUT",
              body: { expectedRevision: revision.current, ...body },
            });
            acknowledged.current = bodyOf(next);
            revision.current = next.revision;
            pending.current = pending.current.slice(batch.length);
            renderVisible();
            if (legacyMigration.current && typeof localStorage !== "undefined") {
              localStorage.removeItem("lightweaver-draft-backup");
              legacyMigration.current = false;
            }
            conflicts = 0;
          } catch (reason) {
            const code = reason instanceof ApiError ? reason.protocol.code : "";
            if (
              code !== "CLIENT_STATE_CONFLICT" &&
              code !== "CONFIG_CONFLICT"
            ) {
              reportError(reason);
              return false;
            }
            if (conflicts >= 2) {
              reportError(new Error("客户端状态连续冲突，待保存操作已保留"));
              return false;
            }
            try {
              const details =
                reason instanceof ApiError && reason.protocol.details;
              const current =
                details && typeof details === "object" && "current" in details
                  ? ClientState.safeParse(details.current)
                  : null;
              const fresh = current?.success
                ? current.data
                : await api("/client/state", ClientState);
              acknowledged.current = bodyOf(fresh);
              revision.current = fresh.revision;
              renderVisible();
              conflicts += 1;
            } catch (refreshError) {
              reportError(refreshError);
              return false;
            }
          }
        }
        return true;
      })
      .catch((reason) => {
        reportError(reason);
        return false;
      });
    chain.current = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };

  const update = (operation: ClientOperation) => {
    enqueue(operation);
    if (operation.kind === "theme") applyTheme(operation.value);
    const bridge = desktop();
    if (
      bridge?.setPreferences &&
      (operation.kind === "theme" || operation.kind === "layout")
    ) {
      void bridge
        .setPreferences(
          operation.kind === "theme"
            ? { theme: operation.value }
            : { layout: operation.value },
        )
        .catch(reportError);
    }
    return flush();
  };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const bridge = desktop();
        const nativePromise: Promise<RecoveryDraft[]> = bridge?.getRecoveryDrafts
          ? bridge.getRecoveryDrafts().catch((reason) => {
              if (!cancelled) reportError(reason);
              return [];
            })
          : Promise.resolve([]);
        const [server, rawNative] = await Promise.all([
          api("/client/state", ClientState),
          nativePromise,
        ]);
        if (cancelled) return;
        let native: DraftBackup[] = [];
        try {
          native = z.array(DraftBackup).parse(rawNative);
        } catch (reason) {
          reportError(reason);
        }
        acknowledged.current = bodyOf(server);
        revision.current = server.revision;
        hydrated.current = true;

        for (const draft of native) {
          const existing = server.drafts.find((item) => item.projectId === draft.projectId);
          if (!existing || compareUpdatedAt(draft.updatedAt, existing.updatedAt) > 0)
            pending.current.push({ kind: "upsert-draft", draft });
        }
        renderVisible();
        setReady(true);

        try {
          const legacy = localStorage.getItem("lightweaver-draft-backup");
          if (legacy) {
            const parsed = DraftBackup.parse(JSON.parse(legacy));
            const existing = mergeClientDrafts(server.drafts, native).find(
              (item) => item.projectId === parsed.projectId,
            );
            if (!existing || compareUpdatedAt(parsed.updatedAt, existing.updatedAt) > 0) {
              legacyMigration.current = true;
              pending.current.push({ kind: "upsert-draft", draft: parsed });
              renderVisible();
            }
          }
        } catch {
          setError("浏览器里有一份旧草稿备份，但无法迁入客户端状态");
        }
        await flush();
      } catch (reason) {
        if (!cancelled) reportError(reason);
      }
    })();
    return () => {
      cancelled = true;
    };
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
    setTheme: (theme: ThemePreference) => update({ kind: "theme", value: theme }),
    setLayout: (layout: LayoutPreference) =>
      update({ kind: "layout", value: Layout.parse(layout) }),
    rememberProject: (projectId: string) =>
      update({ kind: "remember-project", projectId }),
    upsertDraft: (draft: DraftBackup) =>
      update({ kind: "upsert-draft", draft: DraftBackup.parse(draft) }),
    clearProjectDraft: (projectId: string, throughUpdatedAt?: string) =>
      update({ kind: "clear-draft", projectId, throughUpdatedAt }),
    keepalive: () => {
      if (!hydrated.current || !acknowledged.current) return;
      const body = applyClientOperations(acknowledged.current, pending.current);
      void fetch("/api/client/state", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedRevision: revision.current,
          ...body,
        }),
        keepalive: true,
      });
    },
  };
}

export type ClientStore = ReturnType<typeof useClientState>;
