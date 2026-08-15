import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { listProjects, loadProject } from "./project.ts";
import { hasErrors, isCompletedFilm, isRenderable, validateProject } from "./validate.ts";
import { weaverRoot } from "./paths.ts";
import { tryGetTask } from "./tasks/registry.ts";

describe("first-party films", () => {
  it("loads all first-party projects including unfinished scaffolds", () => {
    const ids = listProjects(weaverRoot()).map((project) => project.id);
    assert.ok(ids.includes("intent-cascade"));
    assert.ok(ids.includes("dropdown-taxonomy"));
    assert.ok(ids.includes("nav-taxonomy"));
    assert.ok(ids.includes("sidebar-taxonomy"));
  });

  it("completed lightui-lab films have no errors and are renderable", () => {
    const completed = listProjects(weaverRoot()).filter((item) => isCompletedFilm(item));
    assert.ok(completed.some((project) => project.id === "intent-cascade"));
    assert.ok(completed.some((project) => project.id === "dropdown-taxonomy"));
    for (const project of completed) {
      const issues = validateProject(project);
      assert.equal(hasErrors(issues), false, `${project.id}: ${JSON.stringify(issues.filter((i) => i.level === "error"))}`);
      assert.equal(isRenderable(project), true, project.id);
    }
  });

  it("nav/sidebar scaffolds have no errors but are not renderable", () => {
    for (const id of ["nav-taxonomy", "sidebar-taxonomy"]) {
      const project = loadProject(id);
      assert.equal(hasErrors(validateProject(project)), false, id);
      assert.equal(isRenderable(project), false, id);
    }
  });

  it("keeps narration on the scene", () => {
    const project = loadProject("intent-cascade");
    assert.equal(project.film.task, "study-explainer");
    assert.equal(project.film.study?.slug, "intent-cascade");
    const title = project.film.scenes.find((scene) => scene.id === "title");
    assert.ok(title?.lines.zh.includes("菜单意图预测"));
    assert.equal(project.film.scenes.find((scene) => scene.id === "problem")?.role, "problem");
  });

  it("does not throw on an unknown task", () => {
    assert.equal(tryGetTask("drama-plot"), undefined);
    const project = loadProject("intent-cascade");
    const fake = { ...project, film: { ...project.film, task: "drama-plot" } };
    const issues = validateProject(fake);
    assert.ok(issues.some((issue) => issue.path === "task" && issue.level === "error"));
  });
});
