import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createProject } from "./project.ts";
import { applyRecipe, listRecipes } from "./recipes.ts";
import { addScene, patchScene } from "./scenes.ts";
import { hasErrors, isRenderable, validateProject } from "./validate.ts";
import { weaverRoot } from "./paths.ts";
import { seedFootageFilm, tempWorkspace } from "./test-workspace.ts";
import { listTasks } from "./tasks/registry.ts";

describe("footage-narration", () => {
  it("is registered next to study-explainer", () => {
    assert.deepEqual(
      listTasks().map((task) => task.id),
      ["study-explainer", "footage-narration"],
    );
  });

  it("creates a clip seed without LightUI publish paths", () => {
    const root = tempWorkspace();
    const project = createProject("site-rescue", { title: "工地", task: "footage-narration" }, root);
    assert.equal(project.film.task, "footage-narration");
    assert.equal(project.source, "user");
    assert.equal(project.film.capture?.kind, "manual");
    assert.equal(project.film.study, undefined);
    assert.equal(project.film.publish, undefined);
    assert.deepEqual(
      project.film.scenes.map((scene) => scene.kind),
      ["clip"],
    );
    assert.equal(project.film.scenes[0]?.ost, "narration");
    assert.equal(project.film.locales.zh.titleCard, undefined);
    assert.ok(hasErrors(validateProject(project, root)));
  });

  it("requires source, in/out, and ost on every clip", () => {
    const root = tempWorkspace();
    const project = createProject("site-rescue", { task: "footage-narration" }, root);
    const issues = validateProject(project, root);
    assert.ok(issues.some((issue) => issue.path === "scenes.cut-01.source"));
    assert.ok(issues.some((issue) => issue.path === "scenes.cut-01.in"));
    assert.ok(!issues.some((issue) => issue.path.includes(".still")));
  });

  it("allows empty lines on original ost and rejects empty narration", () => {
    const root = tempWorkspace();
    const okOriginal = seedFootageFilm(root, "mix-cut", [
      { id: "keep", in: 1, out: 2, ost: "original", zh: "", en: "" },
    ]);
    assert.equal(hasErrors(validateProject(okOriginal, root)), false);

    const bad = seedFootageFilm(root, "talk-cut", [{ id: "say", in: 1, out: 2, ost: "narration", zh: "", en: "" }]);
    const issues = validateProject(bad, root);
    assert.ok(issues.some((issue) => issue.path === "scenes.say.lines.zh" && issue.message.includes("旁白")));
  });

  it("is renderable when the origin file and narration wavs exist", () => {
    const root = tempWorkspace();
    const missing = seedFootageFilm(root, "need-media", [{ id: "say", in: 1, out: 3, ost: "narration" }]);
    assert.equal(isRenderable(missing, root), false);

    const ready = seedFootageFilm(
      root,
      "ready-cut",
      [
        { id: "say", in: 1, out: 3, ost: "narration" },
        { id: "keep", in: 4, out: 6, ost: "original", zh: "", en: "" },
      ],
      { writeVideo: true, writeWav: true },
    );
    assert.equal(hasErrors(validateProject(ready, root)), false);
    assert.equal(isRenderable(ready, root), true);
  });

  it("adds a clip without creating a still stub", () => {
    const root = tempWorkspace();
    const project = createProject("site-rescue", { task: "footage-narration" }, root);
    addScene(project, {
      id: "cut-02",
      kind: "clip",
      source: "asset:video.origin",
      in: 10,
      out: 14,
      ost: "mix",
    });
    assert.equal(project.film.scenes.at(-1)?.kind, "clip");
    assert.equal(project.film.scenes.at(-1)?.ost, "mix");
    assert.ok(project.assets.some((asset) => asset.id === "video.origin" && asset.kind === "video"));
    assert.ok(!project.assets.some((asset) => asset.kind === "still"));
  });

  it("applies plot-then-match as clip fields, not stills", () => {
    const root = tempWorkspace();
    const project = createProject("site-rescue", { task: "footage-narration" }, root);
    applyRecipe(project, "plot-then-match", { items: ["beat-a", "beat-b"] }, weaverRoot());
    const kinds = project.film.scenes.map((scene) => scene.kind);
    assert.deepEqual(kinds, ["clip", "clip"]);
    assert.equal(project.film.scenes[0]?.id, "beat-a");
    assert.equal(project.film.scenes[0]?.ost, "narration");
    assert.equal(project.film.scenes[0]?.still, undefined);
    assert.ok(!project.assets.some((asset) => asset.kind === "still"));
  });

  it("lists the footage method only under that task", () => {
    const ids = listRecipes(weaverRoot(), "footage-narration").map((recipe) => recipe.id);
    assert.deepEqual(ids, ["plot-then-match"]);
  });

  it("patches clip timing without dropping ost", () => {
    const root = tempWorkspace();
    const project = seedFootageFilm(root, "time-cut", [{ id: "say", in: 1, out: 2 }]);
    patchScene(project, "say", { in: 3, out: 8 });
    const scene = project.film.scenes.find((item) => item.id === "say");
    assert.equal(scene?.in, 3);
    assert.equal(scene?.out, 8);
    assert.equal(scene?.ost, "narration");
  });
});
