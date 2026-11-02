import fs from "node:fs";
import path from "node:path";
import { walkTree, sha256File } from "./runtime-utils.mjs";

function usage() {
  process.stderr.write(
    "用法: node scripts/check-resources.mjs <lightweaver 资源目录> [--expect=target]\n",
  );
  process.exit(1);
}

function nativeArchitecture(file) {
  const fd = fs.openSync(file, "r");
  const header = Buffer.alloc(4096);
  const length = fs.readSync(fd, header, 0, header.length, 0);
  fs.closeSync(fd);
  if (length < 20) return "unknown";
  if (
    header[0] === 0xcf &&
    header[1] === 0xfa &&
    header[2] === 0xed &&
    header[3] === 0xfe
  ) {
    const cpu = header.readUInt32LE(4);
    if (cpu === 0x01000007) return "x64";
    if (cpu === 0x0100000c) return "arm64";
    return `macho-${cpu.toString(16)}`;
  }
  if (
    header[0] === 0x7f &&
    header.toString("ascii", 1, 4) === "ELF" &&
    header[4] === 2
  ) {
    const machine = header.readUInt16LE(18);
    if (machine === 62) return "x64";
    if (machine === 183) return "arm64";
    return `elf-${machine}`;
  }
  if (header[0] === 0x4d && header[1] === 0x5a && length >= 64) {
    const peOffset = header.readUInt32LE(0x3c);
    if (
      peOffset + 6 <= length &&
      header.readUInt32LE(peOffset) === 0x00004550
    ) {
      const machine = header.readUInt16LE(peOffset + 4);
      if (machine === 0x8664) return "x64";
      if (machine === 0xaa64) return "arm64";
      return `pe-${machine.toString(16)}`;
    }
  }
  return "unknown";
}

const args = process.argv.slice(2);
const rootArg = args.find((arg) => !arg.startsWith("--"));
if (!rootArg) usage();
const expectedArg = args.find((arg) => arg.startsWith("--expect="));
const expected = expectedArg?.slice("--expect=".length);
const root = path.resolve(rootArg);
let manifest;
try {
  manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
} catch (error) {
  process.stderr.write(`无法读取 ${path.join(root, "manifest.json")}：${error.message}\n`);
  process.exit(1);
}
const target = `${manifest.platform}-${manifest.arch}`;
const problems = [];
const platforms = new Set(["darwin", "linux", "win32"]);
const arches = new Set(["arm64", "x64"]);
if (!platforms.has(manifest.platform))
  problems.push(`manifest.platform 无效：${String(manifest.platform)}`);
if (!arches.has(manifest.arch))
  problems.push(`manifest.arch 无效：${String(manifest.arch)}`);
if (expected && expected !== target)
  problems.push(`资源目标 ${target} 与期望 ${expected} 不一致`);
const toolNames = [
  "node",
  "ffmpeg",
  "ffprobe",
  "supervisor",
  "cardRenderer",
  "cardBrowser",
  "cardSite",
  "python",
];
let runtimeTools;
try {
  runtimeTools = JSON.parse(
    fs.readFileSync(path.join(root, "runtime-tools.json"), "utf8"),
  );
  if (!runtimeTools || typeof runtimeTools !== "object" || Array.isArray(runtimeTools))
    throw new Error("必须是对象");
  const keys = Object.keys(runtimeTools);
  if (
    keys.length !== toolNames.length ||
    toolNames.some((name) => !keys.includes(name))
  )
    throw new Error(`字段必须且只能包含 ${toolNames.join(", ")}`);
  for (const name of toolNames) {
    const value = runtimeTools[name];
    if (
      typeof value !== "string" ||
      !value ||
      path.isAbsolute(value) ||
      value.split(/[\\/]/).includes("..")
    )
      throw new Error(`${name} 必须是资源根内的相对路径`);
    if (
      manifest.tools &&
      typeof manifest.tools === "object" &&
      manifest.tools[name] !== value
    )
      throw new Error(`manifest.tools.${name} 与 runtime-tools.json 不一致`);
    if (!fs.existsSync(path.join(root, value)))
      throw new Error(`${name} 指向的路径不存在`);
  }
} catch (error) {
  problems.push(`runtime-tools.json 无效：${error.message}`);
}
if (!Array.isArray(manifest.files)) {
  problems.push("manifest.files 必须是数组");
} else {
  const listed = new Set();
  for (const entry of manifest.files) {
    if (
      !entry ||
      typeof entry.path !== "string" ||
      !entry.path ||
      path.isAbsolute(entry.path) ||
      entry.path.split(/[\\/]/).includes("..")
    ) {
      problems.push(`manifest 包含无效路径：${JSON.stringify(entry)}`);
      continue;
    }
    if (listed.has(entry.path)) problems.push(`manifest 重复收录 ${entry.path}`);
    listed.add(entry.path);
    const file = path.resolve(root, entry.path);
    if (!file.startsWith(root + path.sep)) {
      problems.push(`${entry.path} 越出资源根`);
      continue;
    }
    let info;
    try {
      info = fs.lstatSync(file);
    } catch {
      problems.push(`缺少 ${entry.path}`);
      continue;
    }
    if (entry.type === "symlink") {
      if (!info.isSymbolicLink()) {
        problems.push(`${entry.path} 应为符号链接`);
        continue;
      }
      const link = fs.readlinkSync(file);
      if (link.split(path.sep).join("/") !== entry.target)
        problems.push(`${entry.path} 的符号链接目标不匹配`);
      if (path.isAbsolute(link) || path.win32.isAbsolute(link))
        problems.push(`${entry.path} 不允许绝对符号链接`);
      try {
        const resolved = fs.realpathSync(file);
        const canonicalRoot = fs.realpathSync(root);
        if (resolved !== canonicalRoot && !resolved.startsWith(canonicalRoot + path.sep))
          problems.push(`${entry.path} 的符号链接越出资源根`);
      } catch {
        problems.push(`${entry.path} 的符号链接目标不存在`);
      }
      continue;
    }
    if (!info.isFile()) {
      problems.push(`${entry.path} 不是普通文件`);
      continue;
    }
    if (entry.executable && process.platform !== "win32" && (info.mode & 0o111) === 0)
      problems.push(`${entry.path} 不可执行`);
    if (typeof entry.sha256 !== "string" || sha256File(file) !== entry.sha256)
      problems.push(`${entry.path} 的 SHA-256 不匹配`);
  }
  const unlisted = walkTree(root)
    .map((item) => item.relative)
    .filter((relative) => relative !== "manifest.json" && !listed.has(relative));
  if (unlisted.length)
    problems.push(
      `manifest 未收录文件：${unlisted.slice(0, 20).join(", ")}${unlisted.length > 20 ? ` 等 ${unlisted.length} 个` : ""}`,
    );
}

for (const item of manifest.native ?? []) {
  if (typeof item?.path !== "string") {
    problems.push("manifest.native 含无效条目");
    continue;
  }
  const file = path.join(root, item.path);
  if (!fs.existsSync(file)) continue;
  const actual = nativeArchitecture(file);
  if (actual !== manifest.arch)
    problems.push(`${item.path} 架构为 ${actual}，期望 ${manifest.arch}`);
}

const requiredByPlatform = {
  darwin: [
    "node/bin/node",
    "card/browser/chrome-headless-shell",
    "bin/weaver",
  ],
  linux: [
    "node/bin/node",
    "card/browser/chrome-headless-shell",
    "bin/weaver",
  ],
  win32: [
    "node/node.exe",
    "card/browser/chrome-headless-shell.exe",
    "bin/weaver.cmd",
  ],
};
for (const relative of [
  ...(requiredByPlatform[manifest.platform] ?? []),
  "service/server.mjs",
  "service/cli.mjs",
  "service/render.mjs",
  "service/node_modules/better-sqlite3/build/Release/better_sqlite3.node",
  "service/node_modules/playwright/package.json",
  "service/node_modules/playwright-core/package.json",
  "card/site/index.html",
  "resources/config.yaml",
  "resources/bundled-engines.json",
  "resources/weaver/requirements.txt",
  "resources/weaver/requirements.models.txt",
  "resources/weaver/requirements.speech.txt",
]) {
  if (!fs.existsSync(path.join(root, relative)))
    problems.push(`缺少必需资源 ${relative}`);
}
try {
  const engines = JSON.parse(fs.readFileSync(path.join(root, "resources", "bundled-engines.json"), "utf8"));
  const expectedIds = ["transcribe-native", "transcribe-bindings", "ten-vad", "llama-server"];
  if (engines.schemaVersion !== 1 || engines.platform !== target || !Array.isArray(engines.components) ||
      engines.components.length !== expectedIds.length ||
      expectedIds.some((id) => !engines.components.some((item) => item.id === id)))
    throw new Error("缺少基础组件或平台不符");
  for (const component of engines.components) {
    if (!component.version || !component.bindings || !Object.keys(component.bindings).length)
      throw new Error(`${component.id} 的版本或绑定无效`);
    for (const value of [component.directory, ...Object.values(component.bindings)]) {
      if (typeof value !== "string" || !value || path.isAbsolute(value) || path.win32.isAbsolute(value) ||
          value.split(/[\\/]/).includes("..") || !fs.existsSync(path.join(root, value)))
        throw new Error(`${component.id} 的随包路径无效`);
      const canonical = fs.realpathSync(path.join(root, value));
      if (!canonical.startsWith(fs.realpathSync(root) + path.sep))
        throw new Error(`${component.id} 的绑定越出资源根`);
    }
  }
} catch (error) {
  problems.push(`随包运行环境无效：${error.message}`);
}
if (
  !manifest.tools ||
  typeof manifest.tools !== "object" ||
  typeof manifest.tools.python !== "string"
) {
  problems.push("manifest.tools.python 无效");
} else if (!fs.existsSync(path.join(root, manifest.tools.python))) {
  problems.push("随包 Python 不存在");
}

if (
  !manifest.sidecar ||
  typeof manifest.sidecar.remotionCompositor !== "string"
) {
  problems.push("manifest.sidecar.remotionCompositor 无效");
} else {
  const remotionBinary =
    manifest.platform === "win32"
      ? `service/node_modules/${manifest.sidecar.remotionCompositor}/remotion.exe`
      : `service/node_modules/${manifest.sidecar.remotionCompositor}/remotion`;
  if (!fs.existsSync(path.join(root, remotionBinary)))
    problems.push(`缺少 Remotion compositor ${remotionBinary}`);
}

const banned = walkTree(root)
  .map((item) => item.relative)
  .filter(
    (relative) =>
      /\.(gguf|safetensors|onnx)$/i.test(relative) ||
      /(?:^|[\\/])(?:MiniCPM|qwen3-asr|EmbeddingGemma)(?:[\\/]|$)/i.test(relative),
  );
if (banned.length) problems.push(`安装包不应包含模型权重：${banned.join(", ")}`);

if (problems.length) {
  process.stderr.write(problems.join("\n") + "\n");
  process.exit(1);
}
process.stdout.write(`资源清单通过 ${target} ${root}\n`);
