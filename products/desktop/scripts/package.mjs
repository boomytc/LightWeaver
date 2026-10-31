import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const desktopRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(desktopRoot, "../..");
const require = createRequire(path.join(desktopRoot, "package.json"));
const electronVersion = require("electron/package.json").version;
if (!/^\d+\.\d+\.\d+/.test(electronVersion)) {
  throw new Error(`Electron 版本必须是已安装的固定号，当前是 ${electronVersion}`);
}
const staging = path.join(desktopRoot, "staging", "lightweaver");
const distFlag = process.argv.includes("--dist");
const platform = process.platform;
const arch = process.arch;
if (platform !== "darwin" || arch !== "arm64") {
  process.stderr.write(`当前打包脚本在这台机器上只准备 ${platform}/${arch} 的运行时；electron-builder 配置仍包含其他平台目标。\n`);
}

const pins = {
  node: {
    version: "22.23.4",
    url: "https://nodejs.org/dist/v22.23.4/node-v22.23.4-darwin-arm64.tar.gz",
    sha256: "",
  },
  ffmpeg: {
    version: "9.0.2",
    url: "https://ffmpeg.martin-riedl.de/download/macos/arm64/1789931890_9.0.2/ffmpeg.zip",
  },
  ffprobe: {
    version: "9.0.2",
    url: "https://ffmpeg.martin-riedl.de/download/macos/arm64/1789931890_9.0.2/ffprobe.zip",
  },
  chrome: {
    version: "149.0.7790.0",
    url: "https://storage.googleapis.com/chrome-for-testing-public/149.0.7790.0/mac-arm64/chrome-headless-shell-mac-arm64.zip",
    sha256: "17ef152eba8ffcfebc42e25ab295eb040d8e62455cff7dfcc735b652456d6899",
  },
};

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: "inherit", ...options });
  if (result.status) throw new Error(`${command} ${args.join(" ")} 退出 ${result.status}`);
}

function sha256(file) {
  const hash = createHash("sha256");
  hash.update(fs.readFileSync(file));
  return hash.digest("hex");
}

async function download(url, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  if (fs.existsSync(dest) && fs.statSync(dest).size > 0) return dest;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`下载失败 ${response.status} ${url}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(dest, bytes);
  return dest;
}

function extractTar(archive, dest) {
  fs.mkdirSync(dest, { recursive: true });
  run("tar", ["-xzf", archive, "-C", dest]);
}

function extractZip(archive, dest) {
  fs.mkdirSync(dest, { recursive: true });
  run("ditto", ["-x", "-k", archive, dest]);
}

function copyTree(from, to, filter = () => true) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    if (!filter(entry.name)) continue;
    const source = path.join(from, entry.name);
    const target = path.join(to, entry.name);
    if (entry.isDirectory()) copyTree(source, target, filter);
    else if (entry.isFile()) fs.copyFileSync(source, target);
  }
}

function executable(file) {
  fs.chmodSync(file, 0o755);
}

const cache = path.join(desktopRoot, "staging", "cache");
fs.rmSync(staging, { recursive: true, force: true });
fs.mkdirSync(staging, { recursive: true });

run(process.execPath, [require.resolve("typescript/bin/tsc"), "-p", desktopRoot, "--pretty", "false"]);
run(process.execPath, [path.join(repoRoot, "node_modules", "vite", "bin", "vite.js"), "build"], {
  cwd: path.join(repoRoot, "products", "studio"),
  env: { ...process.env },
});
fs.cpSync(path.join(repoRoot, "products", "studio", "dist"), path.join(staging, "ui"), { recursive: true });

const esbuildBin = require.resolve("esbuild/bin/esbuild");
fs.mkdirSync(path.join(staging, "service"), { recursive: true });
run(esbuildBin, [
  path.join(repoRoot, "products", "studio", "server", "listen.ts"),
  "--bundle",
  "--platform=node",
  "--format=esm",
  "--outfile=" + path.join(staging, "service", "server.mjs"),
  "--external:better-sqlite3",
  "--banner:js=import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
]);
run(esbuildBin, [
  path.join(repoRoot, "products", "study-films", "src", "render-card.ts"),
  "--bundle",
  "--platform=node",
  "--format=esm",
  "--outfile=" + path.join(staging, "service", "render.mjs"),
  "--external:react",
  "--external:react-dom",
  "--external:remotion",
  "--external:@remotion/bundler",
  "--external:@remotion/renderer",
]);

const nodeArchive = await download(pins.node.url, path.join(cache, "node.tar.gz"));
const sums = await (await fetch("https://nodejs.org/dist/v22.23.4/SHASUMS256.txt")).text();
const nodeSum = sums.split("\n").find((line) => line.endsWith("node-v22.23.4-darwin-arm64.tar.gz"))?.split(/\s+/)[0];
if (!nodeSum || sha256(nodeArchive) !== nodeSum) throw new Error("Node 校验失败");
extractTar(nodeArchive, path.join(cache, "node"));
fs.cpSync(path.join(cache, "node", "node-v22.23.4-darwin-arm64"), path.join(staging, "node"), { recursive: true });
executable(path.join(staging, "node", "bin", "node"));

const servicePkg = {
  name: "lightweaver-service",
  private: true,
  type: "module",
  dependencies: {
    "better-sqlite3": "12.6.2",
    react: "19.1.1",
    "react-dom": "19.1.1",
    remotion: "4.0.512",
    "@remotion/bundler": "4.0.512",
    "@remotion/renderer": "4.0.512",
  },
};
fs.writeFileSync(path.join(staging, "service", "package.json"), JSON.stringify(servicePkg, null, 2));
const cachedDeps = path.join(desktopRoot, "staging", "cache", "service-deps", "node_modules");
if (fs.existsSync(path.join(cachedDeps, "better-sqlite3", "build", "Release", "better_sqlite3.node"))) {
  fs.cpSync(cachedDeps, path.join(staging, "service", "node_modules"), { recursive: true });
} else {
  const sidecarNpm = path.join(staging, "node", "bin", "npm");
  const sidecarNode = path.join(staging, "node", "bin", "node");
  run(sidecarNode, [sidecarNpm, "install", "--omit=dev", "--no-audit", "--no-fund"], {
    cwd: path.join(staging, "service"),
    env: { ...process.env, npm_config_update_notifier: "false" },
  });
}

for (const name of ["ffmpeg", "ffprobe"]) {
  const archive = await download(pins[name].url, path.join(cache, `${name}.zip`));
  const sidecar = await download(`${pins[name].url}.sha256`, path.join(cache, `${name}.sha256`));
  const expected = fs.readFileSync(sidecar, "utf8").trim().split(/\s+/)[0];
  if (expected && sha256(archive) !== expected) throw new Error(`${name} 校验失败`);
  const extracted = path.join(cache, name);
  fs.rmSync(extracted, { recursive: true, force: true });
  extractZip(archive, extracted);
  const binary = fs.readdirSync(extracted).map((file) => path.join(extracted, file)).find((file) => fs.statSync(file).isFile());
  if (!binary) throw new Error(`${name} 压缩包里没有可执行文件`);
  const target = path.join(staging, "tools", name);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(binary, target);
  executable(target);
}

const chromeArchive = await download(pins.chrome.url, path.join(cache, "chrome.zip"));
if (sha256(chromeArchive) !== pins.chrome.sha256) throw new Error("卡片浏览器校验失败");
const chromeDir = path.join(cache, "chrome");
fs.rmSync(chromeDir, { recursive: true, force: true });
extractZip(chromeArchive, chromeDir);
const chromeBin = path.join(chromeDir, "chrome-headless-shell-mac-arm64", "chrome-headless-shell");
if (!fs.existsSync(chromeBin)) throw new Error("没有找到卡片浏览器可执行文件");
fs.mkdirSync(path.join(staging, "card", "browser"), { recursive: true });
fs.cpSync(path.join(chromeDir, "chrome-headless-shell-mac-arm64"), path.join(staging, "card", "browser"), { recursive: true });
executable(path.join(staging, "card", "browser", "chrome-headless-shell"));

run(process.execPath, ["--import", "tsx", path.join(desktopRoot, "scripts", "bundle-card.mjs"), path.join(staging, "card", "site")], {
  cwd: repoRoot,
});
const info = JSON.parse(spawnSync(process.execPath, ["--import", "tsx", path.join(repoRoot, "products", "study-films", "src", "render-card.ts"), "--describe"], {
  cwd: repoRoot,
  env: { ...process.env, LIGHTWEAVER_CHROME: path.join(staging, "card", "browser", "chrome-headless-shell") },
  encoding: "utf8",
}).stdout);
fs.writeFileSync(path.join(staging, "card", "info.json"), JSON.stringify(info));

const resources = path.join(staging, "resources");
copyTree(path.join(repoRoot, "library"), path.join(resources, "library"));
copyTree(path.join(repoRoot, "weaver", "scripts"), path.join(resources, "weaver", "scripts"), (name) => name !== "__pycache__" && !name.endsWith(".pyc"));
fs.mkdirSync(path.join(resources, "weaver", "src", "adapters"), { recursive: true });
for (const file of ["local-models.ts", "speech-models.ts"])
  fs.copyFileSync(
    path.join(repoRoot, "weaver", "src", "adapters", file),
    path.join(resources, "weaver", "src", "adapters", file),
  );
fs.copyFileSync(path.join(repoRoot, "weaver", "requirements.speech.txt"), path.join(resources, "weaver", "requirements.speech.txt"));
fs.copyFileSync(path.join(desktopRoot, "packaging", "NOTICES.md"), path.join(staging, "NOTICES.md"));
const icon = path.join(desktopRoot, "packaging", "icon.png");
if (fs.existsSync(icon)) fs.copyFileSync(icon, path.join(staging, "icon.png"));

const manifest = {
  platform,
  arch,
  node: pins.node.version,
  ffmpeg: pins.ffmpeg.version,
  chrome: pins.chrome.version,
  files: [
    ["node/bin/node", true],
    ["service/server.mjs", false],
    ["service/render.mjs", false],
    ["service/node_modules/better-sqlite3/package.json", false],
    ["tools/ffmpeg", true],
    ["tools/ffprobe", true],
    ["card/browser/chrome-headless-shell", true],
    ["card/site/index.html", false],
    ["card/info.json", false],
    ["resources/weaver/scripts/process-supervisor.mjs", false],
    ["resources/weaver/scripts/models.py", false],
    ["resources/library/assets.json", false],
    ["ui/index.html", false],
    ["NOTICES.md", false],
  ],
};
fs.writeFileSync(path.join(staging, "manifest.json"), JSON.stringify(manifest, null, 2));
run(process.execPath, [path.join(desktopRoot, "scripts", "check-resources.mjs"), staging]);

const builder = require("electron-builder");
await builder.build({
  config: {
    appId: "app.lightweaver.desktop",
    electronVersion,
    productName: "LightWeaver",
    executableName: "LightWeaver",
    directories: { output: path.join(desktopRoot, "release"), app: desktopRoot },
    files: ["dist/**", "static/**", "package.json"],
    extraResources: [{ from: staging, to: "lightweaver" }],
    icon: fs.existsSync(icon) ? icon : undefined,
    asar: true,
    npmRebuild: false,
    mac: {
      target: distFlag ? ["dir", "dmg", "zip"] : ["dir"],
      identity: null,
      notarize: false,
      category: "public.app-category.video",
    },
    win: { target: ["nsis"] },
    linux: { target: ["AppImage"] },
  },
});
process.stdout.write(`已生成 ${path.join(desktopRoot, "release")}\n`);
