import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { createProject, listProjects, loadProject } from "./project.ts";
import { resolveAssetFile } from "./assets.ts";
import { firstPartyRoot } from "./paths.ts";
import { seedLabFilm, tempWorkspace } from "./test-workspace.ts";

describe("createProject", () => {
  it("writes a user project under data/projects", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "weaver-"));
    fs.mkdirSync(path.join(root, "library"), { recursive: true });
    fs.writeFileSync(path.join(root, "library/assets.json"), `${JSON.stringify({ assets: [] })}\n`);
    const project = createProject("demo-film", { title: "演示" }, root);
    assert.equal(project.source, "user");
    assert.equal(project.film.locales.zh.title, "演示");
    assert.equal(project.film.task, "study-explainer");
    assert.deepEqual(project.film.scenes.map((scene) => scene.id), ["title", "hero", "close"]);
    assert.ok(fs.existsSync(path.join(root, "data/projects/demo-film/film.json")));
    assert.equal(listProjects(root).length, 1);
    assert.equal(loadProject("demo-film", root).id, "demo-film");
  });
});

describe("resolveAssetFile", () => {
  it("resolves locale still files from assets.json, not the scene id", () => {
    const root = tempWorkspace();
    const project = seedLabFilm(root, "intent-cascade", [{ id: "status", file: "status.png", role: "problem" }], {
      writePng: true,
    });
    assert.ok(project.root.startsWith(firstPartyRoot(root)));
    const resolved = resolveAssetFile(project, "asset:still.status", "zh", root);
    assert.ok(resolved);
    assert.ok(resolved.absPath.endsWith("assets/stills/zh/status.png"));
    assert.ok(fs.existsSync(resolved.absPath));
  });
});
