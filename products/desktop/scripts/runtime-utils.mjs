import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export function sha256File(file) {
  const hash = createHash("sha256");
  const fd = fs.openSync(file, "r");
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  try {
    let count;
    while ((count = fs.readSync(fd, buffer, 0, buffer.length, null)) > 0)
      hash.update(buffer.subarray(0, count));
  } finally {
    fs.closeSync(fd);
  }
  return hash.digest("hex");
}

export function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    ...options,
  });
  if (result.error) {
    throw new Error(`${command} 无法启动：${result.error.message}`, {
      cause: result.error,
    });
  }
  if (result.status === null) {
    throw new Error(
      `${command} 未正常结束：${result.signal ? `signal=${result.signal}` : "status=null"}`,
    );
  }
  if (result.status !== 0) {
    const detail = `${result.stderr || ""}${result.stdout || ""}`.trim();
    throw new Error(
      `${command} ${args.join(" ")} 退出 ${result.status}${detail ? `\n${detail}` : ""}`,
    );
  }
  return result.stdout || "";
}

function atomicRename(source, destination) {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  if (fs.existsSync(destination)) fs.rmSync(destination, { recursive: true, force: true });
  fs.renameSync(source, destination);
}

export async function downloadVerified({ url, sha256, destination }) {
  if (fs.existsSync(destination) && sha256File(destination) === sha256)
    return destination;
  if (fs.existsSync(destination)) fs.rmSync(destination, { force: true });
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.${process.pid}.${randomUUID()}.part`;
  let response;
  try {
    response = await fetch(url, { redirect: "follow" });
    if (!response.ok)
      throw new Error(`下载失败 ${response.status} ${response.statusText}: ${url}`);
    const hash = createHash("sha256");
    const output = fs.openSync(temporary, "wx", 0o600);
    try {
      if (!response.body) throw new Error(`下载响应没有正文：${url}`);
      for await (const chunk of response.body) {
        const bytes = Buffer.from(chunk);
        hash.update(bytes);
        fs.writeSync(output, bytes);
      }
      fs.fsyncSync(output);
    } finally {
      fs.closeSync(output);
    }
    const actual = hash.digest("hex");
    if (actual !== sha256) {
      throw new Error(`下载校验失败 ${url}\n期望 ${sha256}\n实际 ${actual}`);
    }
    const fd = fs.openSync(temporary, "r");
    try {
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    atomicRename(temporary, destination);
    return destination;
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

export function extractArchive(archive, destination, target) {
  fs.rmSync(destination, { recursive: true, force: true });
  fs.mkdirSync(destination, { recursive: true });
  if (archive.endsWith(".zip") && target.platform === "darwin") {
    run("ditto", ["-x", "-k", archive, destination], { stdio: "pipe" });
    return;
  }
  if (archive.endsWith(".zip") && target.platform === "linux") {
    run("unzip", ["-q", archive, "-d", destination], { stdio: "pipe" });
    return;
  }
  run("tar", ["-xf", archive, "-C", destination], { stdio: "pipe" });
}

export function copyTree(source, destination, filter = () => true) {
  fs.mkdirSync(destination, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    if (!filter(entry.name)) continue;
    const from = path.join(source, entry.name);
    const to = path.join(destination, entry.name);
    if (entry.isDirectory()) copyTree(from, to, filter);
    else if (entry.isSymbolicLink()) {
      fs.rmSync(to, { recursive: true, force: true });
      fs.symlinkSync(fs.readlinkSync(from), to);
    }
    else if (entry.isFile()) {
      fs.copyFileSync(from, to);
      fs.chmodSync(to, fs.statSync(from).mode & 0o777);
    }
  }
}

export function copyDirectoryContents(source, destination) {
  fs.mkdirSync(destination, { recursive: true });
  for (const entry of fs.readdirSync(source))
    fs.cpSync(path.join(source, entry), path.join(destination, entry), {
      recursive: true,
      force: true,
      verbatimSymlinks: true,
    });
}

export function makeExecutable(file) {
  if (process.platform !== "win32") fs.chmodSync(file, 0o755);
}

export function walkTree(root, skip = new Set()) {
  const entries = [];
  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      const relative = path.relative(root, absolute).split(path.sep).join("/");
      if (skip.has(relative)) continue;
      if (entry.isDirectory()) visit(absolute);
      else entries.push({ absolute, relative, entry });
    }
  }
  visit(root);
  return entries.sort((left, right) => left.relative.localeCompare(right.relative));
}

export function treeDigest(root, skip = new Set()) {
  const hash = createHash("sha256");
  for (const { absolute, relative, entry } of walkTree(root, skip)) {
    hash.update(relative);
    hash.update("\0");
    if (entry.isSymbolicLink()) {
      hash.update("link\0");
      hash.update(fs.readlinkSync(absolute));
    } else {
      hash.update("file\0");
      hash.update(sha256File(absolute));
    }
    hash.update("\0");
  }
  return hash.digest("hex");
}

export function readCompleteMarker(root) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, ".complete.json"), "utf8"));
  } catch {
    return null;
  }
}

export function completeCache({
  root,
  marker,
  verify,
}) {
  if (!fs.existsSync(root)) return false;
  const recorded = readCompleteMarker(root);
  if (!recorded) return false;
  for (const [key, value] of Object.entries(marker)) {
    if (recorded[key] !== value) return false;
  }
  const treeSha256 = treeDigest(root, new Set([".complete.json"]));
  if (recorded.treeSha256 !== treeSha256) return false;
  return verify ? verify(root) : true;
}

export function finalizeCache({ staging, destination, marker }) {
  const treeSha256 = treeDigest(staging);
  fs.writeFileSync(
    path.join(staging, ".complete.json"),
    JSON.stringify({ ...marker, treeSha256 }, null, 2) + "\n",
    { mode: 0o600 },
  );
  atomicRename(staging, destination);
  return treeSha256;
}
