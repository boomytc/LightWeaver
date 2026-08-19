import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";
import { safeJoin } from "@lightweaver/weaver";

describe("safeJoin", () => {
  it("allows nested files", () => {
    const root = "/tmp/lib";
    assert.equal(safeJoin(root, "voices/a.wav"), path.resolve(root, "voices/a.wav"));
  });

  it("rejects parent escape", () => {
    assert.throws(() => safeJoin("/tmp/lib", "../secret"));
  });

  it("allows gitignored output rel under project root", () => {
    const root = "/tmp/proj";
    assert.equal(
      safeJoin(root, "assets/outputs/cursor-movement.mp4"),
      path.resolve(root, "assets/outputs/cursor-movement.mp4"),
    );
  });

  it("rejects escaping through assets/outputs", () => {
    assert.throws(() => safeJoin("/tmp/proj", "assets/outputs/../../../etc/passwd"));
  });
});
