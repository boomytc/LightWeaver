import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildMethodBrief, methodApplyLine, methodShape } from "./method-brief.ts";
import type { RecipeCard } from "../types";

const parade: RecipeCard = {
  id: "taxonomy-parade",
  task: "study-explainer",
  level: "film",
  when: "study 以 kinds.ts 列出互斥模型",
  title: "对照表阅兵",
  requires_kinds: true,
};

const rule: RecipeCard = {
  id: "problem-then-rule",
  task: "study-explainer",
  level: "film",
  when: "study 讲一条会坏的交互规则",
  title: "问题然后规则",
  default_scenes: [
    { id: "problem", kind: "still", role: "problem" },
    { id: "rule", kind: "still", role: "rule" },
    { id: "contrast", kind: "still", role: "contrast" },
  ],
};

describe("buildMethodBrief", () => {
  it("tells the agent how to reuse a kinds-based card on the next film", () => {
    const text = buildMethodBrief(parade);
    assert.match(text, /下一张同类片子复用这张卡/);
    assert.match(text, /taxonomy-parade/);
    assert.match(text, /kinds\.ts/);
    assert.match(text, /recipe apply --project <id> --recipe taxonomy-parade --kinds/);
    assert.doesNotMatch(text, /dropdown-taxonomy/);
    assert.equal(methodApplyLine(parade).includes("--kinds"), true);
  });

  it("describes a reusable role skeleton, not a canon film's scene ids", () => {
    assert.equal(methodShape(rule), "problem（问题） → rule（规则） → contrast（对照）");
    const text = buildMethodBrief(rule);
    assert.match(text, /problem（问题） → rule（规则） → contrast（对照）/);
    assert.doesNotMatch(text, /status|diagonal/);
    assert.match(text, /recipe apply --project <id> --recipe problem-then-rule\n/);
  });
});
