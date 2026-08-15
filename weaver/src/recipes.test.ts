import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import { filmTask } from "./schema.ts";
import { loadProject } from "./project.ts";
import { projectPaths } from "./project-paths.ts";
import { listRecipes, loadRecipe, showRecipe } from "./recipes.ts";
import { recipeRoot, weaverRoot } from "./paths.ts";

function write(file: string, text: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

function fixtureRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "recipes-"));
  const dir = path.join(root, "study-explainer");
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
    assert.ok(shown.path.endsWith(path.join("recipes", "study-explainer", "taxonomy-parade.md")));
    assert.match(shown.body, /一种 LightUI kind 一场/);
  });

  it("loads problem-then-rule default scenes and rejects bad ids", () => {
    const recipe = loadRecipe("problem-then-rule");
    assert.deepEqual(
      recipe.default_scenes?.map((scene) => scene.id),
      ["problem", "diagonal", "vertical", "third"],
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

  it("paths.recipes is the task directory, not recipeRoot itself", () => {
    const project = loadProject("intent-cascade");
    const paths = projectPaths(project);
    assert.equal(paths.recipes, path.join(recipeRoot(), filmTask(project.film)));
    assert.ok(paths.recipes.endsWith(path.join("recipes", "study-explainer")));
    assert.notEqual(paths.recipes, recipeRoot());
  });
});
