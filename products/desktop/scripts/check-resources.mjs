import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.argv[2] || "");
if (!root) {
  process.stderr.write("用法: check-resources.mjs <lightweaver 资源目录>\n");
  process.exit(1);
}
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
const problems = [];
for (const [relative, shouldExecute] of manifest.files) {
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) {
    problems.push(`缺少 ${relative}`);
    continue;
  }
  const stat = fs.statSync(file);
  if (!stat.isFile()) problems.push(`${relative} 不是文件`);
  if (shouldExecute && (stat.mode & 0o111) === 0) problems.push(`${relative} 不可执行`);
  if (shouldExecute && process.platform === "darwin") {
    const info = spawnSync("file", [file], { encoding: "utf8" }).stdout || "";
    if (!info.includes("arm64") && manifest.arch === "arm64") problems.push(`${relative} 不是 arm64：${info.trim()}`);
  }
}
const banned = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules") continue;
      walk(file);
    } else if (/\.(gguf|safetensors|onnx)$/i.test(entry.name) || /MiniCPM|qwen3-asr|EmbeddingGemma/i.test(entry.name)) {
      banned.push(path.relative(root, file));
    }
  }
}
walk(root);
if (banned.length) problems.push(`安装包不应包含模型权重：${banned.join(", ")}`);
if (!fs.existsSync(path.join(root, "service", "node_modules", "better-sqlite3")))
  problems.push("better-sqlite3 不在 sidecar node_modules");
const asar = path.join(root, "service", "node_modules");
if (asar.includes("app.asar")) problems.push("sidecar 依赖不能放在 app.asar");
if (problems.length) {
  process.stderr.write(problems.join("\n") + "\n");
  process.exit(1);
}
process.stdout.write(`资源清单通过 ${root}\n`);
