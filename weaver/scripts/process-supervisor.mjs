import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const GRACE_MS = 3000;
const POLL_MS = 25;
const POST_KILL_MS = 250;
const WINDOWS_STARTED = "LIGHTWEAVER_JOB_STARTED";

let target;
let targetGroup;
let targetResult;
let spawnFailure;
let stopRequested = false;
let terminationStarted = false;
let killedAt;
let escalationTimer;
let pollTimer;
let finished = false;
let windowsStarted = false;

function isRecord(value) {
  return typeof value === "object" && value !== null;
}

function parseStart(value) {
  if (
    !isRecord(value) ||
    value.type !== "start" ||
    typeof value.command !== "string" ||
    !Array.isArray(value.args) ||
    !value.args.every((arg) => typeof arg === "string")
  )
    return null;
  return { command: value.command, args: value.args };
}

const windows = process.platform === "win32";
const windowsHelper = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "windows-job-supervisor.ps1",
);

function groupExists() {
  if (windows)
    return !!target && target.exitCode === null && target.signalCode === null;
  if (!targetGroup) return false;
  try {
    process.kill(-targetGroup, 0);
    return true;
  } catch (error) {
    return isRecord(error) && error.code === "EPERM";
  }
}

function signalTree(signal) {
  if (windows) {
    if (!target) return;
    if (signal === "SIGKILL" || !target.stdin || target.stdin.destroyed) {
      target.kill("SIGKILL");
      return;
    }
    target.stdin.write("stop\n", (error) => {
      if (error) target.kill("SIGKILL");
    });
    return;
  }
  if (!targetGroup) return;
  try {
    process.kill(-targetGroup, signal);
  } catch {
    /* The target group may have exited between checks. */
  }
}

function finish() {
  if (finished) return;
  finished = true;
  clearTimeout(escalationTimer);
  clearInterval(pollTimer);
  const message = spawnFailure
    ? { type: "spawn-error", message: spawnFailure }
    : {
        type: "result",
        code: targetResult?.code ?? null,
        signal: targetResult?.signal ?? null,
      };
  const code = spawnFailure ? 127 : targetResult?.code ?? 1;
  const exit = () => process.exit(code);
  if (process.connected && process.send) {
    const safety = setTimeout(exit, 250);
    process.send(message, () => {
      clearTimeout(safety);
      exit();
    });
  } else exit();
}

function settleIfFinished() {
  if (spawnFailure) {
    finish();
    return;
  }
  if (!targetResult) return;
  if (!terminationStarted && groupExists()) requestTermination();
  if (
    !groupExists() ||
    (killedAt !== undefined && Date.now() - killedAt >= POST_KILL_MS)
  )
    finish();
}

function requestTermination() {
  stopRequested = true;
  if (terminationStarted) return;
  if (!windows && !targetGroup) return;
  if (windows && !target?.pid) return;
  terminationStarted = true;
  signalTree("SIGTERM");
  escalationTimer = setTimeout(() => {
    killedAt = Date.now();
    signalTree("SIGKILL");
  }, GRACE_MS);
  pollTimer = setInterval(settleIfFinished, POLL_MS);
}

function start(command, args) {
  if (windows) {
    target = spawn(
      "powershell.exe",
      [
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-OutputFormat",
        "Text",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        windowsHelper,
      ],
      {
        shell: false,
        windowsHide: true,
        stdio: ["pipe", "pipe", "inherit"],
      },
    );
    targetGroup = undefined;
  } else {
    target = spawn(command, args, {
      detached: true,
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "inherit", "inherit"],
    });
    targetGroup = target.pid;
  }
  target.once("error", (error) => {
    spawnFailure = error.message;
    finish();
  });
  target.once("close", (code, signal) => {
    if (windows && !windowsStarted)
      spawnFailure ??= `Windows 媒体进程未能启动（${code ?? signal ?? "未知原因"}）`;
    targetResult = { code, signal };
    if (stopRequested || groupExists()) requestTermination();
    settleIfFinished();
  });
  if (windows) {
    let handshake = Buffer.alloc(0);
    target.stdout.on("data", (chunk) => {
      if (windowsStarted) {
        process.stdout.write(chunk);
        return;
      }
      handshake = Buffer.concat([handshake, chunk]);
      const newline = handshake.indexOf(10);
      if (newline < 0 && handshake.length <= 1024) return;
      if (newline < 0 || handshake.subarray(0, newline).toString("utf8").trim() !== WINDOWS_STARTED) {
        spawnFailure = "Windows 媒体监督进程握手无效";
        requestTermination();
        return;
      }
      windowsStarted = true;
      process.stdout.write(handshake.subarray(newline + 1));
      handshake = Buffer.alloc(0);
    });
    target.stdin?.on("error", (error) => {
      if (terminationStarted) return;
      spawnFailure = error.message;
      finish();
    });
    target.stdin?.write(
      `${JSON.stringify({ type: "start", command, args })}\n`,
      (error) => {
        if (terminationStarted) return;
        if (error) {
          spawnFailure = error.message;
          finish();
        }
      },
    );
  }
  if (stopRequested) requestTermination();
}

process.stdin.resume();
process.stdin.once("end", requestTermination);
process.stdin.once("close", requestTermination);
process.once("disconnect", requestTermination);
process.on("SIGTERM", requestTermination);
process.on("SIGINT", requestTermination);
process.once("message", (value) => {
  if (isRecord(value) && value.type === "stop") {
    requestTermination();
    return;
  }
  const request = parseStart(value);
  if (request) {
    start(request.command, request.args);
    process.on("message", (next) => {
      if (isRecord(next) && next.type === "stop") requestTermination();
    });
    return;
  }
  spawnFailure = "媒体监督进程收到无效启动消息";
  finish();
});
