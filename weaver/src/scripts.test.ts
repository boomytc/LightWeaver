import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { weaverScriptsRoot } from "./paths.ts";

describe("weaver scripts", () => {
  it("keeps job scripts next to the package, not LIGHTWEAVER_ROOT", () => {
    const folder = weaverScriptsRoot();
    assert.ok(folder.endsWith(`${path.sep}weaver${path.sep}scripts`));
    for (const name of ["tts.py", "asr.py", "capture.mjs", "paths.mjs", "lightui-lab-adapters.json"]) {
      assert.ok(fs.existsSync(path.join(folder, name)), name);
    }
  });
});
