import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseAssetRef } from "./schema.ts";
import { jargonIn } from "./plain-talk.ts";

describe("parseAssetRef", () => {
  it("accepts asset and library refs", () => {
    assert.deepEqual(parseAssetRef("asset:still.problem"), { scope: "asset", id: "still.problem" });
    assert.deepEqual(parseAssetRef("library:voice.prompt-zh"), { scope: "library", id: "voice.prompt-zh" });
  });

  it("rejects bare filenames", () => {
    assert.equal(parseAssetRef("desktop-full.png"), null);
    assert.equal(parseAssetRef("asset:"), null);
  });
});

describe("plain talk", () => {
  it("flags leaf jargon and accepts everyday wording", () => {
    assert.equal(jargonIn("级联选择必须走到叶子才提交一条路径。")[0]?.term, "叶子");
    assert.equal(jargonIn("Cascader must reach a leaf before it commits.")[0]?.term, "leaf");
    assert.equal(jargonIn("先定提交模型。")[0]?.term, "提交模型");
    assert.equal(jargonIn("First decide the commit model.")[0]?.term, "commit model");
    assert.deepEqual(jargonIn("点到不能再往下的那一级，才算选完。"), []);
    assert.deepEqual(jargonIn("面包屑是路径，不是主导航。"), []);
  });
});
