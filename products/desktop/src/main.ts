import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  screen,
  session,
  shell,
  type IpcMainEvent,
  type IpcMainInvokeEvent,
} from "electron";
import { readPreferences, writePreferences } from "./preferences";
import { ipcChannels, type CommandName, type DesktopPreferences, type QuitDecision } from "./protocol";
import { ServiceHost, type ServiceReady } from "./service-host";

const dev = process.env.LIGHTWEAVER_DESKTOP_DEV === "1" && !app.isPackaged;
const repoRoot = path.resolve(__dirname, "../../..");
let mainWindow: BrowserWindow | null = null;
let service: ServiceReady | null = null;
let host: ServiceHost | null = null;
let quitting = false;
let quitConfirmed = false;
let quitWait: ((decision: QuitDecision) => void) | null = null;
const allowedReveal = new Set<string>();
let unexpectedExit = false;
let suppressExit = false;
let credentialInstalled = false;
let quitInProgress = false;

function userDataDir(): string {
  if (process.env.LIGHTWEAVER_USER_DATA)
    return path.resolve(process.env.LIGHTWEAVER_USER_DATA);
  const name = dev ? "LightWeaver Dev" : "LightWeaver";
  return path.join(app.getPath("appData"), name);
}

function preferences(): DesktopPreferences {
  return readPreferences(userDataDir());
}

function runtimePaths(prefs: DesktopPreferences) {
  const dataDir = path.resolve(prefs.dataDir || path.join(userDataDir(), "weaver"));
  const resourcesDir = dev
    ? repoRoot
    : path.join(process.resourcesPath, "lightweaver", "resources");
  const configFile = path.resolve(prefs.configFile || path.join(userDataDir(), "config.local.yaml"));
  const configBase = path.resolve(prefs.configBase || path.dirname(configFile));
  const bundled = path.join(process.resourcesPath, "lightweaver");
  return {
    mode: dev ? "development" : "production",
    resourcesDir,
    configFile,
    configBase,
    dataDir,
    modelDir: path.resolve(prefs.modelDir || path.join(dataDir, "models")),
    tempDir: path.join(dataDir, "tmp"),
    logDir: path.join(dataDir, "logs"),
    tools: dev
      ? {
          node: process.env.LIGHTWEAVER_NODE || "node",
          ffmpeg: "",
          ffprobe: "",
          supervisor: path.join(repoRoot, "weaver", "scripts", "process-supervisor.mjs"),
          cardRenderer: path.join(repoRoot, "node_modules", ".bin", "weaver-card"),
          cardBrowser: "",
          cardSite: "",
          python: "",
        }
      : {
          node: path.join(bundled, "node", "bin", process.platform === "win32" ? "node.exe" : "node"),
          ffmpeg: path.join(bundled, "tools", process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg"),
          ffprobe: path.join(bundled, "tools", process.platform === "win32" ? "ffprobe.exe" : "ffprobe"),
          supervisor: path.join(resourcesDir, "weaver", "scripts", "process-supervisor.mjs"),
          cardRenderer: path.join(bundled, "service", "render.mjs"),
          cardBrowser: path.join(
            bundled,
            "card",
            "browser",
            process.platform === "darwin" ? "chrome-headless-shell" : "chrome-headless-shell",
          ),
          cardSite: path.join(bundled, "card", "site"),
          python: process.platform === "win32" ? "" : "/usr/bin/python3",
        },
    staticDir: dev ? undefined : path.join(bundled, "ui"),
  };
}

function assertSender(event: IpcMainInvokeEvent | IpcMainEvent): void {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!mainWindow || win !== mainWindow || event.senderFrame !== event.sender.mainFrame)
    throw new Error("拒绝未授权的窗口消息");
}

function remember(file: string): void {
  if (file) allowedReveal.add(path.resolve(file));
}

function canReveal(file: string): boolean {
  const real = fs.realpathSync(file);
  const prefs = preferences();
  const paths = runtimePaths(prefs);
  const roots = [paths.dataDir, paths.modelDir, paths.logDir, userDataDir(), ...allowedReveal];
  return roots.some((root) => {
    const resolved = path.resolve(root);
    return real === resolved || real.startsWith(resolved + path.sep);
  });
}

function clampBounds(bounds: { x: number; y: number; width: number; height: number }) {
  const display = screen.getDisplayMatching(bounds) || screen.getPrimaryDisplay();
  const area = display.workArea;
  const width = Math.min(Math.max(bounds.width || 1280, 960), area.width);
  const height = Math.min(Math.max(bounds.height || 800, 640), area.height);
  const x = Math.min(Math.max(bounds.x ?? area.x, area.x), area.x + area.width - width);
  const y = Math.min(Math.max(bounds.y ?? area.y, area.y), area.y + area.height - height);
  return { x, y, width, height };
}

async function bootService(): Promise<ServiceReady> {
  const prefs = preferences();
  const paths = runtimePaths(prefs);
  const { staticDir, ...runtime } = paths;
  fs.mkdirSync(runtime.logDir, { recursive: true });
  const launchFile = path.join(runtime.logDir, "launch.json");
  fs.writeFileSync(
    launchFile,
    JSON.stringify({
      runtime,
      staticDir,
      devOrigins: dev
        ? [`http://127.0.0.1:${process.env.LIGHTWEAVER_STUDIO_PORT || 5175}`]
        : [],
    }),
  );
  host = new ServiceHost(path.join(paths.logDir, "service.log"));
  const nodePath = paths.tools.node;
  const baseEnv: NodeJS.ProcessEnv = {
    HOME: process.env.HOME,
    USERPROFILE: process.env.USERPROFILE,
    LANG: process.env.LANG || "zh_CN.UTF-8",
    TMPDIR: process.env.TMPDIR,
    TEMP: process.env.TEMP,
    SystemRoot: process.env.SystemRoot,
    LIGHTWEAVER_LAUNCH_FILE: launchFile,
  };
  if (dev) {
    baseEnv.PATH = process.env.PATH;
    return host.start({
      nodePath,
      args: ["--import", "tsx", path.join(repoRoot, "products", "studio", "server", "listen.ts"), "--desktop"],
      cwd: repoRoot,
      env: baseEnv,
      onExit: () => {
        if (!quitting && !suppressExit) void showServiceFailure("业务服务已退出");
      },
    });
  }
  return host.start({
    nodePath,
    args: [path.join(process.resourcesPath, "lightweaver", "service", "server.mjs"), "--desktop", "--production"],
    cwd: path.join(process.resourcesPath, "lightweaver", "service"),
    env: {
      ...baseEnv,
      NODE_PATH: path.join(process.resourcesPath, "lightweaver", "service", "node_modules"),
      LIGHTWEAVER_CARD_INFO: path.join(process.resourcesPath, "lightweaver", "card", "info.json"),
    },
    onExit: () => {
      if (!quitting && !suppressExit) void showServiceFailure("业务服务已退出");
    },
  });
}

function installCredentialHook(): void {
  if (credentialInstalled) return;
  credentialInstalled = true;
  const ses = session.fromPartition("persist:lightweaver");
  ses.webRequest.onBeforeSendHeaders({ urls: ["http://127.0.0.1/*"] }, (details, callback) => {
    const headers = { ...details.requestHeaders };
    try {
      const url = new URL(details.url);
      if (
        service &&
        url.origin === service.origin &&
        mainWindow &&
        details.webContentsId === mainWindow.webContents.id
      )
        headers.Authorization = `Bearer ${service.token}`;
    } catch {
      /* 无法解析的地址不附加凭据。 */
    }
    callback({ requestHeaders: headers });
  });
}

function attachCredential(ready: ServiceReady): void {
  installCredentialHook();
  service = ready;
}

function createWindow(): BrowserWindow {
  const prefs = preferences();
  const bounds = clampBounds(
    prefs.window || { x: 80, y: 60, width: 1440, height: 900 },
  );
  const win = new BrowserWindow({
    ...bounds,
    minWidth: 960,
    minHeight: 640,
    show: false,
    title: "LightWeaver",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      session: session.fromPartition("persist:lightweaver"),
    },
  });
  mainWindow = win;
  win.once("ready-to-show", () => win.show());
  win.on("resize", saveBounds);
  win.on("move", saveBounds);
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event, url) => {
    const next = new URL(url);
    const allowed = service?.origin;
    if (next.protocol === "file:") return;
    if (!allowed || next.origin !== allowed) event.preventDefault();
  });
  win.webContents.on("render-process-gone", (_event, details) => {
    if (quitting || details.reason === "clean-exit") return;
    if (service) void win.loadURL(service.origin);
    else void showServiceFailure("界面进程已退出");
  });
  win.on("close", (event) => {
    if (quitConfirmed) return;
    if (process.platform === "darwin" && !quitting) {
      event.preventDefault();
      win.hide();
      return;
    }
    event.preventDefault();
    void requestQuit();
  });
  return win;
}

function saveBounds(): void {
  if (!mainWindow) return;
  const bounds = mainWindow.getBounds();
  const current = preferences();
  writePreferences(userDataDir(), { ...current, window: bounds });
}

async function showStartup(): Promise<void> {
  const win = mainWindow || createWindow();
  await win.loadFile(path.join(__dirname, "../static/startup.html"));
}

async function showServiceFailure(message: string): Promise<void> {
  unexpectedExit = true;
  const win = mainWindow || createWindow();
  const log = path.join(runtimePaths(preferences()).logDir, "service.log");
  await win.loadFile(path.join(__dirname, "../static/startup.html"), {
    query: { error: message, log },
  });
  win.show();
}

async function launch(): Promise<void> {
  unexpectedExit = false;
  await showStartup();
  try {
    const ready = await bootService();
    if (unexpectedExit) return;
    attachCredential(ready);
    if (dev) await startVite(ready);
    const target = dev
      ? `http://127.0.0.1:${process.env.LIGHTWEAVER_STUDIO_PORT || 5175}/`
      : `${ready.origin}/`;
    await mainWindow?.loadURL(target);
  } catch (error) {
    await showServiceFailure(error instanceof Error ? error.message : "服务启动失败");
  }
}

let vite: ReturnType<typeof spawn> | null = null;
async function startVite(ready: ServiceReady): Promise<void> {
  if (vite) return;
  const port = process.env.LIGHTWEAVER_STUDIO_PORT || "5175";
  vite = spawn(
    process.env.LIGHTWEAVER_NODE || "node",
    [path.join(repoRoot, "node_modules", "vite", "bin", "vite.js"), "--host", "127.0.0.1", "--port", port, "--strictPort"],
    {
      cwd: path.join(repoRoot, "products", "studio"),
      env: {
        ...process.env,
        LIGHTWEAVER_API_PORT: String(ready.port),
        LIGHTWEAVER_SESSION_TOKEN: ready.token,
        LIGHTWEAVER_STUDIO_PORT: port,
      },
      stdio: "ignore",
    },
  );
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/`);
      if (response.ok || response.status < 500) return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  throw new Error("Vite 开发服务器没有就绪");
}

function sendCommand(command: CommandName): void {
  mainWindow?.webContents.send(ipcChannels.command, command);
}

function installMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: "文件",
      submenu: [
        { label: "导入素材", accelerator: "CmdOrCtrl+I", click: () => sendCommand("import") },
        { label: "保存", accelerator: "CmdOrCtrl+S", click: () => sendCommand("save") },
        { label: "查找", accelerator: "CmdOrCtrl+F", click: () => sendCommand("find") },
        { type: "separator" },
        { label: "设置", accelerator: "CmdOrCtrl+,", click: () => sendCommand("settings") },
        { type: "separator" },
        { label: process.platform === "darwin" ? "退出 LightWeaver" : "退出", accelerator: "CmdOrCtrl+Q", click: () => void requestQuit() },
      ],
    },
    { role: "editMenu", label: "编辑" },
    { role: "viewMenu", label: "显示" },
    { role: "windowMenu", label: "窗口" },
  ];
  if (process.platform === "darwin") {
    template.unshift({
      label: app.name,
      submenu: [
        { role: "about" },
        { type: "separator" },
        { label: "设置", accelerator: "CmdOrCtrl+,", click: () => sendCommand("settings") },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { label: "退出 LightWeaver", accelerator: "CmdOrCtrl+Q", click: () => void requestQuit() },
      ],
    });
  }
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

async function requestQuit(): Promise<void> {
  if (quitConfirmed) {
    app.quit();
    return;
  }
  if (quitInProgress) return;
  quitInProgress = true;
  quitting = true;
  if (!mainWindow || mainWindow.webContents.isLoading() || !service) {
    await finishQuit();
    return;
  }
  const decision = await new Promise<QuitDecision>((resolve) => {
    quitWait = resolve;
    mainWindow?.webContents.send(ipcChannels.prepareQuit);
    setTimeout(() => resolve({ action: "cancel", stopJobs: false }), 60_000);
  });
  quitWait = null;
  if (decision.action !== "quit") {
    quitting = false;
    quitInProgress = false;
    mainWindow?.show();
    return;
  }
  await finishQuit();
}

async function finishQuit(): Promise<void> {
  quitConfirmed = true;
  quitting = true;
  suppressExit = true;
  vite?.kill("SIGTERM");
  await host?.stop();
  app.quit();
}

function installIpc(): void {
  ipcMain.on("theme-sync", (event) => {
    assertSender(event);
    event.returnValue = preferences().theme;
  });
  ipcMain.on(ipcChannels.quitResponse, (event, decision: QuitDecision) => {
    assertSender(event);
    if (decision?.action !== "quit" && decision?.action !== "cancel") return;
    quitWait?.(decision);
  });
  ipcMain.handle(ipcChannels.pickMedia, async (event) => {
    assertSender(event);
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ["openFile", "multiSelections"],
      filters: [{ name: "媒体", extensions: ["mp4", "mov", "mkv", "webm", "wav", "mp3", "m4a", "png", "jpg", "jpeg", "webp"] }],
    });
    result.filePaths.forEach(remember);
    return result.canceled ? [] : result.filePaths;
  });
  ipcMain.handle(ipcChannels.pickModelFile, async (event) => {
    assertSender(event);
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ["openFile"],
    });
    return result.canceled ? null : result.filePaths[0] || null;
  });
  ipcMain.handle(ipcChannels.pickDirectory, async (event) => {
    assertSender(event);
    const result = await dialog.showOpenDialog(mainWindow!, { properties: ["openDirectory"] });
    if (!result.canceled && result.filePaths[0]) remember(result.filePaths[0]);
    return result.canceled ? null : result.filePaths[0] || null;
  });
  ipcMain.handle(ipcChannels.pickExportFile, async (event, suggestedName: unknown) => {
    assertSender(event);
    const name = typeof suggestedName === "string" && suggestedName ? suggestedName : "lightweaver-export";
    const result = await dialog.showSaveDialog(mainWindow!, { defaultPath: name });
    if (!result.canceled && result.filePath) remember(path.dirname(result.filePath));
    return result.canceled ? null : result.filePath || null;
  });
  ipcMain.handle(ipcChannels.reveal, async (event, file: unknown) => {
    assertSender(event);
    if (typeof file !== "string" || !path.isAbsolute(file)) throw new Error("只能显示已知的绝对路径");
    if (!canReveal(file)) throw new Error("该路径不在本次允许显示的范围内");
    shell.showItemInFolder(file);
  });
  ipcMain.handle(ipcChannels.openExternal, async (event, value: unknown) => {
    assertSender(event);
    const url = new URL(String(value));
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("只打开 http 或 https 链接");
    await shell.openExternal(url.toString());
  });
  ipcMain.handle(ipcChannels.getPreferences, (event) => {
    assertSender(event);
    return preferences();
  });
  ipcMain.handle(ipcChannels.setPreferences, (event, patch: Partial<DesktopPreferences>) => {
    assertSender(event);
    const next = { ...preferences(), ...patch, theme: patch.theme || preferences().theme };
    return writePreferences(userDataDir(), next);
  });
  ipcMain.handle(ipcChannels.restartRuntime, async (event) => {
    assertSender(event);
    suppressExit = true;
    await host?.stop();
    suppressExit = false;
    service = null;
    await launch();
  });
  ipcMain.handle(ipcChannels.retryService, async (event) => {
    assertSender(event);
    service = null;
    await launch();
  });
  ipcMain.handle(ipcChannels.openLogs, async (event) => {
    assertSender(event);
    const log = path.join(runtimePaths(preferences()).logDir, "service.log");
    fs.mkdirSync(path.dirname(log), { recursive: true });
    if (!fs.existsSync(log)) fs.writeFileSync(log, "");
    await shell.openPath(log);
  });
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();
else {
  app.setPath("userData", userDataDir());
  app.on("second-instance", () => {
    if (!mainWindow) createWindow();
    mainWindow?.show();
    mainWindow?.focus();
  });
  app.on("activate", () => {
    if (!mainWindow) {
      createWindow();
      void launch();
    } else mainWindow.show();
  });
  app.on("before-quit", (event) => {
    if (quitConfirmed) return;
    event.preventDefault();
    void requestQuit();
  });
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") void requestQuit();
  });
  app.whenReady().then(() => {
    installIpc();
    installMenu();
    createWindow();
    void launch();
  });
}
