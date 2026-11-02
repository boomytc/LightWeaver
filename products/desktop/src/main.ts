import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  nativeImage,
  screen,
  session,
  shell,
  Tray,
  type IpcMainEvent,
  type IpcMainInvokeEvent,
} from "electron";
import {
  parsePreferencesPatch,
  readPreferences,
  writePreferences,
} from "./preferences";
import {
  ipcChannels,
  type CommandName,
  type DesktopPreferences,
  type QuitDecision,
  type QuitIntent,
  type RecoveryFlushResult,
} from "./protocol";
import { RecoveryJournal } from "./recovery-journal";
import { resolveRuntimeTools, type RuntimeTools } from "./runtime-tools";
import {
  ServiceHost,
  ServiceStartCancelledError,
  type ServiceReady,
} from "./service-host";

const dev = process.env.LIGHTWEAVER_DESKTOP_DEV === "1" && !app.isPackaged;
const repoRoot = path.resolve(__dirname, "../../..");
const startupFile = path.join(__dirname, "../static/startup.html");
const serviceHost = new ServiceHost();
const recoveryJournal = new RecoveryJournal();
const allowedReveal = new Set<string>();

const SYSTEM_ENV_KEYS = new Set([
  "APPDATA",
  "COMSPEC",
  "HOME",
  "HOMEDRIVE",
  "HOMEPATH",
  "LANG",
  "LC_ALL",
  "LOCALAPPDATA",
  "LOGNAME",
  "NO_COLOR",
  "NO_PROXY",
  "PATH",
  "PATHEXT",
  "PROGRAMDATA",
  "SSL_CERT_DIR",
  "SSL_CERT_FILE",
  "SYSTEMROOT",
  "TEMP",
  "TMP",
  "TMPDIR",
  "USER",
  "USERNAME",
  "USERPROFILE",
  "WINDIR",
  "XDG_CACHE_HOME",
  "XDG_CONFIG_HOME",
  "XDG_DATA_HOME",
  "HTTP_PROXY",
  "HTTPS_PROXY",
]);

const MODEL_ENV_KEYS = new Set([
  "DEEPSEEK_API_KEY",
  "DEEPSEEK_BASE_URL",
  "HF_HUB_DISABLE_TELEMETRY",
  "HF_HUB_OFFLINE",
  "LLAMA_API_KEY",
  "LLAMA_BASE_URL",
  "MODELBEST_API_KEY",
  "MODELBEST_BASE_URL",
  "TRANSCRIBE_LIBRARY",
  "LIGHTWEAVER_ALIGNMENT_BACKEND",
  "LIGHTWEAVER_ALIGNMENT_DEVICE",
  "LIGHTWEAVER_ALIGNMENT_MODEL",
  "LIGHTWEAVER_ASR_BINDINGS",
  "LIGHTWEAVER_ASR_MODEL",
  "LIGHTWEAVER_CARD_RENDERER",
  "LIGHTWEAVER_CARD_SITE",
  "LIGHTWEAVER_CHROME",
  "LIGHTWEAVER_CONFIG_BASE",
  "LIGHTWEAVER_CONFIG_FILE",
  "LIGHTWEAVER_DATA_DIR",
  "LIGHTWEAVER_DEEPSEEK_MODEL",
  "LIGHTWEAVER_DIARIZATION_BACKEND",
  "LIGHTWEAVER_DIARIZATION_MODEL",
  "LIGHTWEAVER_FFMPEG",
  "LIGHTWEAVER_FFPROBE",
  "LIGHTWEAVER_LLAMA_SERVER",
  "LIGHTWEAVER_LOCAL_TTS_MODEL",
  "LIGHTWEAVER_MODEL_DOWNLOAD_ROOT",
  "LIGHTWEAVER_MODEL_PYTHON",
  "LIGHTWEAVER_PACKAGED",
  "LIGHTWEAVER_PYTHON",
  "LIGHTWEAVER_RERANKER_MODEL",
  "LIGHTWEAVER_SPEECH_PYTHON",
  "LIGHTWEAVER_TRANSLATION_MODEL",
  "LIGHTWEAVER_TRANSLATION_SERVER",
  "LIGHTWEAVER_TTS_MODEL",
  "LIGHTWEAVER_VAD_LIBRARY",
  "LIGHTWEAVER_VISUAL_MMPROJ",
  "LIGHTWEAVER_VISUAL_MODEL",
  "LIGHTWEAVER_VISUAL_SERVER",
  "LIGHTWEAVER_VLM_MODEL",
  "LIGHTWEAVER_VLM_PROVIDER",
]);

let mainWindow: BrowserWindow | null = null;
let service: ServiceReady | null = null;
let quitting = false;
let quitConfirmed = false;
let quitInProgress = false;
let ipcRequestId = 0;
let quitWait: { id: number; finish: (decision: QuitDecision) => void } | null = null;
type WindowCloseRequest = { quitIntent: QuitIntent | null };
let closeRequest: WindowCloseRequest | null = null;
let backgroundTray: Tray | null = null;
type RendererRecoveryFlushOutcome =
  | { status: "complete" }
  | { status: "unavailable" }
  | { status: "timeout" }
  | { status: "failed"; message: string };
let recoveryFlushWait: {
  id: number;
  finish: (result: RecoveryFlushResult | null) => void;
} | null = null;
let credentialInstalled = false;
let runtimeSerial = 0;
let runtimeQueue: Promise<void> = Promise.resolve();
let vite: ChildProcess | null = null;
let viteShutdown: Promise<void> | null = null;
let studioOrigin: string | null = null;
type RuntimePreferencePatch = Partial<
  Pick<DesktopPreferences, "dataDir" | "configFile" | "configBase" | "modelDir">
>;
type RuntimeLaunchSnapshot = Readonly<{
  preferences: DesktopPreferences;
  hasRuntimeChanges: boolean;
}>;
let pendingRuntimePreferences: RuntimePreferencePatch | null = null;
let rendererGeneration: number | null = null;
type RecoveryBinding = Readonly<{
  dataDir: string;
  serviceGeneration: number;
}>;
let recoveryBinding: RecoveryBinding | null = null;

function userDataDir(): string {
  if (process.env.LIGHTWEAVER_USER_DATA)
    return path.resolve(process.env.LIGHTWEAVER_USER_DATA);
  const appData =
    process.platform === "darwin"
      ? path.join(os.homedir(), "Library", "Application Support")
      : process.platform === "win32"
        ? process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming")
        : process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
  return path.join(appData, "LightWeaver");
}

function preferences(): DesktopPreferences {
  return readPreferences(userDataDir());
}

function preferencesWithPending(): DesktopPreferences {
  const persisted = preferences();
  return pendingRuntimePreferences
    ? { ...persisted, ...pendingRuntimePreferences }
    : persisted;
}

function runtimePreferencePatch(
  patch: Partial<DesktopPreferences>,
): RuntimePreferencePatch {
  const runtime: RuntimePreferencePatch = {};
  if (patch.dataDir !== undefined) runtime.dataDir = patch.dataDir;
  if (patch.configFile !== undefined) runtime.configFile = patch.configFile;
  if (patch.configBase !== undefined) runtime.configBase = patch.configBase;
  if (patch.modelDir !== undefined) runtime.modelDir = patch.modelDir;
  return runtime;
}

function captureRuntimeLaunch(): RuntimeLaunchSnapshot {
  const snapshot = preferencesWithPending();
  return {
    preferences: snapshot,
    hasRuntimeChanges: pendingRuntimePreferences !== null,
  };
}

function commitRuntimePreferences(snapshot: DesktopPreferences): void {
  const runtime = runtimePreferencePatch(snapshot);
  writePreferences(userDataDir(), { ...preferences(), ...runtime });
  pendingRuntimePreferences = null;
}

function discardPendingRuntimePreferences(): void {
  pendingRuntimePreferences = null;
}

function assertCurrentRenderer(): void {
  if (rendererGeneration === null || service?.generation !== rendererGeneration)
    throw new Error("界面代次已失效，桌面设置未保存");
}

function restoreRendererGeneration(generation: number | null): void {
  if (
    generation !== null &&
    serviceHost.running &&
    service?.generation === generation
  )
    rendererGeneration = generation;
}

function dataDirForPreferences(prefs: DesktopPreferences): string {
  return path.resolve(
    prefs.dataDir || path.join(userDataDir(), "weaver"),
  );
}

function runtimePaths(prefs: DesktopPreferences) {
  const dataDir = dataDirForPreferences(prefs);
  // 源码桌面与仓库 CLI、浏览器 Studio 共用仓库根的私有配置；正式包写入用户目录。
  const configFile = path.resolve(
    prefs.configFile ||
      path.join(dev ? repoRoot : userDataDir(), "config.local.yaml"),
  );
  const configBase = path.resolve(prefs.configBase || path.dirname(configFile));
  const bundleRoot = path.join(process.resourcesPath, "lightweaver");
  const tools: RuntimeTools = dev
    ? {
        node: process.env.LIGHTWEAVER_NODE || "node",
        ffmpeg: process.env.LIGHTWEAVER_FFMPEG || "",
        ffprobe: process.env.LIGHTWEAVER_FFPROBE || "",
        supervisor: path.join(
          repoRoot,
          "weaver",
          "scripts",
          "process-supervisor.mjs",
        ),
        cardRenderer: path.join(
          repoRoot,
          "node_modules",
          ".bin",
          "weaver-card",
        ),
        cardBrowser: "",
        cardSite: "",
        python: process.env.LIGHTWEAVER_PYTHON || "",
      }
    : resolveRuntimeTools(bundleRoot);
  return {
    mode: dev ? "development" : "production",
    bundleRoot,
    resourcesDir: dev ? repoRoot : path.join(bundleRoot, "resources"),
    configFile,
    configBase,
    dataDir,
    modelDir: path.resolve(
      prefs.modelDir ||
        (dev ? path.join(repoRoot, "data", "models") : path.join(dataDir, "models")),
    ),
    engineDir: path.resolve(
      dev
        ? path.join(repoRoot, "data", "engines")
        : path.join(dataDir, "engines"),
    ),
    tempDir: path.join(dataDir, "tmp"),
    logDir: path.join(dataDir, "logs"),
    tools,
    staticDir: dev ? undefined : path.join(bundleRoot, "ui"),
  };
}

function serviceLogFile(): string {
  try {
    const dataDir = dataDirForPreferences(preferences());
    return path.join(dataDir, "logs", "service.log");
  } catch {
    const dataDir = path.join(userDataDir(), "weaver");
    return path.join(dataDir, "logs", "service.log");
  }
}

function atomicJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
  let fd: number | undefined;
  try {
    fd = fs.openSync(temp, "wx", 0o600);
    fs.writeFileSync(fd, JSON.stringify(value), "utf8");
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
    fs.renameSync(temp, file);
    fs.chmodSync(file, 0o600);
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
    fs.rmSync(temp, { force: true });
  }
}

function serviceEnvironment(paths: ReturnType<typeof runtimePaths>, launchFile: string) {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    const canonical = key.toUpperCase();
    if (
      value !== undefined &&
      (SYSTEM_ENV_KEYS.has(canonical) || MODEL_ENV_KEYS.has(canonical))
    )
      env[key] = value;
  }
  env.LANG ||= "zh_CN.UTF-8";
  env.LIGHTWEAVER_LAUNCH_FILE = launchFile;
  if (!dev) {
    env.NODE_PATH = path.join(paths.bundleRoot, "service", "node_modules");
    env.LIGHTWEAVER_CARD_INFO = path.join(
      paths.bundleRoot,
      "card",
      "info.json",
    );
  }
  return env;
}

function isStartupPage(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "file:" &&
      path.resolve(fileURLToPath(url)) === path.resolve(startupFile)
    );
  } catch {
    return false;
  }
}

function trustedOrigin(): string | null {
  if (dev) return studioOrigin;
  return service?.origin || null;
}

function isTrustedPage(value: string): boolean {
  if (isStartupPage(value)) return true;
  try {
    const origin = trustedOrigin();
    return !!origin && new URL(value).origin === origin;
  } catch {
    return false;
  }
}

function assertSender(event: IpcMainInvokeEvent | IpcMainEvent): void {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (
    !mainWindow ||
    win !== mainWindow ||
    event.senderFrame !== event.sender.mainFrame ||
    !isTrustedPage(event.senderFrame.url)
  )
    throw new Error("拒绝未授权的窗口消息");
}

function canonical(file: string): string | null {
  try {
    return fs.realpathSync(file);
  } catch {
    return null;
  }
}

function remember(file: string): void {
  const canonicalPath = canonical(file) || (file ? path.resolve(file) : "");
  if (canonicalPath) allowedReveal.add(canonicalPath);
}

function canReveal(file: string): boolean {
  const real = canonical(file);
  if (!real) return false;
  const prefs = preferences();
  const paths = runtimePaths(prefs);
  const roots = [
    paths.dataDir,
    paths.modelDir,
    paths.logDir,
    userDataDir(),
    ...allowedReveal,
  ];
  return roots.some((root) => {
    const resolved = canonical(root) || path.resolve(root);
    const prefix = resolved.endsWith(path.sep) ? resolved : resolved + path.sep;
    return real === resolved || real.startsWith(prefix);
  });
}

function clampBounds(bounds: {
  x: number;
  y: number;
  width: number;
  height: number;
}) {
  const display = screen.getDisplayMatching(bounds) || screen.getPrimaryDisplay();
  const area = display.workArea;
  const width = Math.min(Math.max(bounds.width || 1280, 960), area.width);
  const height = Math.min(Math.max(bounds.height || 800, 640), area.height);
  const x = Math.min(Math.max(bounds.x ?? area.x, area.x), area.x + area.width - width);
  const y = Math.min(Math.max(bounds.y ?? area.y, area.y), area.y + area.height - height);
  return { x, y, width, height };
}

function activeRecoveryBinding(): RecoveryBinding {
  if (
    !recoveryBinding ||
    !service ||
    recoveryBinding.serviceGeneration !== service.generation
  )
    throw new Error("恢复草稿 journal 尚未绑定到当前服务代次");
  return recoveryBinding;
}

function clearRecoveryBinding(): void {
  recoveryBinding = null;
}

async function bootService(
  studioPort: number,
  prefs: DesktopPreferences,
): Promise<{ ready: ServiceReady; dataDir: string }> {
  const paths = runtimePaths(prefs);
  const { staticDir, bundleRoot: _bundleRoot, ...runtime } = paths;
  fs.mkdirSync(runtime.logDir, { recursive: true });
  const launchFile = path.join(runtime.logDir, "launch.json");
  atomicJson(launchFile, {
    runtime,
    staticDir,
    devOrigins: dev ? [`http://127.0.0.1:${studioPort}`] : [],
  });
  const ready = await serviceHost.start({
    nodePath: paths.tools.node,
    args: dev
      ? [
          "--import",
          "tsx",
          path.join(repoRoot, "products", "studio", "server", "listen.ts"),
          "--desktop",
        ]
      : [
          path.join(paths.bundleRoot, "service", "server.mjs"),
          "--desktop",
          "--production",
        ],
    cwd: dev ? repoRoot : path.join(paths.bundleRoot, "service"),
    env: serviceEnvironment(paths, launchFile),
    logFile: path.join(paths.logDir, "service.log"),
    onExit: () => serviceDidExit(),
  });
  return { ready, dataDir: paths.dataDir };
}

function installCredentialHook(): void {
  if (credentialInstalled) return;
  credentialInstalled = true;
  const ses = session.fromPartition("persist:lightweaver");
  ses.webRequest.onBeforeSendHeaders(
    { urls: ["http://127.0.0.1/*"] },
    (details, callback) => {
      const headers = { ...details.requestHeaders };
      try {
        if (
          service &&
          new URL(details.url).origin === service.origin &&
          mainWindow &&
          details.webContentsId === mainWindow.webContents.id
        )
          headers.Authorization = `Bearer ${service.token}`;
        else delete headers.Authorization;
      } catch {
        delete headers.Authorization;
      }
      callback({ requestHeaders: headers });
    },
  );
}

function attachCredential(ready: ServiceReady): void {
  installCredentialHook();
  service = ready;
}

function clearCredential(): void {
  service = null;
}

function currentContentTarget(): string | null {
  if (dev)
    return studioOrigin && vite && vite.exitCode === null
      ? `${studioOrigin}/`
      : null;
  return service ? `${service.origin}/` : null;
}

function createWindow(visualPreferences?: DesktopPreferences): BrowserWindow {
  const prefs = visualPreferences || preferences();
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
    if (!isTrustedPage(url)) event.preventDefault();
  });
  win.webContents.on("render-process-gone", (_event, details) => {
    if (quitConfirmed || details.reason === "clean-exit") return;
    quitWait?.finish({ action: "cancel", stopJobs: false });
    recoveryFlushWait?.finish({ ok: false, message: "界面进程已退出，请等待恢复后重试" });
    rendererGeneration = null;
    const targetService = service;
    const target = currentContentTarget();
    if (target) {
      void win
        .loadURL(target)
        .then(() => {
          if (targetService && service === targetService)
            rendererGeneration = targetService.generation;
        })
        .catch((error: unknown) => {
          void showServiceFailure(
            error instanceof Error ? error.message : "界面恢复失败",
          );
        });
    } else void showServiceFailure("界面进程已退出");
  });
  win.on("close", (event) => {
    if (quitConfirmed) return;
    event.preventDefault();
    void requestClose(win);
  });
  win.once("closed", () => {
    if (mainWindow === win) mainWindow = null;
  });
  return win;
}

function showMainWindow(): void {
  const win = mainWindow;
  if (!win || win.isDestroyed()) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function ensureBackgroundTray(): void {
  if (backgroundTray && !backgroundTray.isDestroyed()) return;
  const iconFile = dev
    ? path.join(__dirname, "../packaging/icon.png")
    : path.join(process.resourcesPath, "lightweaver", "icon.png");
  const icon = nativeImage.createFromPath(iconFile);
  if (icon.isEmpty()) throw new Error("托盘图标不可用，无法提供后台窗口恢复入口");
  const tray = new Tray(icon.resize({ width: 18, height: 18 }));
  try {
    tray.setToolTip("LightWeaver");
    tray.on("click", showMainWindow);
    tray.on("double-click", showMainWindow);
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: "打开 LightWeaver", click: showMainWindow },
      { type: "separator" },
      { label: "退出 LightWeaver", click: () => { showMainWindow(); void requestQuit(); } },
    ]));
    backgroundTray = tray;
  } catch (error) {
    tray.destroy();
    throw error;
  }
}

async function requestClose(win: BrowserWindow): Promise<void> {
  if (closeRequest || quitInProgress || quitting || win.isDestroyed()) return;
  const request: WindowCloseRequest = { quitIntent: null };
  closeRequest = request;
  try {
    const { response } = await dialog.showMessageBox(win, {
      type: "question",
      title: "关闭 LightWeaver 窗口",
      message: "关闭窗口后，是否停止后台进程？",
      detail: "后台运行会保留本地服务，正在进行的制作或下载会继续。可通过托盘菜单重新打开窗口。",
      buttons: ["后台运行", "停止后台并退出", "取消"],
      defaultId: 0,
      cancelId: 2,
      noLink: true,
    });
    if (win.isDestroyed() || quitting) return;
    if (response === 1) {
      request.quitIntent = "stop-jobs";
      return;
    }
    if (response !== 0 || request.quitIntent) return;
    const flush = await enqueueRuntime(() => requestRendererRecoveryFlush());
    if (flush.status === "failed" || flush.status === "timeout")
      throw new Error(flush.status === "failed" ? flush.message : "界面未确认草稿已写入磁盘，请稍后重试");
    if (request.quitIntent || quitting || win.isDestroyed()) return;
    ensureBackgroundTray();
    if (win.isFullScreen()) win.setFullScreen(false);
    win.hide();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`关闭窗口未完成：${message}`);
    if (!win.isDestroyed()) {
      win.show();
      await dialog.showMessageBox(win, {
        type: "warning",
        title: "窗口保持打开",
        message: "未能安全转入后台运行",
        detail: message,
        buttons: ["知道了"],
        noLink: true,
      }).catch(() => undefined);
    }
  } finally {
    closeRequest = null;
    if (request.quitIntent) await requestQuit(request.quitIntent);
  }
}

function saveBounds(): void {
  if (!mainWindow) return;
  const bounds = mainWindow.getBounds();
  try {
    const current = preferences();
    writePreferences(userDataDir(), { ...current, window: bounds });
  } catch (error) {
    console.error(
      `无法保存窗口位置，现有桌面设置保持不变：${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

async function showStartup(): Promise<void> {
  const win = mainWindow || createWindow();
  await win.loadFile(startupFile);
  win.show();
}

async function showServiceFailure(message: string): Promise<void> {
  const win = mainWindow || createWindow();
  const safeMessage = message.slice(0, 2000) || "服务启动失败";
  await win.loadFile(startupFile, {
    query: { error: safeMessage, log: serviceLogFile() },
  });
  win.show();
}

async function showStartupFailure(error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  try {
    const win = mainWindow || createWindow({ theme: "system" });
    await win.loadFile(startupFile, {
      query: {
        error: `桌面设置不可用：${message}`,
        log: serviceLogFile(),
      },
    });
    win.show();
  } catch (displayError) {
    dialog.showErrorBox(
      "LightWeaver 无法启动",
      displayError instanceof Error ? displayError.message : String(displayError),
    );
  }
}

async function reserveStudioPort(): Promise<number> {
  const configured = process.env.LIGHTWEAVER_STUDIO_PORT;
  if (configured) {
    const port = Number(configured);
    if (!Number.isInteger(port) || port < 1 || port > 65_535)
      throw new Error("LIGHTWEAVER_STUDIO_PORT 无效");
    return port;
  }
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("无法分配 Vite 开发端口"));
        return;
      }
      server.close((error) => {
        if (error) reject(error);
        else resolve(address.port);
      });
    });
  });
}

async function stopVite(): Promise<void> {
  if (viteShutdown) return viteShutdown;
  const child = vite;
  vite = null;
  studioOrigin = null;
  if (!child) return;
  viteShutdown = (async () => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const exited = new Promise<void>((resolve) =>
      child.once("exit", () => resolve()),
    );
    child.kill("SIGTERM");
    let timeout: NodeJS.Timeout | undefined;
    const done = await Promise.race([
      exited.then(() => true),
      new Promise<boolean>((resolve) => {
        timeout = setTimeout(() => resolve(false), 3_000);
      }),
    ]);
    if (timeout) clearTimeout(timeout);
    if (!done && child.exitCode === null && child.signalCode === null)
      child.kill("SIGKILL");
    await exited;
  })().finally(() => {
    viteShutdown = null;
  });
  return viteShutdown;
}

async function startVite(
  ready: ServiceReady,
  studioPort: number,
): Promise<string> {
  await stopVite();
  const origin = `http://127.0.0.1:${studioPort}`;
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (
      value !== undefined &&
      SYSTEM_ENV_KEYS.has(key.toUpperCase())
    )
      env[key] = value;
  }
  env.NODE_ENV = process.env.NODE_ENV || "development";
  env.LIGHTWEAVER_API_PORT = String(ready.port);
  env.LIGHTWEAVER_SESSION_TOKEN = ready.token;
  env.LIGHTWEAVER_STUDIO_PORT = String(studioPort);
  const child = spawn(
    process.env.LIGHTWEAVER_NODE || "node",
    [
      path.join(repoRoot, "node_modules", "vite", "bin", "vite.js"),
      "--host",
      "127.0.0.1",
      "--port",
      String(studioPort),
      "--strictPort",
    ],
    {
      cwd: path.join(repoRoot, "products", "studio"),
      env,
      stdio: "ignore",
    },
  );
  vite = child;
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null)
      throw new Error(`Vite 开发服务器在就绪前退出（${child.exitCode}）`);
    try {
      const response = await fetch(`${origin}/`);
      if (response.ok || response.status < 500) {
        studioOrigin = origin;
        return origin;
      }
    } catch {
      // Vite has not started listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error("Vite 开发服务器没有就绪");
}

async function shutdownRuntime(): Promise<void> {
  clearCredential();
  await stopVite().catch(() => undefined);
  await serviceHost.stop().catch(() => undefined);
}

function enqueueRuntime<T>(operation: () => Promise<T>): Promise<T> {
  const run = runtimeQueue.then(operation, operation);
  runtimeQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function launchRuntime(abortOnFlushFailure = false): Promise<void> {
  const serial = ++runtimeSerial;
  const launch = captureRuntimeLaunch();
  const previousRendererGeneration =
    service && recoveryBinding?.serviceGeneration === service.generation
      ? service.generation
      : null;
  rendererGeneration = null;
  return enqueueRuntime(async () => {
    let flush: RendererRecoveryFlushOutcome;
    try {
      flush = await requestRendererRecoveryFlush();
    } catch (error) {
      if (serial === runtimeSerial) discardPendingRuntimePreferences();
      if (abortOnFlushFailure) {
        if (serial === runtimeSerial)
          restoreRendererGeneration(previousRendererGeneration);
        throw error;
      }
      if (quitting || serial !== runtimeSerial) return;
      await showServiceFailure(
        error instanceof Error ? error.message : "恢复草稿保存失败",
      );
      return;
    }
    if (
      abortOnFlushFailure &&
      (flush.status === "failed" || flush.status === "timeout")
    ) {
      if (serial === runtimeSerial) {
        discardPendingRuntimePreferences();
        restoreRendererGeneration(previousRendererGeneration);
      }
      const reason =
        flush.status === "failed"
          ? flush.message
          : "界面没有在 1.5 秒内确认草稿已写入磁盘";
      throw new Error(`未能安全保存界面草稿，已取消重启：${reason}`);
    }
    if (quitting || serial !== runtimeSerial) return;
    try {
      await showStartup();
      if (quitting || serial !== runtimeSerial) return;
      clearRecoveryBinding();
      clearCredential();
      await Promise.allSettled([serviceHost.stop(), stopVite()]);
      if (quitting || serial !== runtimeSerial) return;
      const studioPort = dev ? await reserveStudioPort() : 0;
      if (quitting || serial !== runtimeSerial) return;
      const booted = await bootService(studioPort, launch.preferences);
      if (quitting || serial !== runtimeSerial) {
        clearCredential();
        await serviceHost.stop();
        clearRecoveryBinding();
        rendererGeneration = null;
        return;
      }
      attachCredential(booted.ready);
      if (dev) await startVite(booted.ready, studioPort);
      if (quitting || serial !== runtimeSerial) {
        clearRecoveryBinding();
        rendererGeneration = null;
        await shutdownRuntime();
        return;
      }
      const target = currentContentTarget();
      if (!target) throw new Error("界面目标不可用");
      recoveryBinding = {
        dataDir: booted.dataDir,
        serviceGeneration: booted.ready.generation,
      };
      rendererGeneration = booted.ready.generation;
      await (mainWindow || createWindow()).loadURL(target);
      if (quitting || serial !== runtimeSerial) {
        clearRecoveryBinding();
        rendererGeneration = null;
        await shutdownRuntime();
        return;
      }
      if (launch.hasRuntimeChanges)
        commitRuntimePreferences(launch.preferences);
    } catch (error) {
      if (
        quitting ||
        serial !== runtimeSerial ||
        error instanceof ServiceStartCancelledError
      )
        return;
      discardPendingRuntimePreferences();
      clearRecoveryBinding();
      rendererGeneration = null;
      await shutdownRuntime();
      await recoveryJournal.flush().catch(() => undefined);
      if (quitting || serial !== runtimeSerial) return;
      await showServiceFailure(
        error instanceof Error ? error.message : "服务启动失败",
      );
    }
  });
}

function parseRecoveryFlushResult(
  value: unknown,
): RecoveryFlushResult | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const result = value as Record<string, unknown>;
  if (result.ok === true)
    return Object.keys(result).length === 1 ? { ok: true } : null;
  if (
    result.ok === false &&
    typeof result.message === "string" &&
    result.message.length <= 2000
  )
    return { ok: false, message: result.message || "界面草稿保存失败" };
  return null;
}

function requestRendererRecoveryFlush(): Promise<RendererRecoveryFlushOutcome> {
  const win = mainWindow;
  if (
    !win ||
    win.isDestroyed() ||
    win.webContents.isDestroyed() ||
    win.webContents.isLoading() ||
    isStartupPage(win.webContents.getURL())
  )
    return recoveryJournal
      .flush()
      .then(() => ({ status: "unavailable" as const }));
  return new Promise((resolve, reject) => {
    const id = ++ipcRequestId;
    const finish = (result: RecoveryFlushResult | null) => {
      if (recoveryFlushWait?.id !== id) return;
      clearTimeout(timer);
      recoveryFlushWait = null;
      void recoveryJournal.flush().then(
        () => {
          if (!result) {
            resolve({ status: "timeout" });
            return;
          }
          resolve(
            result.ok
              ? { status: "complete" }
              : { status: "failed", message: result.message },
          );
        },
        reject,
      );
    };
    const timer = setTimeout(() => finish(null), 1_500);
    recoveryFlushWait = { id, finish };
    win.webContents.send(ipcChannels.prepareRecoveryFlush, id);
  });
}

function serviceDidExit(): void {
  if (quitting || quitConfirmed) return;
  rendererGeneration = null;
  discardPendingRuntimePreferences();
  const serial = ++runtimeSerial;
  void enqueueRuntime(async () => {
    let message = "业务服务已退出";
    try {
      await requestRendererRecoveryFlush();
    } catch (error) {
      message = `业务服务已退出；恢复草稿保存失败：${
        error instanceof Error ? error.message : String(error)
      }`;
    }
    if (quitting || serial !== runtimeSerial) return;
    clearRecoveryBinding();
    clearCredential();
    await stopVite().catch(() => undefined);
    if (quitting || serial !== runtimeSerial) return;
    await showServiceFailure(message);
  }).catch((error: unknown) => {
    console.error(
      `无法显示服务退出页面：${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  });
}

function sendCommand(command: CommandName): void {
  mainWindow?.webContents.send(ipcChannels.command, command);
}

function installMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: "文件",
      submenu: [
        {
          label: "导入素材",
          accelerator: "CmdOrCtrl+I",
          click: () => sendCommand("import"),
        },
        {
          label: "保存",
          accelerator: "CmdOrCtrl+S",
          click: () => sendCommand("save"),
        },
        {
          label: "查找",
          accelerator: "CmdOrCtrl+F",
          click: () => sendCommand("find"),
        },
        { type: "separator" },
        {
          label: "设置",
          accelerator: "CmdOrCtrl+,",
          click: () => sendCommand("settings"),
        },
        { type: "separator" },
        {
          label: process.platform === "darwin" ? "退出 LightWeaver" : "退出",
          accelerator: "CmdOrCtrl+Q",
          click: () => void requestQuit(),
        },
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
        {
          label: "设置",
          accelerator: "CmdOrCtrl+,",
          click: () => sendCommand("settings"),
        },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        {
          label: "退出 LightWeaver",
          accelerator: "CmdOrCtrl+Q",
          click: () => void requestQuit(),
        },
      ],
    });
  }
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function quitDecision(value: unknown): QuitDecision | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const decision = value as Record<string, unknown>;
  if (
    (decision.action !== "quit" && decision.action !== "cancel") ||
    typeof decision.stopJobs !== "boolean"
  )
    return null;
  return {
    action: decision.action,
    stopJobs: decision.stopJobs,
  };
}

async function requestQuit(intent: QuitIntent = "confirm-jobs"): Promise<void> {
  if (quitConfirmed) {
    app.quit();
    return;
  }
  if (closeRequest) {
    if (intent === "stop-jobs" || closeRequest.quitIntent === null)
      closeRequest.quitIntent = intent;
    return;
  }
  if (quitInProgress) return;
  quitInProgress = true;
  quitting = true;
  showMainWindow();
  try {
    if (!mainWindow || mainWindow.webContents.isLoading() || !service) {
      await finishQuit();
      return;
    }
    const decision = await new Promise<QuitDecision>((resolve) => {
      const id = ++ipcRequestId;
      const finish = (value: QuitDecision) => {
        if (quitWait?.id !== id) return;
        clearTimeout(timeout);
        quitWait = null;
        if (value.action === "cancel" && mainWindow && !mainWindow.webContents.isDestroyed())
          mainWindow.webContents.send(ipcChannels.cancelQuit, id);
        resolve(value);
      };
      const timeout = setTimeout(
        () => finish({ action: "cancel", stopJobs: false }),
        60_000,
      );
      quitWait = { id, finish };
      mainWindow?.webContents.send(ipcChannels.prepareQuit, id, intent);
    });
    if (decision.action !== "quit") {
      cancelQuit();
      return;
    }
    await finishQuit();
  } catch (error) {
    cancelQuit();
    const message = error instanceof Error ? error.message : String(error);
    console.error(`退出未完成：${message}`);
    const win = mainWindow;
    if (win && !win.isDestroyed())
      await dialog.showMessageBox(win, {
        type: "warning",
        title: "退出未完成",
        message: "未能安全停止后台，窗口保持打开",
        detail: message,
        buttons: ["返回应用"],
        noLink: true,
      }).catch(() => undefined);
  }
}

function cancelQuit(): void {
  quitting = false;
  quitInProgress = false;
  if (recoveryBinding) restoreRendererGeneration(recoveryBinding.serviceGeneration);
  showMainWindow();
  if (!serviceHost.running) serviceDidExit();
}

async function finishQuit(): Promise<void> {
  ++runtimeSerial;
  rendererGeneration = null;
  discardPendingRuntimePreferences();
  await enqueueRuntime(async () => {
    const flush = await requestRendererRecoveryFlush();
    if (flush.status === "failed" || flush.status === "timeout")
      throw new Error(flush.status === "failed" ? flush.message : "界面未确认草稿已写入磁盘，请稍后重试");
    await recoveryJournal.flush();
    clearRecoveryBinding();
    clearCredential();
    await Promise.allSettled([serviceHost.stop(), stopVite()]);
    quitConfirmed = true;
    quitting = true;
    app.quit();
  });
}

function installIpc(): void {
  ipcMain.on("theme-sync", (event) => {
    try {
      assertSender(event);
      event.returnValue = preferences().theme;
    } catch (error) {
      console.error(
        `无法读取同步主题，使用 system 并保留现有设置：${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      event.returnValue = "system";
    }
  });
  ipcMain.on(ipcChannels.quitResponse, (event, id: unknown, value: unknown) => {
    assertSender(event);
    const decision = quitDecision(value);
    if (decision && quitWait && quitWait.id === id) quitWait.finish(decision);
  });
  ipcMain.on(ipcChannels.recoveryFlushResult, (event, id: unknown, value: unknown) => {
    assertSender(event);
    const result = parseRecoveryFlushResult(value);
    if (result && recoveryFlushWait && recoveryFlushWait.id === id) recoveryFlushWait.finish(result);
  });
  ipcMain.handle(ipcChannels.pickMedia, async (event) => {
    assertSender(event);
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ["openFile", "multiSelections"],
      filters: [
        {
          name: "媒体",
          extensions: [
            "mp4",
            "mov",
            "mkv",
            "webm",
            "wav",
            "mp3",
            "m4a",
            "png",
            "jpg",
            "jpeg",
            "webp",
          ],
        },
      ],
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
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ["openDirectory"],
    });
    if (!result.canceled && result.filePaths[0]) remember(result.filePaths[0]);
    return result.canceled ? null : result.filePaths[0] || null;
  });
  ipcMain.handle(
    ipcChannels.pickExportFile,
    async (event, suggestedName: unknown) => {
      assertSender(event);
      const name =
        typeof suggestedName === "string" && suggestedName
          ? suggestedName
          : "lightweaver-export";
      const result = await dialog.showSaveDialog(mainWindow!, {
        defaultPath: name,
      });
      if (!result.canceled && result.filePath)
        remember(path.dirname(result.filePath));
      return result.canceled ? null : result.filePath || null;
    },
  );
  ipcMain.handle(ipcChannels.reveal, async (event, file: unknown) => {
    assertSender(event);
    if (typeof file !== "string" || !path.isAbsolute(file))
      throw new Error("只能显示已知的绝对路径");
    if (!canReveal(file)) throw new Error("该路径不在本次允许显示的范围内");
    shell.showItemInFolder(file);
  });
  ipcMain.handle(ipcChannels.openExternal, async (event, value: unknown) => {
    assertSender(event);
    const url = new URL(String(value));
    if (url.protocol !== "http:" && url.protocol !== "https:")
      throw new Error("只打开 http 或 https 链接");
    await shell.openExternal(url.toString());
  });
  ipcMain.handle(ipcChannels.getPreferences, (event) => {
    assertSender(event);
    return preferencesWithPending();
  });
  ipcMain.handle(ipcChannels.setPreferences, (event, value: unknown) => {
    assertSender(event);
    assertCurrentRenderer();
    const patch = parsePreferencesPatch(value);
    const runtime = runtimePreferencePatch(patch);
    const immediate: Partial<DesktopPreferences> = {};
    if (patch.theme !== undefined) immediate.theme = patch.theme;
    if (patch.layout !== undefined) immediate.layout = patch.layout;
    if (patch.window !== undefined) immediate.window = patch.window;
    const persisted =
      Object.keys(immediate).length > 0
        ? writePreferences(userDataDir(), {
            ...preferences(),
            ...immediate,
          })
        : preferences();
    if (Object.keys(runtime).length > 0)
      pendingRuntimePreferences = {
        ...pendingRuntimePreferences,
        ...runtime,
      };
    return pendingRuntimePreferences
      ? { ...persisted, ...pendingRuntimePreferences }
      : persisted;
  });
  ipcMain.handle(ipcChannels.restartRuntime, async (event) => {
    assertSender(event);
    if (quitting) throw new Error("应用正在退出");
    await launchRuntime(true);
  });
  ipcMain.handle(ipcChannels.retryService, async (event) => {
    assertSender(event);
    if (quitting) throw new Error("应用正在退出");
    discardPendingRuntimePreferences();
    await launchRuntime();
  });
  ipcMain.handle(ipcChannels.openLogs, async (event) => {
    assertSender(event);
    const log = serviceLogFile();
    fs.mkdirSync(path.dirname(log), { recursive: true });
    if (!fs.existsSync(log)) fs.writeFileSync(log, "", { mode: 0o600 });
    await shell.openPath(log);
  });
  ipcMain.handle(ipcChannels.getRecoveryDrafts, async (event) => {
    assertSender(event);
    const binding = activeRecoveryBinding();
    return recoveryJournal.get(binding.dataDir);
  });
  ipcMain.handle(
    ipcChannels.saveRecoveryDraft,
    async (event, value: unknown) => {
      assertSender(event);
      const binding = activeRecoveryBinding();
      await recoveryJournal.save(binding.dataDir, value);
    },
  );
  ipcMain.handle(
    ipcChannels.clearRecoveryDraft,
    async (event, value: unknown) => {
      assertSender(event);
      const binding = activeRecoveryBinding();
      await recoveryJournal.clear(binding.dataDir, value);
    },
  );
}

const isolatedUserData = userDataDir();
fs.mkdirSync(isolatedUserData, { recursive: true });
app.setPath("userData", isolatedUserData);

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();
else {
  app.on("second-instance", () => {
    if (!mainWindow) createWindow();
    showMainWindow();
  });
  app.on("activate", () => {
    if (!mainWindow) {
      createWindow();
      void launchRuntime();
    } else showMainWindow();
  });
  app.on("before-quit", (event) => {
    if (quitConfirmed) return;
    event.preventDefault();
    void requestQuit();
  });
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") void requestQuit();
  });
  app.on("will-quit", () => {
    backgroundTray?.destroy();
    backgroundTray = null;
  });
  app.whenReady().then(async () => {
    installIpc();
    installMenu();
    try {
      createWindow();
      void launchRuntime();
    } catch (error) {
      await showStartupFailure(error);
    }
  }).catch((error: unknown) => {
    dialog.showErrorBox(
      "LightWeaver 无法启动",
      error instanceof Error ? error.message : String(error),
    );
  });
}
