export type ThemePreference = "system" | "light" | "dark";

export type LayoutPreference = {
  left: number;
  right: number;
  bottom: number;
  collapsed: { left: boolean; right: boolean; bottom: boolean };
};

export type DesktopPreferences = {
  theme: ThemePreference;
  layout?: LayoutPreference;
  dataDir?: string;
  configFile?: string;
  configBase?: string;
  modelDir?: string;
  window?: { x: number; y: number; width: number; height: number };
};

export type QuitDecision = {
  action: "quit" | "cancel";
  stopJobs: boolean;
};

export type QuitIntent = "confirm-jobs" | "stop-jobs";

export type RecoveryDraft = {
  projectId: string;
  base: string;
  document?: unknown;
  creativePlanDraft?: unknown;
  updatedAt: string;
};

export type RecoveryFlushResult =
  | { ok: true }
  | { ok: false; message: string };

export type CommandName = "save" | "import" | "settings" | "find";

export const ipcChannels = {
  pickMedia: "pick-media",
  pickModelFile: "pick-model-file",
  pickDirectory: "pick-directory",
  pickExportFile: "pick-export-file",
  reveal: "reveal",
  openExternal: "open-external",
  getPreferences: "get-preferences",
  setPreferences: "set-preferences",
  restartRuntime: "restart-runtime",
  quitResponse: "quit-response",
  retryService: "retry-service",
  openLogs: "open-logs",
  getRecoveryDrafts: "get-recovery-drafts",
  saveRecoveryDraft: "save-recovery-draft",
  clearRecoveryDraft: "clear-recovery-draft",
  command: "command",
  prepareQuit: "prepare-quit",
  cancelQuit: "cancel-quit",
  prepareRecoveryFlush: "prepare-recovery-flush",
  recoveryFlushResult: "recovery-flush-result",
} as const;
