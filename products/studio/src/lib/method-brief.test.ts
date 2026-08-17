import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { methodLabel, methodShape, methodShapeKind, methodShapeName, recipeIdOfMethod } from "./method-brief.ts";
import type { RecipeCard } from "../types";

const parade: RecipeCard = {
  id: "taxonomy-parade",
  task: "study-explainer",
  level: "film",
  when: "有一份互斥模型清单，一种模型一场",
  title: "对照表阅兵",
  requires_kinds: true,
};

const rule: RecipeCard = {
  id: "problem-then-rule",
  task: "study-explainer",
  level: "film",
  when: "讲一条会坏的交互规则",
  title: "问题然后规则",
  default_scenes: [
    { id: "problem", kind: "still", role: "problem" },
    { id: "rule", kind: "still", role: "rule" },
    { id: "contrast", kind: "still", role: "contrast" },
  ],
};

describe("methodShape", () => {
  it("names a kinds parade as one model per scene", () => {
    assert.equal(methodShape(parade), "一种模型一场");
  });

  it("describes a role skeleton, not a film's scene ids", () => {
    assert.equal(methodShape(rule), "问题 → 规则 → 对照");
  });

  it("maps a catalog id and recipe into the two shapes", () => {
    assert.equal(recipeIdOfMethod({ id: "method.taxonomy-parade" }), "taxonomy-parade");
    assert.equal(methodShapeKind(parade), "kinds");
    assert.equal(methodShapeKind(rule), "problem-then-rule");
    assert.equal(methodShapeName("problem-then-rule"), "问题 → 规则 → 对照");
    assert.notEqual(methodShapeName("problem-then-rule"), "问题然后规则");
  });

  it("resolves a film recipe id to the catalog name", () => {
    const library = [{ id: "method.taxonomy-parade", kind: "method", label: "对照表阅兵" }];
    assert.equal(methodLabel(library, "taxonomy-parade"), "对照表阅兵");
    assert.equal(methodLabel(library, "method.taxonomy-parade"), "对照表阅兵");
    assert.equal(methodLabel(library, "missing"), "");
  });
});
