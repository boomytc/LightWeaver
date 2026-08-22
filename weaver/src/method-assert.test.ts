import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { saveAssets } from "./project.ts";
import { setFilmRecipe } from "./recipes.ts";
import { seedFootageFilm, tempWorkspace, touch } from "./test-workspace.ts";
import { validateProject } from "./validate.ts";
import { methodNeedsOf } from "./schema.ts";
import { loadLibrary } from "./assets.ts";

function seedCatalogMethod(
  root: string,
  id: string,
  extra: { needs?: string[]; clipOst?: string } = {},
): void {
  const file = path.join(root, "library/assets.json");
  const doc = JSON.parse(fs.readFileSync(file, "utf8")) as { assets: Record<string, unknown>[] };
  doc.assets.push({
    id: `method.${id}`,
    kind: "method",
    label: id,
    file: `methods/footage-narration/${id}.md`,
    task: "footage-narration",
    text: id,
    expand: "list",
    ...extra,
  });
  fs.writeFileSync(file, `${JSON.stringify(doc, null, 2)}\n`);
}

describe("assertMethodGates", () => {
  it("does not add gates when the film has no recipe", () => {
    const root = tempWorkspace();
    const project = seedFootageFilm(root, "plain", [{ id: "keep", in: 1, out: 2, ost: "original", zh: "", en: "" }]);
    const issues = validateProject(project, root);
    assert.ok(!issues.some((issue) => issue.path.startsWith("recipe.needs")));
  });

  it("requires a description tree for see-then-narrate", () => {
    const root = tempWorkspace();
    seedCatalogMethod(root, "see-then-narrate", { needs: ["description"] });
    const project = seedFootageFilm(root, "site-see", [{ id: "keep", in: 1, out: 2, ost: "original", zh: "", en: "" }]);
    setFilmRecipe(project, "see-then-narrate", root);
    const missing = validateProject(project, root);
    assert.ok(missing.some((issue) => issue.path === "recipe.needs.description" && issue.level === "error"));

    touch(path.join(project.root, "assets/descriptions/video.origin.json"), `${JSON.stringify({ sequences: [{ id: "seq-01" }] })}\n`);
    saveAssets(project, [
      ...project.assets,
      { id: "description.video.origin", kind: "description", file: "assets/descriptions/video.origin.json", scene: "video.origin" },
    ]);
    const ready = validateProject(project, root);
    assert.ok(!ready.some((issue) => issue.path === "recipe.needs.description"));
  });

  it("requires a match report for clone-from-edited", () => {
    const root = tempWorkspace();
    seedCatalogMethod(root, "clone-from-edited", { needs: ["match-report"], clipOst: "original" });
    const project = seedFootageFilm(root, "site-clone", [{ id: "keep", in: 1, out: 2, ost: "original", zh: "", en: "" }]);
    setFilmRecipe(project, "clone-from-edited", root);
    const missing = validateProject(project, root);
    assert.ok(missing.some((issue) => issue.path === "recipe.needs.match-report"));

    touch(path.join(project.root, "assets/match/report.json"), "{}\n");
    const ready = validateProject(project, root);
    assert.ok(!ready.some((issue) => issue.path === "recipe.needs.match-report"));
  });

  it("rejects narration clips when the method requires original ost", () => {
    const root = tempWorkspace();
    seedCatalogMethod(root, "highlight-mix", { needs: ["transcript"], clipOst: "original" });
    const project = seedFootageFilm(root, "site-mix", [{ id: "say", in: 1, out: 2, ost: "narration" }]);
    setFilmRecipe(project, "highlight-mix", root);
    touch(path.join(project.root, "assets/transcripts/video.origin.json"), "{}\n");
    saveAssets(project, [
      ...project.assets,
      { id: "transcript.video.origin", kind: "transcript", file: "assets/transcripts/video.origin.json", scene: "video.origin" },
    ]);
    const issues = validateProject(project, root);
    assert.ok(issues.some((issue) => issue.path === "scenes.say.ost" && issue.message.includes("original")));
  });
});

describe("methodNeedsOf", () => {
  it("reads needs off the catalog row", () => {
    const root = tempWorkspace();
    seedCatalogMethod(root, "see-then-narrate", { needs: ["description"] });
    const asset = loadLibrary(root).find((item) => item.id === "method.see-then-narrate");
    assert.deepEqual(methodNeedsOf(asset ?? {}), ["description"]);
    assert.deepEqual(methodNeedsOf({}), []);
  });
});
