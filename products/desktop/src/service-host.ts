import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export type ServiceReady = {
  port: number;
  origin: string;
  token: string;
  generation: number;
};

type ServiceInstance = {
  generation: number;
  child: ChildProcess;
  log: fs.WriteStream;
  secrets: string[];
  cancelled: boolean;
  ready: boolean;
  logFailed: boolean;
};

export class ServiceStartCancelledError extends Error {
  constructor() {
    super("本地服务启动已取消");
    this.name = "ServiceStartCancelledError";
  }
}

function sensitiveEnvironmentValues(env: NodeJS.ProcessEnv): string[] {
  return Object.entries(env)
    .filter(
      ([key, value]) =>
        !!value &&
        /(?:API_KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)/i.test(key),
    )
    .map(([, value]) => value as string)
    .sort((left, right) => right.length - left.length);
}

function redact(value: string, secrets: readonly string[]): string {
  let text = value;
  for (const secret of [...secrets].sort(
    (left, right) => right.length - left.length,
  )) {
    if (secret) text = text.split(secret).join("[redacted]");
  }
  return text;
}

export class ServiceHost {
  private active: ServiceInstance | null = null;
  private latestGeneration = 0;
  private serial: Promise<void> = Promise.resolve();
  private readonly terminations = new Set<Promise<void>>();

  async start(input: {
    nodePath: string;
    args: string[];
    cwd: string;
    env: NodeJS.ProcessEnv;
    logFile: string;
    onExit?: (code: number | null) => void;
  }): Promise<ServiceReady> {
    const generation = ++this.latestGeneration;
    this.cancelActive();
    try {
      return await this.enqueue(async () => {
        this.assertCurrent(generation);
        await this.waitForTerminations();
        this.assertCurrent(generation);
        fs.mkdirSync(path.dirname(input.logFile), { recursive: true });
        const logFd = fs.openSync(input.logFile, "a", 0o600);
        let log: fs.WriteStream;
        try {
          log = fs.createWriteStream(input.logFile, {
            fd: logFd,
            flags: "a",
            mode: 0o600,
          });
        } catch (error) {
          fs.closeSync(logFd);
          throw error;
        }
        let child: ChildProcess;
        try {
          child = spawn(input.nodePath, input.args, {
            cwd: input.cwd,
            env: input.env,
            stdio: ["ignore", "pipe", "pipe", "ipc"],
            windowsHide: true,
          });
        } catch (error) {
          log.destroy();
          throw error;
        }
        let rejectLogFailure!: (error: Error) => void;
        const logFailure = new Promise<never>((_resolve, reject) => {
          rejectLogFailure = reject;
        });
        const instance: ServiceInstance = {
          generation,
          child,
          log,
          secrets: sensitiveEnvironmentValues(input.env),
          cancelled: false,
          ready: false,
          logFailed: false,
        };
        const logFailureError = (error: Error): Error =>
          new Error(
            `无法写入服务日志 ${input.logFile}：${redact(error.message, instance.secrets)}`,
          );
        const failLog = (failure: Error): void => {
          if (instance.logFailed) return;
          instance.logFailed = true;
          if (!instance.ready) {
            rejectLogFailure(failure);
            return;
          }
          if (this.active === instance) this.trackTermination(instance);
        };
        const writeLog = (value: string): void => {
          if (instance.logFailed || log.destroyed || log.writableEnded) return;
          try {
            log.write(value);
          } catch (error) {
            const failure =
              error instanceof Error ? error : new Error(String(error));
            failLog(logFailureError(failure));
          }
        };
        log.on("error", (error) => {
          failLog(logFailureError(error));
        });
        this.active = instance;
        const writer = (
          stream: NodeJS.ReadableStream | null,
        ): (() => void) => {
          let pending = "";
          const flush = () => {
            if (!pending) return;
            writeLog(redact(pending, instance.secrets));
            pending = "";
          };
          stream?.on("data", (chunk: Buffer) => {
            pending += chunk.toString("utf8");
            let newline = pending.indexOf("\n");
            while (newline >= 0) {
              writeLog(
                redact(pending.slice(0, newline + 1), instance.secrets),
              );
              pending = pending.slice(newline + 1);
              newline = pending.indexOf("\n");
            }
          });
          return flush;
        };
        const flushStdout = writer(child.stdout);
        const flushStderr = writer(child.stderr);
        child.on("close", () => {
          flushStdout();
          flushStderr();
          if (!log.destroyed && !log.writableEnded) log.end();
        });
        child.on("error", (error) => {
          writeLog(
            `service process error: ${redact(error.message, instance.secrets)}\n`,
          );
        });
        try {
          const ready = await Promise.race([
            this.waitForReady(instance),
            logFailure,
          ]);
          child.once("exit", (code) => {
            if (this.active !== instance) return;
            this.active = null;
            input.onExit?.(code);
          });
          return { ...ready, generation };
        } catch (error) {
          if (this.active === instance) this.active = null;
          instance.cancelled = true;
          await this.terminate(instance);
          if (!log.destroyed && !log.writableEnded) log.end();
          this.assertCurrent(generation);
          throw error;
        }
      });
    } catch (error) {
      if (generation !== this.latestGeneration)
        throw new ServiceStartCancelledError();
      throw error;
    }
  }

  stop(): Promise<void> {
    ++this.latestGeneration;
    this.cancelActive();
    return this.enqueue(() => this.waitForTerminations());
  }

  get running(): boolean {
    return !!this.active;
  }

  get generation(): number {
    return this.latestGeneration;
  }

  private assertCurrent(generation: number): void {
    if (generation !== this.latestGeneration)
      throw new ServiceStartCancelledError();
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.serial.then(operation, operation);
    this.serial = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private cancelActive(): void {
    const instance = this.active;
    if (!instance) return;
    this.active = null;
    instance.cancelled = true;
    this.trackTermination(instance);
  }

  private trackTermination(instance: ServiceInstance): void {
    const termination = this.terminate(instance).finally(() => {
      this.terminations.delete(termination);
    });
    this.terminations.add(termination);
    void termination.catch(() => undefined);
  }

  private async waitForTerminations(): Promise<void> {
    while (this.terminations.size) {
      await Promise.all([...this.terminations]);
    }
  }

  private async waitForReady(
    instance: ServiceInstance,
  ): Promise<{ port: number; origin: string; token: string }> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const fail = (error: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        instance.child.removeListener("error", onError);
        instance.child.removeListener("exit", onExit);
        instance.child.removeListener("message", onMessage);
        reject(error);
      };
      const timer = setTimeout(
        () => fail(new Error("本地服务在 30 秒内没有完成握手")),
        30_000,
      );
      const onError = (error: Error) => fail(new Error(error.message));
      const onExit = (code: number | null) =>
        fail(new Error(`本地服务在就绪前退出（${code ?? "无代码"}）`));
      const onMessage = (value: unknown) => {
        if (settled || !value || typeof value !== "object") return;
        const message = value as {
          type?: string;
          port?: number;
          origin?: string;
          token?: string;
        };
        if (message.type !== "ready") return;
        if (
          !Number.isInteger(message.port) ||
          (message.port || 0) < 1 ||
          (message.port || 0) > 65_535 ||
          typeof message.origin !== "string" ||
          typeof message.token !== "string" ||
          !message.token ||
          message.token.length > 4096
        ) {
          fail(new Error("本地服务握手字段无效"));
          return;
        }
        let origin: URL;
        try {
          origin = new URL(message.origin);
        } catch {
          fail(new Error("本地服务握手返回了无效地址"));
          return;
        }
        if (
          origin.protocol !== "http:" ||
          origin.hostname !== "127.0.0.1" ||
          origin.port !== String(message.port) ||
          origin.origin !== message.origin ||
          origin.pathname !== "/"
        ) {
          fail(new Error("服务握手返回了非回环地址"));
          return;
        }
        if (this.active !== instance || instance.cancelled) {
          fail(new ServiceStartCancelledError());
          return;
        }
        instance.ready = true;
        settled = true;
        clearTimeout(timer);
        instance.child.removeListener("error", onError);
        instance.child.removeListener("exit", onExit);
        instance.child.removeListener("message", onMessage);
        instance.secrets.push(message.token);
        resolve({
          port: message.port as number,
          origin: message.origin,
          token: message.token,
        });
      };
      instance.child.once("error", onError);
      instance.child.once("exit", onExit);
      instance.child.on("message", onMessage);
    });
  }

  private async terminate(instance: ServiceInstance): Promise<void> {
    const child = instance.child;
    if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
    const exited = new Promise<void>((resolve) =>
      child.once("exit", () => resolve()),
    );
    child.kill("SIGTERM");
    let timeout: NodeJS.Timeout | undefined;
    const done = await Promise.race([
      exited.then(() => true),
      new Promise<boolean>((resolve) => {
        timeout = setTimeout(() => resolve(false), 8_000);
      }),
    ]);
    if (timeout) clearTimeout(timeout);
    if (!done && child.exitCode === null && child.signalCode === null) {
      child.kill("SIGKILL");
      await exited;
    }
  }
}
