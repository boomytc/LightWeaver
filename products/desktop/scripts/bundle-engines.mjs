import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Application, developmentRuntime } from "@lightweaver/weaver/app";
import { BundledEngines } from "@lightweaver/weaver/contracts";

if (process.argv.length !== 4) throw new Error("需要应用资源目录与引擎构建缓存目录");
const [bundleRoot, engineRoot] = process.argv.slice(2).map((value) => path.resolve(value));
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "lightweaver-bundle-engines-"));
const runtime = developmentRuntime({
  LIGHTWEAVER_DATA_DIR: path.join(scratch, "state"),
  LIGHTWEAVER_CONFIG_FILE: path.join(scratch, "config.local.yaml"),
  LIGHTWEAVER_ENGINE_ROOT: engineRoot,
});
const app = new Application({ runtime });
try {
  const catalog = app.engines.catalog();
  const components = [];
  for (const item of catalog.items.filter((item) => item.kind !== "python-env")) {
    if (!item.available) throw new Error(`${item.name} 没有当前平台的固定产物`);
    const relative = `resources/engines/${item.id}`;
    const directory = path.join(bundleRoot, relative);
    const run = app.engines.install({ id: item.id, root: engineRoot, requestId: `bundle-${item.id}` });
    const result = await app.jobs.wait(run.id);
    if (result.state !== "succeeded") throw new Error(`${item.name} 安装失败：${result.error?.message || result.state}`);
    fs.cpSync(path.join(engineRoot, item.id), directory, { recursive: true, verbatimSymlinks: true });
    components.push({
      id: item.id,
      version: item.version,
      directory: relative,
      bindings: Object.fromEntries(item.bindings.map((binding) => [
        binding.setting,
        binding.target === "directory" ? relative : `${relative}/${binding.file}`,
      ])),
    });
  }
  const manifest = BundledEngines.parse({ schemaVersion: 1, platform: `${process.platform}-${process.arch}`, components });
  fs.writeFileSync(path.join(bundleRoot, "resources", "bundled-engines.json"), JSON.stringify(manifest, null, 2) + "\n");
} finally {
  app.close();
  fs.rmSync(scratch, { recursive: true, force: true });
}
