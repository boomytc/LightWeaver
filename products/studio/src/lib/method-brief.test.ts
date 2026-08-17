import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { methodExpandName, methodExpandOf, methodLabel, methodPlanLine, recipeIdOfMethod } from "./method-brief.ts";

describe("method catalog helpers", () => {
  it("reads expand from the catalog row", () => {
    assert.equal(recipeIdOfMethod({ id: "method.taxonomy-parade" }), "taxonomy-parade");
    assert.equal(methodExpandOf({ expand: "list" }), "list");
    assert.equal(methodExpandOf({ expand: "fixed" }), "fixed");
    assert.equal(methodExpandOf({}), "fixed");
    assert.equal(methodExpandName("list"), "清单一项一场");
    assert.equal(methodExpandName("fixed"), "固定场次");
  });

  it("describes a fixed plan from its scenes, not from a built-in type", () => {
    assert.equal(
      methodPlanLine({
        expand: "fixed",
        scenes: [
          { id: "problem", role: "problem" },
          { id: "rule", role: "rule" },
          { id: "contrast", role: "contrast" },
        ],
      }),
      "问题 → 规则 → 对照",
    );
    assert.equal(methodPlanLine({ expand: "list" }), "清单一项一场");
  });

  it("resolves a film recipe id to the catalog name", () => {
    const library = [{ id: "method.taxonomy-parade", kind: "method", label: "对照表阅兵" }];
    assert.equal(methodLabel(library, "taxonomy-parade"), "对照表阅兵");
    assert.equal(methodLabel(library, "method.taxonomy-parade"), "对照表阅兵");
    assert.equal(methodLabel(library, "missing"), "");
  });
});
