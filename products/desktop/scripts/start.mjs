import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(root, "package.json"));
const compiled = spawnSync(process.execPath, [require.resolve("typescript/bin/tsc"), "-p", root, "--pretty", "false"], {
  stdio: "inherit",
});
if (compiled.status) process.exit(compiled.status);
const bundled = spawnSync(process.execPath, [path.join(root, "scripts/bundle-preload.mjs")], { stdio: "inherit" });
if (bundled.status) process.exit(bundled.status);
const electron = require("electron");
const child = spawn(electron, ["."], {
  cwd: root,
  stdio: "inherit",
  env: {
    ...process.env,
    LIGHTWEAVER_NODE: process.execPath,
  },
});
child.on("exit", (code) => process.exit(code ?? 0));
