import { spawn, spawnSync } from "node:child_process";

const GRACE_MS = 3000;
const POLL_MS = 25;
const POST_KILL_MS = 250;

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

function groupExists() {
  if (windows) {
    if (!target?.pid) return false;
    const listed = spawnSync("tasklist", ["/FI", `PID eq ${target.pid}`, "/NH"], {
      encoding: "utf8",
      windowsHide: true,
    });
    return listed.stdout.includes(String(target.pid));
  }
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
    if (!target?.pid) return;
    const args = ["/PID", String(target.pid), "/T"];
    if (signal === "SIGKILL") args.push("/F");
    spawnSync("taskkill", args, { stdio: "ignore", windowsHide: true });
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
  target = spawn(command, args, {
    detached: !windows,
    shell: false,
    windowsHide: true,
    stdio: ["ignore", "inherit", "inherit"],
  });
  targetGroup = windows ? undefined : target.pid;
  if (stopRequested) requestTermination();
  target.once("error", (error) => {
    spawnFailure = error.message;
    finish();
  });
  target.once("close", (code, signal) => {
    targetResult = { code, signal };
    if (stopRequested || groupExists()) requestTermination();
    settleIfFinished();
  });
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
