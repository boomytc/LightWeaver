import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const studio = join(root, "products/studio/src");
const files = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else files.push(path);
  }
};
walk(studio);

const violations = [];
const rel = (file) => relative(root, file);

const styleDir = join(studio, "styles");
const styleFiles = readdirSync(styleDir).filter((name) => name.endsWith(".css"));
const forbidden = /^\s*\.(grid|flex|hidden|card|block|inline|table|contents|fixed|sticky|absolute|relative|static)(?![-\w])/m;
for (const name of styleFiles) {
  const file = join(styleDir, name);
  const text = readFileSync(file, "utf8");
  if (forbidden.test(text)) {
    violations.push(`${rel(file)}: 组件类不得与 Tailwind utility 同名（禁止 .grid/.flex 等）`);
  }
}
const components = readFileSync(join(styleDir, "components.css"), "utf8");
if (!components.includes(".auto-card-grid")) {
  violations.push(`${rel(join(styleDir, "components.css"))}: 缺少 .auto-card-grid 组件类`);
}

for (const file of files) {
  const text = readFileSync(file, "utf8");
  const path = rel(file);
  if (file.endsWith(".tsx")) {
    if (text.includes("rounded-[")) violations.push(`${path}: 禁止 arbitrary 圆角，改用 rounded-sm/md/lg`);
    if (path.includes("products/studio/src/ui/") || path.includes("products/studio/src/shell/")) {
      const hex = text.match(/#[0-9a-fA-F]{3,8}\b/g);
      if (hex) violations.push(`${path}: UI/壳层不得硬编码颜色（${hex.slice(0, 3).join(", ")}）`);
    }
  }
  if (file.endsWith(".css") && !path.endsWith("styles/responsive.css")) {
    if (text.includes("!important")) {
      violations.push(`${path}: !important 只允许出现在 reduced-motion 响应式兜底`);
    }
  }
}

if (violations.length) {
  console.error("UI 样式检查失败：");
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(1);
}
console.log("UI 样式检查通过");
