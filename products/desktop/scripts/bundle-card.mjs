import path from "node:path";
import { bundle } from "@remotion/bundler";

const outDir = path.resolve(process.argv[2]);
const entryPoint = path.resolve("products/study-films/src/card-entry.tsx");
await bundle({ entryPoint, outDir, publicDir: null });
process.stdout.write(`卡片页面 ${outDir}\n`);
