import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { listProjects, loadProject } from "./project.ts";
import { setLangs, setVoice } from "./scenes.ts";
import { hasErrors, isCompletedFilm, isRenderable, validateProject } from "./validate.ts";
import { tryGetTask } from "./tasks/registry.ts";
import { seedLabFilm, tempWorkspace } from "./test-workspace.ts";
import fs from "node:fs";
import path from "node:path";

describe("first-party films", () => {
  it("lists first-party and user roots from a workspace", () => {
    const root = tempWorkspace();
    seedLabFilm(root, "intent-cascade", [{ id: "status", file: "status.png", role: "problem" }]);
    const ids = listProjects(root).map((project) => project.id);
    assert.deepEqual(ids, ["intent-cascade"]);
  });

  it("treats a lab film with stills as completed and renderable", () => {
    const root = tempWorkspace();
    const project = seedLabFilm(
      root,
      "intent-cascade",
      [
        { id: "status", file: "status.png", role: "problem" },
        { id: "contrast", file: "contrast.png", role: "contrast" },
      ],
      { writePng: true },
    );
    assert.equal(isCompletedFilm(project, root), true);
    assert.equal(isRenderable(project, root), true);
    assert.equal(hasErrors(validateProject(project, root)), false);
  });

  it("is not renderable when the official still file is missing", () => {
    const root = tempWorkspace();
    const project = seedLabFilm(root, "nav-taxonomy", [
      { id: "floating", file: "floating.png", role: "contrast" },
    ]);
    assert.equal(hasErrors(validateProject(project, root)), false);
    assert.equal(isRenderable(project, root), false);
  });

  it("keeps narration on the scene", () => {
    const root = tempWorkspace();
    const project = seedLabFilm(root, "intent-cascade", [
      { id: "status", file: "status.png", role: "problem" },
    ]);
    assert.equal(project.film.task, "study-explainer");
    assert.equal(project.film.study?.slug, "intent-cascade");
    assert.equal(project.film.scenes.find((scene) => scene.id === "status")?.role, "problem");
  });

  it("warns when study-explainer copy uses leaf jargon", () => {
    const root = tempWorkspace();
    const project = seedLabFilm(root, "dropdown-taxonomy", [
      { id: "cascader", file: "cascader-open.png", role: "contrast" },
    ]);
    const fake = {
      ...project,
      film: {
        ...project.film,
        scenes: project.film.scenes.map((scene) =>
          scene.id === "cascader"
            ? { ...scene, lines: { zh: "必须走到叶子", en: "must reach a leaf" } }
            : scene,
        ),
      },
    };
    const issues = validateProject(fake, root);
    assert.ok(issues.some((issue) => issue.level === "warning" && issue.message.includes("叶子")));
    assert.ok(issues.some((issue) => issue.level === "warning" && issue.message.includes("leaf")));
  });

  it("warns when zh and en point at different voice refs", () => {
    const root = tempWorkspace();
    const project = seedLabFilm(root, "intent-cascade", [{ id: "status", file: "status.png", role: "problem" }]);
    setVoice(project, "en", "library:voice.other");
    const issues = validateProject(project, root);
    assert.ok(issues.some((issue) => issue.path === "voices" && issue.message.includes("同一套音色")));
  });

  it("does not require the unselected language", () => {
    const root = tempWorkspace();
    const project = seedLabFilm(
      root,
      "intent-cascade",
      [{ id: "status", file: "status.png", role: "problem" }],
      { writePng: true },
    );
    fs.rmSync(path.join(project.root, "assets/stills/en/status.png"), { force: true });
    setLangs(project, ["zh"]);
    const issues = validateProject(project, root);
    assert.equal(hasErrors(issues), false);
    assert.equal(isRenderable(project, root), true);
    assert.ok(!issues.some((issue) => issue.path.includes(".en") && issue.level === "error"));
  });

  it("does not throw on an unknown task", () => {
    assert.equal(tryGetTask("drama-plot"), undefined);
    const root = tempWorkspace();
    seedLabFilm(root, "intent-cascade", [{ id: "status", file: "status.png", role: "problem" }]);
    const project = loadProject("intent-cascade", root);
    const fake = { ...project, film: { ...project.film, task: "drama-plot" } };
    const issues = validateProject(fake, root);
    assert.ok(issues.some((issue) => issue.path === "task" && issue.level === "error"));
  });
});
