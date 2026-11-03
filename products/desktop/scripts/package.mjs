import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import {
  FFMPEG_VERSION,
  NODE_ABI,
  NODE_VERSION,
  PYTHON_RELEASE,
  PYTHON_VERSION,
  parsePackageTarget,
} from "./platforms.mjs";
import {
  copyDirectoryContents,
  copyTree,
  completeCache,
  downloadVerified,
  extractArchive,
  finalizeCache,
  makeExecutable,
  run,
  sha256File,
  walkTree,
} from "./runtime-utils.mjs";

const desktopRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(desktopRoot, "../..");
const require = createRequire(path.join(desktopRoot, "package.json"));
const electronVersion = require("electron/package.json").version;
if (!/^\d+\.\d+\.\d+/.test(electronVersion))
  throw new Error(`Electron 版本必须是已安装的固定号，当前是 ${electronVersion}`);

const args = process.argv.slice(2);
const knownFlags = new Set(["--dist", "--prepare"]);
for (const arg of args) {
  if (!knownFlags.has(arg) && !/^--(?:target|platform|arch)=/.test(arg))
    throw new Error(`未知参数 ${arg}`);
}
const dist = args.includes("--dist");
const prepareOnly = args.includes("--prepare");
if (dist && prepareOnly) throw new Error("--dist 与 --prepare 不能同时使用");
const target = parsePackageTarget(args);
const targetName = `${target.platform}-${target.arch}`;
const stagingRoot = path.join(desktopRoot, "staging");
const staging = path.join(stagingRoot, "lightweaver");
const cache = path.join(stagingRoot, "cache");
const targetCache = path.join(cache, targetName);
const work = path.join(targetCache, "work");

const requirements = path.join(repoRoot, "weaver", "requirements.txt");
if (!fs.existsSync(requirements)) throw new Error(`缺少 Python 依赖清单：${requirements}`);
const requirementsSha256 = sha256File(requirements);
const pythonPins = fs.readFileSync(requirements, "utf8").split(/\r?\n/).flatMap((line) => {
  const match = /^([A-Za-z0-9._-]+)==([A-Za-z0-9._-]+)$/.exec(line.trim());
  return match ? [[match[1], match[2]]] : [];
});
const trackedConfig = path.join(repoRoot, "config.yaml");
if (!fs.existsSync(trackedConfig))
  throw new Error(`缺少内置配置默认值：${trackedConfig}`);
const sidecarSource = path.join(desktopRoot, "packaging", "sidecar");
const sidecarPackage = path.join(sidecarSource, "package.json");
const sidecarLock = path.join(sidecarSource, "package-lock.json");
if (!fs.existsSync(sidecarPackage) || !fs.existsSync(sidecarLock))
  throw new Error("sidecar package.json 或 package-lock.json 缺失");
const sidecarLockSha256 = sha256File(sidecarLock);
const pythonVerification = [
  "import pathlib, site, sys",
  "assert not site.ENABLE_USER_SITE",
  "assert all(pathlib.Path(p).resolve().is_relative_to(pathlib.Path(sys.prefix).resolve()) for p in sys.path if p and 'site-packages' in p)",
  "import importlib.metadata as m, opentimelineio, pyJianYingDraft, numpy, torch, torchaudio, qwen_asr, voxcpm",
  `for name, version in ${JSON.stringify(pythonPins)}:`,
  "    assert m.version(name) == version, f'{name}: expected {version}, got {m.version(name)}'",
].join("\n");
const isolatedPythonEnv = { ...process.env, PYTHONNOUSERSITE: "1", PYTHONDONTWRITEBYTECODE: "1", PYTHONPATH: "" };
delete isolatedPythonEnv.PYTHONHOME;

function archivePath(name) {
  return path.join(targetCache, name);
}

async function obtainArchive(name, pin) {
  return downloadVerified({
    url: pin.url,
    sha256: pin.sha256,
    destination: archivePath(name),
  });
}

function extractNamed(archive, name) {
  const destination = path.join(work, name);
  extractArchive(archive, destination, target);
  return destination;
}

function copyLaunchers() {
  fs.mkdirSync(path.join(staging, "bin"), { recursive: true });
  const source = path.join(desktopRoot, "packaging", "launch");
  if (target.platform === "win32") {
    fs.copyFileSync(
      path.join(source, "weaver.cmd"),
      path.join(staging, target.cliLauncher),
    );
  } else {
    fs.copyFileSync(
      path.join(source, "weaver"),
      path.join(staging, target.cliLauncher),
    );
    makeExecutable(path.join(staging, target.cliLauncher));
  }
}

function verifySqlite(root, node) {
  const stagePackage = path.join(root, "package.json");
  const script = [
    `const p=require(${JSON.stringify(stagePackage)});`,
    "if(p.name!=='lightweaver-desktop-sidecar')throw new Error('sidecar 身份不符');",
    "const D=require('better-sqlite3');",
    "const d=new D(':memory:');",
    "const row=d.prepare('select 42 as value').get();",
    "if(row.value!==42)throw new Error('SQLite 查询结果不符');",
    "d.close();",
    "if(!require('playwright/package.json').version)throw new Error('Playwright 不可用');",
  ].join("");
  run(node, ["-e", script], {
    cwd: root,
    env: { ...process.env, NODE_PATH: path.join(root, "node_modules") },
    stdio: "pipe",
  });
  const compositor = path.join(root, "node_modules", target.remotionCompositor);
  const remotion = path.join(
    compositor,
    target.platform === "win32" ? "remotion.exe" : "remotion",
  );
  if (!fs.existsSync(remotion))
    throw new Error(`sidecar 缺少 Remotion compositor：${target.remotionCompositor}`);
}

function npmCliPath(nodeRoot) {
  const candidates =
    target.platform === "win32"
      ? [
          path.join(nodeRoot, "node_modules", "npm", "bin", "npm-cli.js"),
          path.join(nodeRoot, "lib", "node_modules", "npm", "bin", "npm-cli.js"),
        ]
      : [
          path.join(nodeRoot, "lib", "node_modules", "npm", "bin", "npm-cli.js"),
          path.join(nodeRoot, "node_modules", "npm", "bin", "npm-cli.js"),
        ];
  const npm = candidates.find(fs.existsSync);
  if (!npm) throw new Error(`随包 Node 中缺少 npm CLI：${nodeRoot}`);
  return npm;
}

function installSidecar(nodeRoot, node) {
  fs.mkdirSync(path.join(staging, "service"), { recursive: true });
  const cacheKey = [
    targetName,
    `node${NODE_VERSION}`,
    `abi${NODE_ABI}`,
    sidecarLockSha256.slice(0, 20),
  ].join("-");
  const sidecarCacheRoot = path.join(cache, "sidecar");
  const destination = path.join(sidecarCacheRoot, cacheKey);
  const marker = {
    cacheKey,
    platform: target.platform,
    arch: target.arch,
    node: NODE_VERSION,
    abi: NODE_ABI,
    lockSha256: sidecarLockSha256,
  };
  fs.mkdirSync(sidecarCacheRoot, { recursive: true });
  const valid = completeCache({
    root: destination,
    marker,
    verify: (root) => {
      verifySqlite(root, node);
      return true;
    },
  });
  if (!valid) {
    fs.rmSync(destination, { recursive: true, force: true });
    const building = path.join(
      sidecarCacheRoot,
      `.build-${cacheKey}-${process.pid}-${Date.now()}`,
    );
    fs.rmSync(building, { recursive: true, force: true });
    try {
      fs.mkdirSync(building, { recursive: true });
      fs.copyFileSync(sidecarPackage, path.join(building, "package.json"));
      fs.copyFileSync(sidecarLock, path.join(building, "package-lock.json"));
      run(
        node,
        [
          npmCliPath(nodeRoot),
          "ci",
          "--omit=dev",
          "--no-audit",
          "--no-fund",
        ],
        {
          cwd: building,
          env: {
            ...process.env,
            PATH: `${path.dirname(node)}${path.delimiter}${process.env.PATH || ""}`,
            PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: "1",
            npm_config_update_notifier: "false",
          },
          stdio: "inherit",
        },
      );
      verifySqlite(building, node);
      finalizeCache({ staging: building, destination, marker });
    } finally {
      fs.rmSync(building, { recursive: true, force: true });
    }
  }
  copyTree(destination, path.join(staging, "service"), (name) =>
    name !== ".complete.json" && name !== ".gitkeep",
  );
}

function installPython(pythonExtraction) {
  const pythonCacheRoot = path.join(cache, "python-env");
  const cacheKey = [
    targetName,
    `python${PYTHON_VERSION}`,
    target.python.sha256.slice(0, 16),
    requirementsSha256.slice(0, 16),
  ].join("-");
  const destination = path.join(pythonCacheRoot, cacheKey);
  const marker = {
    cacheKey,
    platform: target.platform,
    arch: target.arch,
    python: PYTHON_VERSION,
    pythonRelease: PYTHON_RELEASE,
    archiveSha256: target.python.sha256,
    requirementsSha256,
  };
  fs.mkdirSync(pythonCacheRoot, { recursive: true });
  const pythonFile = path.join(destination, target.tools.python);
  const valid = completeCache({
    root: destination,
    marker,
    verify: () => {
      run(pythonFile, ["-c", pythonVerification], { env: isolatedPythonEnv, stdio: "pipe" });
      return true;
    },
  });
  if (!valid) {
    fs.rmSync(destination, { recursive: true, force: true });
    const building = path.join(
      pythonCacheRoot,
      `.build-${cacheKey}-${process.pid}-${Date.now()}`,
    );
    fs.rmSync(building, { recursive: true, force: true });
    try {
      fs.mkdirSync(building, { recursive: true });
      const prefix = path.join(building, "python");
      copyDirectoryContents(pythonExtraction, prefix);
      const prefixRelative = target.tools.python.replace(/^python[\\/]/, "");
      const sourcePython = path.join(pythonExtraction, prefixRelative);
      run(
        sourcePython,
        [
          "-c",
          "import pathlib,sys; assert pathlib.Path(sys.prefix).resolve() == pathlib.Path(__import__('os').environ['PYTHONHOME']).resolve()",
        ],
        {
          env: { ...isolatedPythonEnv, PYTHONHOME: prefix },
          stdio: "pipe",
        },
      );
      run(
        sourcePython,
        [
          "-m",
          "pip",
          "install",
          "--no-cache-dir",
          "--disable-pip-version-check",
          "--requirement",
          requirements,
        ],
        {
          env: {
            ...isolatedPythonEnv,
            PIP_DISABLE_PIP_VERSION_CHECK: "1",
            PYTHONDONTWRITEBYTECODE: "1",
            PYTHONHOME: prefix,
          },
          stdio: "inherit",
        },
      );
      run(sourcePython, ["-c", pythonVerification], {
        env: {
          ...isolatedPythonEnv,
          PYTHONDONTWRITEBYTECODE: "1",
          PYTHONHOME: prefix,
        },
        stdio: "pipe",
      });
      fs.writeFileSync(path.join(prefix, ".lightweaver-engine.json"), JSON.stringify({
        schemaVersion: 1,
        id: "python-runtime",
        version: requirementsSha256.slice(0, 12),
        platform: targetName,
        sourceSha256: requirementsSha256,
        installedAt: new Date().toISOString(),
      }) + "\n");
      finalizeCache({ staging: building, destination, marker });
    } finally {
      fs.rmSync(building, { recursive: true, force: true });
    }
  }
  copyTree(destination, staging, (name) =>
    name !== ".complete.json" && name !== "__pycache__" && !name.endsWith(".pyc"),
  );
  if (target.platform === "win32") {
    fs.rmSync(path.join(staging, "python", "Scripts"), { recursive: true, force: true });
  } else {
    const bin = path.join(staging, "python", "bin");
    for (const entry of fs.readdirSync(bin)) {
      if (!["python", "python3", "python3.12"].includes(entry))
        fs.rmSync(path.join(bin, entry), { recursive: true, force: true });
    }
  }
  run(path.join(staging, target.tools.python), ["-c", pythonVerification], {
    env: isolatedPythonEnv,
    stdio: "pipe",
  });
}

function copyResources() {
  const resources = path.join(staging, "resources");
  copyTree(path.join(repoRoot, ".agents", "skills"), path.join(resources, ".agents", "skills"));
  fs.mkdirSync(path.join(resources, "docs"), { recursive: true });
  fs.copyFileSync(path.join(repoRoot, "AGENTS.md"), path.join(resources, "AGENTS.md"));
  fs.copyFileSync(path.join(repoRoot, "docs", "conventions.md"), path.join(resources, "docs", "conventions.md"));
  fs.copyFileSync(trackedConfig, path.join(resources, "config.yaml"));
  copyTree(path.join(repoRoot, "library"), path.join(resources, "library"));
  copyTree(
    path.join(repoRoot, "weaver", "scripts"),
    path.join(resources, "weaver", "scripts"),
    (name) => name !== "__pycache__" && !name.endsWith(".pyc"),
  );
  fs.mkdirSync(path.join(resources, "weaver", "src", "adapters"), {
    recursive: true,
  });
  for (const file of ["local-models.ts", "speech-models.ts"]) {
    fs.copyFileSync(
      path.join(repoRoot, "weaver", "src", "adapters", file),
      path.join(resources, "weaver", "src", "adapters", file),
    );
  }
  fs.copyFileSync(requirements, path.join(resources, "weaver", "requirements.txt"));
  fs.copyFileSync(
    path.join(desktopRoot, "packaging", "NOTICES.md"),
    path.join(staging, "NOTICES.md"),
  );
  const icon = path.join(desktopRoot, "packaging", "icon.png");
  if (fs.existsSync(icon)) fs.copyFileSync(icon, path.join(staging, "icon.png"));
}

function writeRuntimeContract() {
  fs.writeFileSync(
    path.join(staging, "runtime-tools.json"),
    JSON.stringify(target.tools, null, 2) + "\n",
  );
}

function createManifest() {
  const files = walkTree(staging).map(({ absolute, relative, entry }) => {
    if (entry.isSymbolicLink()) {
      return {
        path: relative,
        type: "symlink",
        target: fs.readlinkSync(absolute).split(path.sep).join("/"),
      };
    }
    const stat = fs.statSync(absolute);
    return {
      path: relative,
      sha256: sha256File(absolute),
      ...(target.platform !== "win32" && (stat.mode & 0o111) !== 0
        ? { executable: true }
        : {}),
    };
  });
  const remotionRelative = `service/node_modules/${target.remotionCompositor}/remotion${target.platform === "win32" ? ".exe" : ""}`;
  const native = [
    target.tools.node,
    target.tools.ffmpeg,
    target.tools.ffprobe,
    target.tools.cardBrowser,
    target.tools.python,
    "service/node_modules/better-sqlite3/build/Release/better_sqlite3.node",
    remotionRelative,
    ...walkTree(path.join(staging, "resources", "engines"))
      .filter(({ entry, relative }) => entry.isFile() && /\.(?:dylib|so|dll|exe)$/.test(relative))
      .map(({ relative }) => `resources/engines/${relative}`),
  ].map((nativePath) => ({ path: nativePath }));
  const manifest = {
    schemaVersion: 1,
    platform: target.platform,
    arch: target.arch,
    runtime: {
      node: { version: NODE_VERSION, abi: NODE_ABI },
      python: { version: PYTHON_VERSION, release: PYTHON_RELEASE },
      ffmpeg: FFMPEG_VERSION,
      chrome: target.chrome.version,
    },
    tools: target.tools,
    sidecar: {
      lockSha256: sidecarLockSha256,
      remotionCompositor: target.remotionCompositor,
    },
    native,
    files,
  };
  fs.writeFileSync(
    path.join(staging, "manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n",
  );
}

function checkResources(root, mode) {
  run(
    process.execPath,
    [
      path.join(desktopRoot, "scripts", "check-resources.mjs"),
      root,
      `--expect=${targetName}`,
    ],
    { stdio: "inherit" },
  );
  process.stdout.write(`${mode}资源核验通过：${root}\n`);
}

function verifyRuntime(root, label) {
  const node = path.join(root, target.tools.node);
  const sqlite = path.join(root, "service", "node_modules", "better-sqlite3");
  const script = [
    `const D=require(${JSON.stringify(sqlite)});`,
    "const d=new D(':memory:');",
    "const value=d.prepare('select 42 as value').get().value;",
    "d.close();",
    "if(value!==42)throw new Error('SQLite 内存查询失败');",
  ].join("");
  run(node, ["-e", script], { cwd: root, stdio: "pipe" });
  run(path.join(root, target.tools.python), ["-c", pythonVerification], {
    env: isolatedPythonEnv,
    stdio: "pipe",
  });
  process.stdout.write(`${label}运行时查询通过\n`);
}

function packagedResourceRoot() {
  const release = path.join(desktopRoot, "release");
  if (target.platform === "darwin") {
    const directory = "mac-arm64";
    return path.join(
      release,
      directory,
      "LightWeaver.app",
      "Contents",
      "Resources",
      "lightweaver",
    );
  }
  if (target.platform === "win32")
    return path.join(release, "win-unpacked", "resources", "lightweaver");
  return path.join(release, "linux-unpacked", "resources", "lightweaver");
}

async function prepare() {
  fs.rmSync(staging, { recursive: true, force: true });
  fs.mkdirSync(staging, { recursive: true });
  fs.mkdirSync(targetCache, { recursive: true });
  fs.mkdirSync(work, { recursive: true });

  const nodeArchive = await obtainArchive(
    `node-${NODE_VERSION}.${target.platform === "win32" ? "zip" : "tar.gz"}`,
    target.node,
  );
  const nodeExtraction = extractNamed(nodeArchive, "node");
  const nodeSource = path.join(nodeExtraction, target.node.root);
  if (!fs.existsSync(nodeSource)) throw new Error("Node 归档目录不正确");
  copyDirectoryContents(nodeSource, path.join(staging, "node"));
  const nodeRoot = path.join(staging, "node");
  const node = path.join(staging, target.tools.node);
  if (!fs.existsSync(node)) throw new Error(`Node 可执行文件位置不正确：${target.tools.node}`);
  makeExecutable(node);
  const nodeVersions = JSON.parse(
    run(node, [
      "-p",
      "JSON.stringify({version:process.versions.node,abi:process.versions.modules})",
    ], { stdio: "pipe" }),
  );
  if (nodeVersions.version !== NODE_VERSION || nodeVersions.abi !== NODE_ABI)
    throw new Error(
      `Node 运行时不符：${nodeVersions.version}/ABI ${nodeVersions.abi}`,
    );

  run(
    process.execPath,
    [
      require.resolve("typescript/bin/tsc"),
      "-p",
      desktopRoot,
      "--pretty",
      "false",
    ],
    { stdio: "inherit" },
  );
  run(
    process.execPath,
    [path.join(desktopRoot, "scripts", "bundle-preload.mjs")],
    { stdio: "inherit" },
  );
  run(
    process.execPath,
    [path.join(repoRoot, "node_modules", "vite", "bin", "vite.js"), "build"],
    { cwd: path.join(repoRoot, "products", "studio"), stdio: "inherit" },
  );
  fs.cpSync(
    path.join(repoRoot, "products", "studio", "dist"),
    path.join(staging, "ui"),
    { recursive: true },
  );

  const esbuild = require.resolve("esbuild/bin/esbuild");
  fs.mkdirSync(path.join(staging, "service"), { recursive: true });
  const esmBanner =
    "--banner:js=import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);";
  run(
    esbuild,
    [
      path.join(repoRoot, "products", "studio", "server", "listen.ts"),
      "--bundle",
      "--platform=node",
      "--format=esm",
      `--outfile=${path.join(staging, "service", "server.mjs")}`,
      "--external:better-sqlite3",
      esmBanner,
    ],
    { stdio: "inherit" },
  );
  run(
    esbuild,
    [
      path.join(repoRoot, "weaver", "src", "desktop-cli.ts"),
      "--bundle",
      "--platform=node",
      "--format=esm",
      `--outfile=${path.join(staging, "service", "cli.mjs")}`,
      "--external:better-sqlite3",
      esmBanner,
    ],
    { stdio: "inherit" },
  );
  run(
    esbuild,
    [
      path.join(repoRoot, "products", "study-films", "src", "render-card.ts"),
      "--bundle",
      "--platform=node",
      "--format=esm",
      `--outfile=${path.join(staging, "service", "render.mjs")}`,
      "--external:react",
      "--external:react-dom",
      "--external:remotion",
      "--external:@remotion/bundler",
      "--external:@remotion/renderer",
    ],
    { stdio: "inherit" },
  );

  installSidecar(nodeRoot, node);
  copyLaunchers();

  const mediaExtractions = new Map();
  for (const [name, pin] of Object.entries(target.mediaArchives)) {
    const archive = await obtainArchive(
      `${name}-${FFMPEG_VERSION}.zip`,
      pin,
    );
    mediaExtractions.set(name, extractNamed(archive, `media-${name}`));
  }
  fs.mkdirSync(path.join(staging, "tools"), { recursive: true });
  for (const name of ["ffmpeg", "ffprobe"]) {
    const artifact = target.mediaArtifacts[name];
    const source = path.join(mediaExtractions.get(artifact.archive), artifact.path);
    if (!fs.existsSync(source)) throw new Error(`${name} 的归档内文件名不正确：${artifact.path}`);
    const destination = path.join(staging, target.tools[name]);
    fs.copyFileSync(source, destination);
    makeExecutable(destination);
  }

  const chromeArchive = await obtainArchive(
    `chrome-${target.chrome.version}.zip`,
    target.chrome,
  );
  const chromeExtraction = extractNamed(chromeArchive, "chrome");
  const chromeSource = path.join(chromeExtraction, target.chrome.root);
  if (!fs.existsSync(chromeSource)) throw new Error("Chrome 归档目录不正确");
  const browserRoot = path.join(staging, "card", "browser");
  copyDirectoryContents(chromeSource, browserRoot);
  makeExecutable(path.join(staging, target.tools.cardBrowser));

  run(
    node,
    [
      "--import",
      "tsx",
      path.join(desktopRoot, "scripts", "bundle-card.mjs"),
      path.join(staging, "card", "site"),
    ],
    { cwd: repoRoot, stdio: "inherit" },
  );
  const describe = run(
    node,
    [
      "--import",
      "tsx",
      path.join(repoRoot, "products", "study-films", "src", "render-card.ts"),
      "--describe",
    ],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        LIGHTWEAVER_CHROME: path.join(staging, target.tools.cardBrowser),
      },
      stdio: "pipe",
    },
  );
  fs.writeFileSync(
    path.join(staging, "card", "info.json"),
    JSON.stringify(JSON.parse(describe)),
  );

  const pythonArchive = await obtainArchive("python.tar.gz", target.python);
  const pythonExtraction = extractNamed(pythonArchive, "python");
  const pythonSource = path.join(pythonExtraction, target.python.root);
  if (!fs.existsSync(pythonSource)) throw new Error("Python 归档目录不正确");
  installPython(pythonSource);
  copyResources();
  run(node, ["--import", "tsx", path.join(desktopRoot, "scripts", "bundle-engines.mjs"),
    staging, path.join(targetCache, "engines"), target.tools.python], { cwd: repoRoot, stdio: "inherit" });
  writeRuntimeContract();
  createManifest();
  checkResources(staging, "staging ");
  verifyRuntime(staging, "staging ");
}

await prepare();
if (prepareOnly) {
  process.stdout.write(`已准备 ${targetName} staging，未调用 electron-builder\n`);
  process.exit(0);
}

const output = path.join(desktopRoot, "release");
const staleOutput =
  target.platform === "darwin"
    ? path.join(output, "mac-arm64")
    : target.platform === "win32"
      ? path.join(output, "win-unpacked")
      : path.join(output, "linux-unpacked");
fs.rmSync(staleOutput, { recursive: true, force: true });
const icon = path.join(desktopRoot, "packaging", "icon.png");
const builder = require("electron-builder");
await builder.build({
  config: {
    appId: "app.lightweaver.desktop",
    electronVersion,
    productName: "LightWeaver",
    executableName: "LightWeaver",
    directories: { output, app: desktopRoot },
    files: ["dist/**", "static/**", "package.json"],
    extraResources: [{ from: staging, to: "lightweaver" }],
    icon: fs.existsSync(icon) ? icon : undefined,
    asar: true,
    npmRebuild: false,
    mac: {
      target: dist ? ["dir", "dmg", "zip"] : ["dir"],
      identity: null,
      notarize: false,
      category: "public.app-category.video",
    },
    win: { target: dist ? ["dir", "nsis"] : ["dir"] },
    linux: { target: dist ? ["dir", "AppImage"] : ["dir"] },
  },
});
const finalResources = packagedResourceRoot();
if (!fs.existsSync(finalResources))
  throw new Error(`最终包 Resources 未找到：${finalResources}`);
checkResources(finalResources, "最终包");
verifyRuntime(finalResources, "最终包");
process.stdout.write(`已生成 ${output}\n`);
