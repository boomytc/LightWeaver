import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseAssetRef } from "./schema.ts";

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
