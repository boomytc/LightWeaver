import { contextBridge, ipcRenderer, webUtils } from "electron";
import { ipcChannels, type CommandName, type DesktopPreferences, type QuitDecision } from "./protocol";

contextBridge.exposeInMainWorld("lightweaver", {
  pickMedia: () => ipcRenderer.invoke(ipcChannels.pickMedia) as Promise<string[]>,
  pickModelFile: () => ipcRenderer.invoke(ipcChannels.pickModelFile) as Promise<string | null>,
  pickDirectory: () => ipcRenderer.invoke(ipcChannels.pickDirectory) as Promise<string | null>,
  pickExportFile: (suggestedName: string) =>
    ipcRenderer.invoke(ipcChannels.pickExportFile, suggestedName) as Promise<string | null>,
  reveal: (file: string) => ipcRenderer.invoke(ipcChannels.reveal, file) as Promise<void>,
  openExternal: (url: string) => ipcRenderer.invoke(ipcChannels.openExternal, url) as Promise<void>,
  pathForFile: (file: File) => webUtils.getPathForFile(file),
  getPreferences: () => ipcRenderer.invoke(ipcChannels.getPreferences) as Promise<DesktopPreferences>,
  setPreferences: (patch: Partial<DesktopPreferences>) =>
    ipcRenderer.invoke(ipcChannels.setPreferences, patch) as Promise<DesktopPreferences>,
  restartRuntime: () => ipcRenderer.invoke(ipcChannels.restartRuntime) as Promise<void>,
  retry: () => ipcRenderer.invoke(ipcChannels.retryService) as Promise<void>,
  openLogs: () => ipcRenderer.invoke(ipcChannels.openLogs) as Promise<void>,
  themeSync: () => ipcRenderer.sendSync("theme-sync") as DesktopPreferences["theme"],
  onCommand: (handler: (command: CommandName) => void) => {
    const listener = (_event: unknown, command: CommandName) => handler(command);
    ipcRenderer.on(ipcChannels.command, listener);
    return () => ipcRenderer.removeListener(ipcChannels.command, listener);
  },
  onPrepareQuit: (handler: () => Promise<QuitDecision> | QuitDecision) => {
    const listener = async () => {
      const decision = await handler();
      ipcRenderer.send(ipcChannels.quitResponse, decision);
    };
    ipcRenderer.on(ipcChannels.prepareQuit, listener);
    return () => ipcRenderer.removeListener(ipcChannels.prepareQuit, listener);
  },
});
