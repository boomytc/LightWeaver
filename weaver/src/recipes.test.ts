import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import { filmTask } from "./schema.ts";
import { createProject, loadProject } from "./project.ts";
import { projectPaths } from "./project-paths.ts";
import { applyRecipe, listRecipes, loadRecipe, showRecipe } from "./recipes.ts";
import { recipeRoot, weaverRoot } from "./paths.ts";
import { seedLabFilm, tempWorkspace } from "./test-workspace.ts";
import { patchScene, removeScene } from "./scenes.ts";

function write(file: string, text: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

function fixtureRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "recipes-"));
  const dir = path.join(root, "lightui-study-explainer");
  write(
    path.join(dir, "index.md"),
    `---
id: index
task: study-explainer
level: film
when: should skip
---
# index
`,
  );
  write(
    path.join(dir, "taxonomy-parade.md"),
    `---
id: taxonomy-parade
task: study-explainer
level: film
when: parade
canon:
  - dropdown-taxonomy
requires_kinds: true
---
# 对照表阅兵
`,
  );
  write(
    path.join(dir, "mismatch.md"),
    `---
id: other-name
task: study-explainer
level: scene
when: bad
---
# no
`,
  );
  write(path.join(dir, "no-fm.md"), "# no frontmatter\n");
  write(
    path.join(dir, "drama-named.md"),
    `---
id: drama-named
task: drama-plot
level: film
when: no
---
# no
`,
  );
  write(
    path.join(dir, "ok-extra.md"),
    `---
id: ok-extra
task: study-explainer
level: scene
when: extra
---
# extra
`,
  );
  write(
    path.join(root, "drama-plot", "some.md"),
    `---
id: some
task: drama-plot
level: film
when: no
---
# no
`,
  );
  return root;
}

describe("listRecipes / loadRecipe", () => {
  const previous = process.env.LIGHTWEAVER_RECIPES;
  afterEach(() => {
    if (previous === undefined) delete process.env.LIGHTWEAVER_RECIPES;
    else process.env.LIGHTWEAVER_RECIPES = previous;
  });

  it("skips index.md silently and unknown task filters are empty", () => {
    const root = fixtureRoot();
    process.env.LIGHTWEAVER_RECIPES = root;
    const warns: unknown[] = [];
    const original = console.warn;
    console.warn = (...args: unknown[]) => {
      warns.push(args);
    };
    try {
      const listed = listRecipes(weaverRoot());
      assert.equal(listed.some((recipe) => recipe.id === "index"), false);
      assert.ok(listed.some((recipe) => recipe.id === "taxonomy-parade"));
      assert.ok(listed.some((recipe) => recipe.id === "ok-extra"));
      assert.equal(listed.some((recipe) => recipe.id === "mismatch"), false);
      assert.equal(listed.some((recipe) => recipe.id === "drama-named"), false);
      assert.deepEqual(listRecipes(weaverRoot(), "drama-plot"), []);
      assert.deepEqual(listRecipes(weaverRoot(), "not-a-task"), []);
      assert.equal(warns.length, 0);
    } finally {
      console.warn = original;
    }
  });

  it("lists the six product cards and can show taxonomy-parade", () => {
    delete process.env.LIGHTWEAVER_RECIPES;
    const ids = listRecipes(weaverRoot(), "study-explainer").map((recipe) => recipe.id);
    assert.deepEqual(ids, [
      "contrast-pair",
      "kind-still",
      "problem-then-rule",
      "say-it-this-way",
      "study-title",
      "taxonomy-parade",
    ]);
    const shown = showRecipe("taxonomy-parade");
    const loaded = loadRecipe("taxonomy-parade");
    assert.equal(shown.id, loaded.id);
    assert.equal(shown.task, "study-explainer");
    assert.equal(shown.level, "film");
    assert.equal(shown.requires_kinds, true);
    assert.deepEqual(shown.canon, ["dropdown-taxonomy", "nav-taxonomy", "sidebar-taxonomy"]);
    assert.ok(shown.path.endsWith(path.join("recipes", "lightui-study-explainer", "taxonomy-parade.md")));
    assert.match(shown.body, /一种 LightUI kind 一场/);
  });

  it("loads problem-then-rule default scenes and rejects bad ids", () => {
    const recipe = loadRecipe("problem-then-rule");
    assert.deepEqual(
      recipe.default_scenes?.map((scene) => scene.id),
      ["status", "diagonal", "project", "third"],
    );
    assert.deepEqual(
      recipe.default_scenes?.map((scene) => scene.role),
      ["problem", "rule", "contrast", "rule"],
    );
    assert.throws(() => loadRecipe("no-such-recipe"), /找不到 recipe/);
    assert.throws(() => loadRecipe("../etc/passwd"), /非法 recipe id/);
    assert.throws(() => loadRecipe("a/b"), /非法 recipe id/);
    assert.throws(() => loadRecipe("mismatch"), /找不到 recipe/);
  });

  it("LIGHTWEAVER_RECIPES hides the product pack", () => {
    process.env.LIGHTWEAVER_RECIPES = fixtureRoot();
    const ids = listRecipes(weaverRoot()).map((recipe) => recipe.id);
    assert.equal(ids.includes("problem-then-rule"), false);
    assert.ok(ids.includes("taxonomy-parade"));
    delete process.env.LIGHTWEAVER_RECIPES;
    assert.ok(listRecipes(weaverRoot()).some((recipe) => recipe.id === "problem-then-rule"));
  });

  it("paths.recipes is the pack directory, not recipeRoot itself", () => {
    const root = tempWorkspace();
    const project = seedLabFilm(root, "intent-cascade", [{ id: "status", file: "status.png", role: "problem" }]);
    const paths = projectPaths(project, root);
    assert.equal(paths.recipes, path.join(recipeRoot(root), "lightui-study-explainer"));
    assert.equal(filmTask(project.film), "study-explainer");
    assert.ok(paths.recipes.endsWith(path.join("recipes", "lightui-study-explainer")));
    assert.notEqual(paths.recipes, recipeRoot(root));
  });
});

function tempProjectRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "weaver-"));
  fs.mkdirSync(path.join(root, "library"), { recursive: true });
  fs.writeFileSync(path.join(root, "library/assets.json"), `${JSON.stringify({ assets: [] })}\n`);
  return root;
}

describe("applyRecipe", () => {
  it("expands taxonomy-parade stills then drops hero", () => {
    const root = tempProjectRoot();
    const project = createProject("demo-film", { title: "演示" }, root);
    const { skipped } = applyRecipe(project, "taxonomy-parade", { kinds: ["alpha", "bravo"] }, weaverRoot());
    assert.deepEqual(
      project.film.scenes.map((scene) => scene.id),
      ["title", "alpha", "bravo", "close"],
    );
    const alpha = project.film.scenes.find((scene) => scene.id === "alpha");
    assert.equal(alpha?.kind, "still");
    assert.equal(alpha?.still, "asset:still.alpha");
    assert.equal(alpha?.fit, "contain");
    assert.equal(alpha?.role, "contrast");
    assert.equal(alpha?.lines.zh, "alpha");
    assert.equal(alpha?.lines.en, "alpha");
    assert.ok(project.assets.some((asset) => asset.id === "still.alpha"));
    assert.ok(project.assets.some((asset) => asset.id === "still.bravo"));
    assert.equal(project.film.locales.zh.output, "demo-film.mp4");
    assert.equal("recipeId" in project.film, false);
    assert.equal(project.film.recipe, "taxonomy-parade");
    assert.deepEqual(skipped, []);
  });

  it("skips existing ids and does not clobber lines", () => {
    const root = tempProjectRoot();
    const project = createProject("demo-film", { title: "演示" }, root);
    applyRecipe(project, "taxonomy-parade", { kinds: ["alpha"] }, weaverRoot());
    patchScene(project, "alpha", { lines: { zh: "真旁白", en: "real" } });
    const { skipped } = applyRecipe(project, "taxonomy-parade", { kinds: ["alpha", "bravo"] }, weaverRoot());
    assert.ok(skipped.includes("alpha"));
    assert.equal(project.film.scenes.find((scene) => scene.id === "alpha")?.lines.zh, "真旁白");
    assert.ok(project.film.scenes.some((scene) => scene.id === "bravo"));
  });

  it("rejects scene-level apply without writing", () => {
    const root = tempProjectRoot();
    const project = createProject("demo-film", { title: "演示" }, root);
    assert.throws(() => applyRecipe(project, "kind-still", {}, weaverRoot()), /scene 卡按 SKILL/);
    assert.deepEqual(
      project.film.scenes.map((scene) => scene.id),
      ["title", "hero", "close"],
    );
  });

  it("rejects unknown scene kinds before writing", () => {
    const root = tempProjectRoot();
    write(
      path.join(root, "recipes/lightui-study-explainer/bad-beat.md"),
      `---
id: bad-beat
task: study-explainer
level: film
when: bad
default_scenes:
  - id: x
    kind: beat
---
# bad
`,
    );
    const project = createProject("demo-film", { title: "演示" }, root);
    assert.throws(() => applyRecipe(project, "bad-beat", {}, root), /未知场景 kind/);
    assert.ok(project.film.scenes.some((scene) => scene.id === "hero"));
  });

  it("adds stills before removing the seed hero", () => {
    const root = tempProjectRoot();
    const project = createProject("demo-film", { title: "演示" }, root);
    assert.throws(() => removeScene(project, "hero"), /最后一场 still/);
    applyRecipe(project, "taxonomy-parade", { kinds: ["alpha"] }, weaverRoot());
    assert.equal(project.film.scenes.some((scene) => scene.id === "hero"), false);
  });

  it("requires --kinds for taxonomy-parade", () => {
    const root = tempProjectRoot();
    const project = createProject("demo-film", { title: "演示" }, root);
    assert.throws(() => applyRecipe(project, "taxonomy-parade", {}, weaverRoot()), /需要 --kinds/);
    assert.throws(() => applyRecipe(project, "taxonomy-parade", { kinds: [] }, weaverRoot()), /需要 --kinds/);
  });

  it("uses default_scenes for problem-then-rule and ignores kinds", () => {
    const root = tempProjectRoot();
    const project = createProject("demo-film", { title: "演示" }, root);
    applyRecipe(project, "problem-then-rule", { kinds: ["nope"] }, weaverRoot());
    assert.deepEqual(
      project.film.scenes.map((scene) => scene.id),
      ["title", "status", "diagonal", "project", "third", "close"],
    );
    assert.equal(project.film.scenes.find((scene) => scene.id === "status")?.role, "problem");
    assert.equal(project.film.scenes.find((scene) => scene.id === "diagonal")?.role, "rule");
    assert.equal(project.film.scenes.find((scene) => scene.id === "project")?.role, "contrast");
    assert.equal(project.film.scenes.find((scene) => scene.id === "third")?.role, "rule");
    assert.equal(project.film.scenes.some((scene) => scene.id === "nope"), false);
  });
});
