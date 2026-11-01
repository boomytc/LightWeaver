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

export type StudioCommand = "save" | "import" | "settings" | "find";

export type DesktopBridge = {
  pickMedia?: () => Promise<string[]>;
  pickModelFile?: () => Promise<string | null>;
  pickDirectory?: () => Promise<string | null>;
  pickExportFile?: (suggestedName: string) => Promise<string | null>;
  reveal?: (file: string) => Promise<void>;
  openExternal?: (url: string) => Promise<void>;
  pathForFile?: (file: File) => string;
  getPreferences?: () => Promise<DesktopPreferences>;
  setPreferences?: (patch: Partial<DesktopPreferences>) => Promise<DesktopPreferences>;
  onCommand?: (handler: (command: StudioCommand) => void) => () => void;
  onPrepareQuit?: (
    handler: (intent: QuitIntent) => Promise<QuitDecision>,
    cancel: () => void,
  ) => () => void;
  onPrepareRecoveryFlush?: (handler: () => Promise<void>) => () => void;
  themeSync?: () => ThemePreference;
  restartRuntime?: () => Promise<void>;
  retry?: () => Promise<void>;
  openLogs?: () => Promise<void>;
  getRecoveryDrafts?: () => Promise<RecoveryDraft[]>;
  saveRecoveryDraft?: (draft: RecoveryDraft) => Promise<void>;
  clearRecoveryDraft?: (input: {
    projectId: string;
    throughUpdatedAt: string;
  }) => Promise<void>;
};

declare global {
  interface Window {
    lightweaver?: DesktopBridge;
  }
}

export function desktop(): DesktopBridge | null {
  const value = window.lightweaver;
  if (!value || typeof value !== "object") return null;
  return value;
}

export function pathForFile(file: File): string | null {
  const bridge = desktop();
  if (!bridge?.pathForFile) return null;
  try {
    const value = bridge.pathForFile(file);
    return value ? value : null;
  } catch {
    return null;
  }
}

export async function openLink(url: string) {
  const bridge = desktop();
  if (bridge?.openExternal) {
    await bridge.openExternal(url);
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

export function resolvedTheme(preference: ThemePreference): "light" | "dark" {
  if (preference === "system")
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  return preference;
}

export function applyTheme(preference: ThemePreference) {
  const theme = resolvedTheme(preference);
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}
