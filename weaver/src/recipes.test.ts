import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { filmTask } from "./schema.ts";
import { createProject } from "./project.ts";
import { projectPaths } from "./project-paths.ts";
import { applyRecipe, formatRecipe, listRecipes, loadRecipe, methodAssetId, recipeIdOf, showRecipe } from "./recipes.ts";
import { recipeRoot, weaverRoot } from "./paths.ts";
import { seedLabFilm, tempWorkspace } from "./test-workspace.ts";
import { patchScene, removeScene } from "./scenes.ts";

function write(file: string, text: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

function tempProjectRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "weaver-"));
  fs.mkdirSync(path.join(root, "library"), { recursive: true });
  fs.writeFileSync(path.join(root, "library/assets.json"), `${JSON.stringify({ assets: [] })}\n`);
  return root;
}

describe("recipeIdOf", () => {
  it("accepts bare ids and library method refs", () => {
    assert.equal(recipeIdOf("taxonomy-parade"), "taxonomy-parade");
    assert.equal(recipeIdOf("library:method.taxonomy-parade"), "taxonomy-parade");
    assert.equal(recipeIdOf("method.taxonomy-parade"), "taxonomy-parade");
    assert.equal(methodAssetId("taxonomy-parade"), "method.taxonomy-parade");
  });
});

describe("listRecipes / loadRecipe", () => {
  it("lists catalog methods and can show taxonomy-parade", () => {
    const ids = listRecipes(weaverRoot(), "study-explainer").map((recipe) => recipe.id);
    assert.deepEqual(ids, ["problem-then-rule", "taxonomy-parade"]);
    assert.deepEqual(listRecipes(weaverRoot(), "not-a-task"), []);
    const shown = showRecipe("taxonomy-parade");
    const loaded = loadRecipe("taxonomy-parade");
    assert.equal(shown.id, loaded.id);
    assert.equal(shown.task, "study-explainer");
    assert.equal(shown.expand, "list");
    assert.ok(shown.path?.endsWith(path.join("library", "methods", "study-explainer", "taxonomy-parade.md")));
    const view = formatRecipe(shown);
    assert.match(view, /对照表阅兵/);
    assert.match(view, /清单一项一场/);
    assert.doesNotMatch(view, /requires_items|default_scenes|level:/);
    const pack = path.join(recipeRoot(), "study-explainer");
    assert.deepEqual(
      fs.readdirSync(pack).filter((name) => name.endsWith(".md")).sort(),
      ["problem-then-rule.md", "taxonomy-parade.md"],
    );
  });

  it("loads problem-then-rule scenes from the catalog and rejects bad ids", () => {
    const recipe = loadRecipe("problem-then-rule");
    assert.equal(recipe.expand, "fixed");
    assert.deepEqual(
      recipe.scenes?.map((scene) => scene.id),
      ["problem", "rule", "contrast"],
    );
    assert.deepEqual(
      recipe.scenes?.map((scene) => scene.role),
      ["problem", "rule", "contrast"],
    );
    const view = formatRecipe(recipe);
    assert.match(view, /问题然后规则/);
    assert.match(view, /固定场次/);
    assert.match(view, /- problem（problem）/);
    assert.doesNotMatch(view, /requires_items|default_scenes|level:/);
    assert.throws(() => loadRecipe("no-such-recipe"), /找不到方法/);
    assert.throws(() => loadRecipe("../etc/passwd"), /非法 recipe id/);
    assert.throws(() => loadRecipe("a/b"), /非法 recipe id/);
    assert.throws(() => loadRecipe("kind-still"), /找不到方法/);
  });

  it("does not list methods from an empty catalog", () => {
    const root = tempProjectRoot();
    assert.deepEqual(listRecipes(root).map((recipe) => recipe.id), []);
    assert.throws(() => loadRecipe("taxonomy-parade", root), /找不到方法/);
  });

  it("lists and applies the same catalog ids", () => {
    const root = tempProjectRoot();
    write(
      path.join(root, "library/methods/study-explainer/md-only.md"),
      `---
id: md-only
task: study-explainer
level: film
when: fixture
---
# md only
`,
    );
    assert.equal(listRecipes(root).some((recipe) => recipe.id === "md-only"), false);
    const project = createProject("demo-film", { title: "演示" }, root);
    assert.throws(() => applyRecipe(project, "md-only", {}, root), /找不到方法/);
  });

  it("paths.recipes is the pack directory, not recipeRoot itself", () => {
    const root = tempWorkspace();
    const project = seedLabFilm(root, "intent-cascade", [{ id: "status", file: "status.png", role: "problem" }]);
    const paths = projectPaths(project, root);
    assert.equal(paths.recipes, path.join(recipeRoot(root), "study-explainer"));
    assert.equal(filmTask(project.film), "study-explainer");
    assert.ok(paths.recipes.endsWith(path.join("library", "methods", "study-explainer")));
    assert.notEqual(paths.recipes, recipeRoot(root));
  });

  it("does not call addScene or removeScene while applying", () => {
    const src = fs.readFileSync(new URL("./recipes.ts", import.meta.url), "utf8");
    assert.equal(/addScene|removeScene/.test(src), false);
  });
});

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
    assert.equal(alpha?.role, undefined);
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

  it("rejects a markdown-only film card that is missing from the catalog", () => {
    const root = tempProjectRoot();
    write(
      path.join(root, "library/methods/study-explainer/md-only.md"),
      `---
id: md-only
task: study-explainer
level: film
when: fixture
default_scenes:
  - id: leftover
---
# md only
`,
    );
    const project = createProject("demo-film", { title: "演示" }, root);
    assert.throws(() => applyRecipe(project, "md-only", {}, root), /找不到方法/);
    assert.deepEqual(
      project.film.scenes.map((scene) => scene.id),
      ["title", "hero", "close"],
    );
  });

  it("applies a catalog method that has no markdown projection", () => {
    const root = tempProjectRoot();
    fs.writeFileSync(
      path.join(root, "library/assets.json"),
      `${JSON.stringify({
        assets: [
          {
            id: "method.catalog-only",
            kind: "method",
            label: "仅目录",
            task: "study-explainer",
            expand: "list",
          },
        ],
      })}\n`,
    );
    assert.equal(fs.existsSync(path.join(root, "library/methods/study-explainer/catalog-only.md")), false);
    const listed = listRecipes(root).map((recipe) => recipe.id);
    assert.deepEqual(listed, ["catalog-only"]);
    const shown = showRecipe("catalog-only", root);
    assert.equal(shown.path, undefined);
    assert.equal(shown.body, undefined);
    const project = createProject("demo-film", { title: "演示" }, root);
    applyRecipe(project, "catalog-only", { items: ["alpha"] }, root);
    assert.deepEqual(
      project.film.scenes.map((scene) => scene.id),
      ["title", "alpha", "close"],
    );
    assert.equal(project.film.recipe, "catalog-only");
  });

  it("rejects unknown scene kinds before writing", () => {
    const root = tempProjectRoot();
    fs.writeFileSync(
      path.join(root, "library/assets.json"),
      `${JSON.stringify({
        assets: [
          {
            id: "method.bad-beat",
            kind: "method",
            label: "坏拍",
            task: "study-explainer",
            expand: "fixed",
            scenes: [{ id: "x", kind: "beat" }],
          },
        ],
      })}\n`,
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
    assert.throws(() => applyRecipe(project, "taxonomy-parade", {}, weaverRoot()), /需要 --items/);
    assert.throws(() => applyRecipe(project, "taxonomy-parade", { kinds: [] }, weaverRoot()), /需要 --items/);
  });

  it("uses catalog scenes for problem-then-rule and ignores kinds", () => {
    const root = tempProjectRoot();
    const project = createProject("demo-film", { title: "演示" }, root);
    applyRecipe(project, "problem-then-rule", { kinds: ["nope"] }, weaverRoot());
    assert.deepEqual(
      project.film.scenes.map((scene) => scene.id),
      ["title", "problem", "rule", "contrast", "close"],
    );
    assert.equal(project.film.scenes.find((scene) => scene.id === "problem")?.role, "problem");
    assert.equal(project.film.scenes.find((scene) => scene.id === "rule")?.role, "rule");
    assert.equal(project.film.scenes.find((scene) => scene.id === "contrast")?.role, "contrast");
    assert.equal(project.film.scenes.some((scene) => scene.id === "nope"), false);
  });
});
