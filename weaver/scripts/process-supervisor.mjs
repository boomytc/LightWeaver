import { spawn } from "node:child_process";

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

function groupExists() {
  if (!targetGroup) return false;
  try {
    process.kill(-targetGroup, 0);
    return true;
  } catch (error) {
    return isRecord(error) && error.code === "EPERM";
  }
}

function signalGroup(signal) {
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
  if (!targetGroup || terminationStarted) return;
  terminationStarted = true;
  signalGroup("SIGTERM");
  escalationTimer = setTimeout(() => {
    killedAt = Date.now();
    signalGroup("SIGKILL");
  }, GRACE_MS);
  pollTimer = setInterval(settleIfFinished, POLL_MS);
}

function start(command, args) {
  target = spawn(command, args, {
    detached: true,
    shell: false,
    stdio: ["ignore", "inherit", "inherit"],
  });
  targetGroup = target.pid;
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
