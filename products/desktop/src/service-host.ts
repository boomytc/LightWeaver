import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export type ServiceReady = {
  port: number;
  origin: string;
  token: string;
};

export class ServiceHost {
  private child: ChildProcess | null = null;
  private token = "";

  constructor(private readonly logFile: string) {}

  async start(input: {
    nodePath: string;
    args: string[];
    cwd: string;
    env: NodeJS.ProcessEnv;
    onExit?: (code: number | null) => void;
  }): Promise<ServiceReady> {
    await this.stop();
    fs.mkdirSync(path.dirname(this.logFile), { recursive: true });
    const child = spawn(input.nodePath, input.args, {
      cwd: input.cwd,
      env: input.env,
      stdio: ["ignore", "pipe", "pipe", "ipc"],
      windowsHide: true,
    });
    this.child = child;
    const log = fs.createWriteStream(this.logFile, { flags: "a" });
    const write = (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      log.write(this.token ? text.split(this.token).join("[redacted]") : text);
    };
    child.stdout?.on("data", write);
    child.stderr?.on("data", write);
    const ready = await new Promise<ServiceReady>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error("本地服务在 30 秒内没有完成握手"));
      }, 30_000);
      const fail = (message: string) => {
        clearTimeout(timer);
        reject(new Error(message));
      };
      child.once("error", (error) => fail(error.message));
      child.once("exit", (code) => fail(`本地服务在就绪前退出（${code ?? "无代码"}）`));
      child.on("message", (value: unknown) => {
        if (!value || typeof value !== "object") return;
        const message = value as { type?: string; port?: number; origin?: string; token?: string };
        if (message.type !== "ready" || !message.port || !message.origin || !message.token) return;
        if (!message.origin.startsWith("http://127.0.0.1:")) {
          fail("服务握手返回了非回环地址");
          return;
        }
        clearTimeout(timer);
        child.removeAllListeners("exit");
        this.token = message.token;
        child.once("exit", (code) => {
          if (this.child === child) this.child = null;
          input.onExit?.(code);
        });
        resolve({ port: message.port, origin: message.origin, token: message.token });
      });
    }).catch(async (error: unknown) => {
      await this.stop();
      throw error;
    });
    return ready;
  }

  async stop(): Promise<void> {
    const child = this.child;
    this.child = null;
    this.token = "";
    if (!child || child.exitCode !== null || child.killed) return;
    const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
    child.kill("SIGTERM");
    const done = await Promise.race([
      exited.then(() => true),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 8_000)),
    ]);
    if (!done) child.kill("SIGKILL");
    await exited;
  }

  get running(): boolean {
    return !!this.child && this.child.exitCode === null;
  }
}
