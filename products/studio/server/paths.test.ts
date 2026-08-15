import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";
import { safeJoin } from "./safePath.ts";

describe("safeJoin", () => {
  it("allows nested files", () => {
    const root = "/tmp/lib";
    assert.equal(safeJoin(root, "voices/a.wav"), path.resolve(root, "voices/a.wav"));
  });

  it("rejects parent escape", () => {
    assert.throws(() => safeJoin("/tmp/lib", "../secret"));
  });
});
