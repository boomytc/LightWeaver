import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { createLibraryMethod, listLibraryMethods, methodIdFromName, updateLibraryMethod } from "./library-method.ts";
import { loadLibrary, removeLibraryAsset } from "./assets.ts";
import { loadRecipe } from "./recipes.ts";
import { tempWorkspace } from "./test-workspace.ts";

describe("createLibraryMethod", () => {
  it("writes a library method and a film recipe file", () => {
    const root = tempWorkspace();
    const asset = createLibraryMethod(
      { label: "对照练习", text: "有一份互斥模型清单", expand: "list", task: "study-explainer" },
      root,
    );
    assert.equal(asset.kind, "method");
    assert.equal(asset.label, "对照练习");
    assert.equal(asset.expand, "list");
    assert.equal(asset.task, "study-explainer");
    assert.equal(asset.id, "method.pack");
    assert.ok(asset.file?.endsWith("methods/study-explainer/pack.md"));
    const recipe = loadRecipe("pack", root);
    assert.equal(recipe.expand, "list");
    assert.equal(recipe.when, "有一份互斥模型清单");
    assert.equal(recipe.title, "对照练习");
    const projection = fs.readFileSync(path.join(root, "library", asset.file!), "utf8");
    assert.match(projection, /# 对照练习/);
    assert.match(projection, /有一份互斥模型清单/);
    assert.match(projection, /铺场：清单一项一场/);
    assert.doesNotMatch(projection, /level:|requires_items|default_scenes/);
  });

  it("refuses a duplicate name", () => {
    const root = tempWorkspace();
    createLibraryMethod(
      { label: "规则卡", text: "先问题", expand: "fixed", scenes: [{ id: "problem" }] },
      root,
    );
    assert.throws(
      () => createLibraryMethod({ label: "规则卡", text: "另一段", expand: "list" }, root),
      /已在方法库里/,
    );
  });

  it("renames without changing the id and can be removed", () => {
    const root = tempWorkspace();
    const created = createLibraryMethod(
      { label: "旧名", text: "何时", expand: "fixed", scenes: [{ id: "problem" }] },
      root,
    );
    const updated = updateLibraryMethod(created.id, { label: "新名", text: "新的何时" }, root);
    assert.equal(updated.id, created.id);
    assert.equal(updated.label, "新名");
    assert.equal(loadRecipe(created.id, root).when, "新的何时");
    removeLibraryAsset(created.id, root);
    assert.equal(loadLibrary(root).some((item) => item.id === created.id), false);
    assert.equal(fs.existsSync(path.join(root, "library", created.file!)), false);
  });

  it("slugs an ascii name into the default id", () => {
    assert.equal(methodIdFromName("Taxonomy Parade"), "method.taxonomy-parade");
  });

  it("rewrites the skeleton when the shape changes", () => {
    const root = tempWorkspace();
    const created = createLibraryMethod(
      { label: "先对照", text: "有清单", expand: "list" },
      root,
    );
    const updated = updateLibraryMethod(created.id, {
      expand: "fixed",
      scenes: [{ id: "problem" }, { id: "rule" }, { id: "contrast" }],
    }, root);
    const recipe = loadRecipe(created.id, root);
    assert.equal(updated.expand, "fixed");
    assert.equal(updated.id, created.id);
    assert.equal(recipe.expand, "fixed");
    assert.deepEqual(
      recipe.scenes?.map((scene) => scene.id),
      ["problem", "rule", "contrast"],
    );
    removeLibraryAsset(created.id, root);
  });

  it("lists catalog methods with the apply id and shape", () => {
    const root = tempWorkspace();
    createLibraryMethod({ label: "对照练习", text: "有清单", expand: "list" }, root);
    const listed = listLibraryMethods(root);
    assert.equal(listed.length, 1);
    assert.equal(listed[0]?.label, "对照练习");
    assert.equal(listed[0]?.recipe, "pack");
    assert.equal(listed[0]?.expand, "list");
    removeLibraryAsset(listed[0]!.id, root);
  });
});
