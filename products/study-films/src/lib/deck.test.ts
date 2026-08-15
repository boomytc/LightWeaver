import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parsePoint, revealStarts, splitMarks } from "./deck";

describe("deck", () => {
  it("splits a contrast pair on ||", () => {
    assert.deepEqual(parsePoint("分组选择是分类 || 级联选择才是上下级"), {
      kind: "pair",
      left: "分组选择是分类",
      right: "级联选择才是上下级",
    });
    assert.deepEqual(parsePoint("先说名称、场景和规则"), { kind: "item", text: "先说名称、场景和规则" });
  });

  it("follows cue starts when counts match, else even split", () => {
    assert.deepEqual(revealStarts(2, [{ from: 6 }, { from: 40 }], 90), [6, 40]);
    const even = revealStarts(3, [{ from: 6 }], 120);
    assert.equal(even.length, 3);
    assert.ok(even[0]! < even[1]!);
    assert.ok(even[1]! < even[2]!);
  });

  it("marks **bold** spans", () => {
    assert.deepEqual(splitMarks("先说 **名称** 再谈外观"), [
      { text: "先说 ", bold: false },
      { text: "名称", bold: true },
      { text: " 再谈外观", bold: false },
    ]);
  });
});
