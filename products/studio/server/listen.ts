import { randomBytes } from "node:crypto";
import fs from "node:fs";
import { developmentRuntime, type RuntimeContext } from "@lightweaver/weaver/app";
import { startStudioService } from "./service.ts";

if (process.versions.electron) {
  process.stderr.write("业务服务不能由 Electron 可执行文件启动\n");
  process.exit(1);
}

const desktop = process.argv.includes("--desktop");
const production = process.argv.includes("--production");
const launchFile = process.env.LIGHTWEAVER_LAUNCH_FILE;
let runtime: RuntimeContext = developmentRuntime();
let staticDir: string | undefined;
let devOrigins = [
  "http://127.0.0.1:5175",
  "http://localhost:5175",
  "http://127.0.0.1:4175",
  "http://localhost:4175",
];
if (launchFile) {
  const launch = JSON.parse(fs.readFileSync(launchFile, "utf8")) as {
    runtime: RuntimeContext;
    staticDir?: string;
    devOrigins?: string[];
  };
  runtime = launch.runtime;
  staticDir = launch.staticDir;
  if (launch.devOrigins) devOrigins = launch.devOrigins;
}
if (production && !staticDir) {
  process.stderr.write("生产服务缺少编译后的界面目录\n");
  process.exit(1);
}

const service = await startStudioService({
  mode: production ? "production" : "development",
  token: desktop || production ? randomBytes(32).toString("hex") : "",
  runtime,
  port: desktop || production ? 0 : Number(process.env.LIGHTWEAVER_API_PORT || 5176),
  staticDir: production ? staticDir : undefined,
  devOrigins,
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
if (desktop || production) {
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
