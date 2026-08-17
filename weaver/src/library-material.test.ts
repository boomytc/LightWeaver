import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { addAsset, removeLibraryAsset } from "./assets.ts";
import {
  allocateNewMaterial,
  materialIdFromName,
  updateLibraryMaterial,
} from "./library-material.ts";
import { tempWorkspace } from "./test-workspace.ts";

describe("allocateNewMaterial", () => {
  it("slugs an ascii name under the kind prefix", () => {
    assert.equal(materialIdFromName("element", "Light Mark"), "element.light-mark");
    assert.equal(materialIdFromName("reference", "Board"), "reference.board");
  });

  it("allocates a unique name and can rename", () => {
    const root = tempWorkspace();
    const created = allocateNewMaterial("element", "角标", root);
    assert.equal(created.label, "角标");
    assert.equal(created.id, "element.pack");
    addAsset({ kind: "library" }, { id: created.id, kind: "element", label: created.label, file: "elements/pack.svg" }, root);
    assert.throws(() => allocateNewMaterial("reference", "角标", root), /已在素材库里/);
    const renamed = updateLibraryMaterial(created.id, { label: "新角标" }, root);
    assert.equal(renamed.id, created.id);
    assert.equal(renamed.label, "新角标");
    removeLibraryAsset(created.id, root);
  });
});
