import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { bundle } from "@remotion/bundler";

const outDir = path.resolve(process.argv[2]);
const entryPoint = path.resolve("products/study-films/src/card-entry.tsx");
const publicDir = fs.mkdtempSync(path.join(os.tmpdir(), "lightweaver-card-public-"));
try {
  await bundle({ entryPoint, outDir, publicDir });
} finally {
  fs.rmSync(publicDir, { recursive: true, force: true });
}
process.stdout.write(`卡片页面 ${outDir}\n`);
