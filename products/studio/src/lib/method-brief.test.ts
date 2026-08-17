import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { methodLabel, methodShapeName, methodShapeOf, recipeIdOfMethod } from "./method-brief.ts";

describe("method catalog helpers", () => {
  it("reads shape and apply id from the catalog row", () => {
    assert.equal(recipeIdOfMethod({ id: "method.taxonomy-parade" }), "taxonomy-parade");
    assert.equal(methodShapeOf({ shape: "kinds" }), "kinds");
    assert.equal(methodShapeOf({ shape: "problem-then-rule" }), "problem-then-rule");
    assert.equal(methodShapeOf({}), "problem-then-rule");
    assert.equal(methodShapeName("kinds"), "一种模型一场");
    assert.equal(methodShapeName("problem-then-rule"), "问题 → 规则 → 对照");
  });

  it("resolves a film recipe id to the catalog name", () => {
    const library = [{ id: "method.taxonomy-parade", kind: "method", label: "对照表阅兵" }];
    assert.equal(methodLabel(library, "taxonomy-parade"), "对照表阅兵");
    assert.equal(methodLabel(library, "method.taxonomy-parade"), "对照表阅兵");
    assert.equal(methodLabel(library, "missing"), "");
  });
});
