import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(root, "package.json"));
const result = spawnSync(
  require.resolve("esbuild/bin/esbuild"),
  [
    path.join(root, "src/preload.ts"),
    "--bundle",
    "--platform=node",
    "--format=cjs",
    "--external:electron",
    `--outfile=${path.join(root, "dist/preload.js")}`,
  ],
  { stdio: "inherit" },
);
if (result.status) process.exit(result.status);
