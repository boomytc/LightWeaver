import { spawn } from "node:child_process";
import { WeaverError } from "../contracts/errors.ts";
import { z } from "../contracts/index.ts";
import { resolveExecutable } from "../adapters/executable.ts";
import { currentRuntime } from "../runtime.ts";
import { runtimeBinding } from "../engines/runtime.ts";

function supervisorLaunch(): { command: string; args: string[] } {
  const runtime = currentRuntime();
  return {
    command: runtime.tools.node,
    args: [runtime.tools.supervisor],
  };
}

export function nodeScriptInvocation(
  script: string,
  args: string[],
): { command: string; args: string[]; env: NodeJS.ProcessEnv } {
  const runtime = currentRuntime();
  const env: NodeJS.ProcessEnv = { ...process.env };
  if (runtime.tools.ffmpeg) env.LIGHTWEAVER_FFMPEG = runtime.tools.ffmpeg;
  if (runtime.tools.ffprobe) env.LIGHTWEAVER_FFPROBE = runtime.tools.ffprobe;
  if (runtime.tools.cardBrowser) env.LIGHTWEAVER_CHROME = runtime.tools.cardBrowser;
  delete env.ELECTRON_RUN_AS_NODE;
  return { command: runtime.tools.node, args: [script, ...args], env };
}

function resolveCommand(command: string): string {
  if (command === "python3" || command === "python") {
    const python = runtimeBinding("python").value;
    if (!python) throw new WeaverError("CONFIG_MISSING", "Python 运行环境尚未安装", null,
      ["运行 weaver engines install python-runtime，或在诊断与修复中准备运行组件。"]);
    return python;
  }
  if (["ffmpeg", "ffprobe"].includes(command)) {
    const resolved = resolveExecutable(command, currentRuntime().configBase);
    if (resolved) return resolved;
  }
  return command;
}

const SupervisorMessage = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("result"),
    code: z.number().int().nullable(),
    signal: z.string().nullable(),
  }),
  z.strictObject({
    type: z.literal("spawn-error"),
    message: z.string(),
  }),
]);
type SupervisorMessage = z.infer<typeof SupervisorMessage>;
type SupervisorResult = Extract<SupervisorMessage, { type: "result" }>;

type StopReason =
  | { type: "abort"; reason: unknown }
  | { type: "deadline" }
  | { type: "output-overflow" };

function parseSupervisorMessage(value: unknown): SupervisorMessage | null {
  const parsed = SupervisorMessage.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function stopError(reason: StopReason): WeaverError {
  if (reason.type === "abort") {
    if (reason.reason instanceof WeaverError) return reason.reason;
    return new WeaverError("CANCELLED", "操作已取消");
  }
  return reason.type === "output-overflow"
    ? new WeaverError("OUTPUT_TOO_LARGE", "进程输出超过 32 MiB 上限")
    : new WeaverError("DEADLINE_EXCEEDED", "操作超过时限");
}

export async function processRun(
  command: string,
  args: string[],
  options: {
    cwd?: string;
    signal?: AbortSignal;
    timeoutMs?: number;
    env?: NodeJS.ProcessEnv;
  } = {},
): Promise<{ stdout: string; stderr: string }> {
  options.signal?.throwIfAborted();
  const resolvedCommand = resolveCommand(command);
  return new Promise((resolve, reject) => {
    const supervisorLaunchSpec = supervisorLaunch();
    const env = { ...(options.env ?? process.env) };
    env.PYTHONDONTWRITEBYTECODE = "1";
    env.PYTHONNOUSERSITE = "1";
    env.PYTHONPATH = "";
    delete env.PYTHONHOME;
    const supervisor = spawn(supervisorLaunchSpec.command, supervisorLaunchSpec.args, {
      cwd: options.cwd,
      env,
      detached: true,
      shell: false,
      stdio: ["pipe", "pipe", "pipe", "ipc"],
    });
    let stdout = "",
      stdoutBytes = 0,
      stderr = "",
      spawned = false,
      stopReason: StopReason | undefined,
      result: SupervisorResult | undefined,
      spawnFailure: string | undefined,
      protocolFailure: string | undefined,
      settled = false;
    const requestStop = (reason: StopReason): void => {
      if (stopReason) return;
      stopReason = reason;
      if (spawned && supervisor.connected)
        supervisor.send({ type: "stop" }, (error) => {
          if (error) protocolFailure ??= error.message;
        });
    };
    const timeout = setTimeout(
      () => requestStop({ type: "deadline" }),
      options.timeoutMs ?? 900000,
    );
    const abort = (): void =>
      requestStop({ type: "abort", reason: options.signal?.reason });
    if (options.signal?.aborted) abort();
    else options.signal?.addEventListener("abort", abort, { once: true });
    const cleanup = (): void => {
      clearTimeout(timeout);
      options.signal?.removeEventListener("abort", abort);
    };
    const rejectOnce = (error: WeaverError): void => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    supervisor.once("error", (error) => {
      rejectOnce(
        new WeaverError(
          "CONFIG_MISSING",
          `无法启动 ${command}: ${error.message}`,
          null,
          [`安装 ${command} 并检查 PATH`],
        ),
      );
    });
    const stdoutStream = supervisor.stdout;
    const stderrStream = supervisor.stderr;
    if (!stdoutStream || !stderrStream) {
      supervisor.kill("SIGKILL");
      rejectOnce(
        new WeaverError("PROCESS_FAILED", `${command} 监督进程缺少输出管道`),
      );
      return;
    }
    supervisor.once("spawn", () => {
      spawned = true;
      supervisor.send(
        { type: "start", command: resolvedCommand, args },
        (error?: Error | null) => {
          if (error) {
            protocolFailure ??= error.message;
            supervisor.kill("SIGTERM");
          }
        },
      );
      if (stopReason)
        supervisor.send({ type: "stop" }, (error) => {
          if (error) protocolFailure ??= error.message;
        });
    });
    stdoutStream.setEncoding("utf8");
    stderrStream.setEncoding("utf8");
    stdoutStream.on("data", (chunk: string) => {
      if (stdoutBytes > 32 * 1024 * 1024) return;
      stdoutBytes += Buffer.byteLength(chunk, "utf8");
      if (stdoutBytes > 32 * 1024 * 1024) {
        requestStop({ type: "output-overflow" });
        return;
      }
      stdout += chunk;
    });
    stderrStream.on("data", (chunk: string) => {
      stderr = (stderr + chunk).slice(-2 * 1024 * 1024);
    });
    supervisor.on("message", (value: unknown) => {
      const message = parseSupervisorMessage(value);
      if (!message) {
        protocolFailure ??= "媒体监督进程返回了无效状态";
        supervisor.kill("SIGTERM");
      } else if (message.type === "result") result = message;
      else spawnFailure = message.message;
    });
    supervisor.once("close", (supervisorCode) => {
      if (settled) return;
      cleanup();
      settled = true;
      if (spawnFailure) {
        reject(
          new WeaverError(
            "CONFIG_MISSING",
            `无法启动 ${command}: ${spawnFailure}`,
            null,
            [`安装 ${command} 并检查 PATH`],
          ),
        );
      } else if (stopReason) {
        reject(stopError(stopReason));
      } else if (!result) {
        reject(
          new WeaverError("PROCESS_FAILED", `${command} 执行失败`, {
            code: supervisorCode,
            diagnostic: protocolFailure ?? stderr.slice(-6000),
          }),
        );
      } else if (result.code !== 0) {
        reject(
          new WeaverError("PROCESS_FAILED", `${command} 执行失败`, {
            code: result.code,
            signal: result.signal,
            diagnostic: stderr.slice(-6000),
          }),
        );
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
}
