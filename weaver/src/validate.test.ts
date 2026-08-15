import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { listProjects } from "./project.ts";
import { hasErrors, validateProject } from "./validate.ts";
import { weaverRoot } from "./paths.ts";

describe("first-party films", () => {
  it("loads intent-cascade and dropdown-taxonomy", () => {
    const ids = listProjects(weaverRoot()).map((project) => project.id);
    assert.ok(ids.includes("intent-cascade"));
    assert.ok(ids.includes("dropdown-taxonomy"));
  });

  it("has no catalog errors", () => {
    for (const project of listProjects(weaverRoot())) {
      const issues = validateProject(project);
      assert.equal(hasErrors(issues), false, `${project.id}: ${JSON.stringify(issues.filter((i) => i.level === "error"))}`);
    }
  });

  it("keeps narration on the scene", () => {
    const project = listProjects(weaverRoot()).find((item) => item.id === "intent-cascade");
    assert.ok(project);
    const title = project.film.scenes.find((scene) => scene.id === "title");
    assert.ok(title?.lines.zh.includes("菜单意图预测"));
    assert.equal(title?.kind, "title");
    const still = project.film.scenes.find((scene) => scene.id === "problem");
    assert.equal(still?.still, "asset:still.problem");
  });
});
