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
  command: "command",
  prepareQuit: "prepare-quit",
} as const;
