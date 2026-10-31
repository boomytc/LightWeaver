import { spawn } from "node:child_process";
import { WeaverError } from "../contracts/errors.ts";

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
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "",
      stderr = "",
      stopped = false;
    let killTimer: ReturnType<typeof setTimeout> | undefined;
    const kill = (signal: NodeJS.Signals): void => {
      if (child.pid) {
        try {
          process.kill(-child.pid, signal);
        } catch {
          /* 已退出 */
        }
      }
    };
    const stop = (): void => {
      stopped = true;
      kill("SIGTERM");
      killTimer ??= setTimeout(() => kill("SIGKILL"), 3000);
    };
    const timeout = setTimeout(stop, options.timeoutMs ?? 900000);
    options.signal?.addEventListener("abort", stop, { once: true });
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
      if (stdout.length > 32 * 1024 * 1024) stop();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = (stderr + chunk.toString()).slice(-2 * 1024 * 1024);
    });
    const cleanup = (): void => {
      clearTimeout(timeout);
      if (killTimer) clearTimeout(killTimer);
      options.signal?.removeEventListener("abort", stop);
    };
    child.on("error", (e) => {
      cleanup();
      reject(
        new WeaverError(
          "CONFIG_MISSING",
          `无法启动 ${command}: ${e.message}`,
          null,
          [`安装 ${command} 并检查 PATH`],
        ),
      );
    });
    child.on("close", (code) => {
      cleanup();
      if (stopped) {
        kill("SIGKILL");
        reject(
          new WeaverError(
            options.signal?.aborted ? "CANCELLED" : "DEADLINE_EXCEEDED",
            options.signal?.aborted ? "操作已取消" : "操作超过时限",
          ),
        );
      } else if (code !== 0)
        reject(
          new WeaverError("PROCESS_FAILED", `${command} 执行失败`, {
            code,
            diagnostic: stderr.slice(-6000),
          }),
        );
      else resolve({ stdout, stderr });
    });
  });
}
