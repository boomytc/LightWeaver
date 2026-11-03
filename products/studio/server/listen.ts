import { randomBytes } from "node:crypto";
import fs from "node:fs";
import { workspaceRuntime, type RuntimeContext } from "@lightweaver/weaver/app";
import { startStudioService } from "./service.ts";

if (process.versions.electron) {
  process.stderr.write("业务服务不能由 Electron 可执行文件启动\n");
  process.exit(1);
}

const desktop = process.argv.includes("--desktop");
const launchFile = process.env.LIGHTWEAVER_LAUNCH_FILE;
let runtime: RuntimeContext = workspaceRuntime();
let clientOrigins = [
  "http://127.0.0.1:5175",
  "http://localhost:5175",
  "http://127.0.0.1:4175",
  "http://localhost:4175",
];
if (launchFile) {
  const launch = JSON.parse(fs.readFileSync(launchFile, "utf8")) as {
    runtime: RuntimeContext;
    clientOrigins?: string[];
  };
  runtime = launch.runtime;
  if (launch.clientOrigins) clientOrigins = launch.clientOrigins;
}

const service = await startStudioService({
  token: desktop ? randomBytes(32).toString("hex") : "",
  runtime,
  port: desktop ? 0 : Number(process.env.LIGHTWEAVER_API_PORT || 5176),
  clientOrigins,
});

let closed = false;
async function shutdown() {
  if (closed) return;
  closed = true;
  await service.close();
  process.exit(0);
}
process.once("SIGTERM", () => void shutdown());
process.once("SIGINT", () => void shutdown());
if (desktop) {
  const parent = process.ppid;
  const timer = setInterval(() => {
    try {
      process.kill(parent, 0);
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "ESRCH"
      )
        void shutdown();
    }
  }, 1000);
  timer.unref();
  process.on("disconnect", () => void shutdown());
  process.send?.({
    type: "ready",
    port: service.port,
    origin: service.origin,
    token: service.token,
  });
} else process.stderr.write(`LightWeaver API ${service.origin}\n`);
