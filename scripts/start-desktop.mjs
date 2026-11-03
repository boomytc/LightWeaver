#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);

if (args.length === 1 && (args[0] === "--help" || args[0] === "-h")) {
  process.stdout.write("LightWeaver 源码桌面启动\n\n首次准备：安装 Node.js 22.13+（22.x）或 24.x，在项目目录运行 npm ci。\n启动：npm start，或使用根目录的系统启动脚本。\n媒体工具与模型环境：见 docs/development.md。\n");
} else {
  try {
    if (args.length) throw new Error("不支持的启动参数。运行 npm start -- --help 查看说明。");
    const [major, minor] = process.versions.node.split(".").map(Number);
    if (!((major === 22 && minor >= 13) || major === 24))
      throw new Error(`当前 Node.js ${process.versions.node} 不受支持。请使用 22.13+ 的 22.x 或 24.x。`);
    const require = createRequire(path.join(root, "products", "desktop", "package.json"));
    try {
      for (const dependency of ["typescript/bin/tsc", "esbuild", "vite", "better-sqlite3"])
        require.resolve(dependency);
      const electron = require("electron");
      if (typeof electron !== "string" || !fs.existsSync(electron))
        throw new Error("Electron 可执行文件缺失");
    } catch {
      throw new Error("项目依赖或 Electron 未安装完整。先在项目目录执行 npm ci，再重新启动。");
    }
    process.chdir(root);
    process.stdout.write("正在启动 LightWeaver 源码桌面窗口…\n");
    await import("../products/desktop/scripts/start.mjs");
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
