import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeRotation, parseRotation, rotationFilter } from "./probe.ts";

describe("parseRotation", () => {
  it("reads stream tags.rotate", () => {
    assert.equal(parseRotation(JSON.stringify({ streams: [{ tags: { rotate: "90" } }] })), 90);
    assert.equal(parseRotation(JSON.stringify({ streams: [{ tags: { rotate: "0" } }] })), 0);
  });

  it("reads displaymatrix rotation and wraps negatives", () => {
    assert.equal(
      parseRotation(JSON.stringify({ streams: [{ side_data_list: [{ rotation: -90 }] }] })),
      270,
    );
    assert.equal(normalizeRotation(180), 180);
    assert.equal(normalizeRotation(360), 0);
  });

  it("maps rotation to an ffmpeg vf", () => {
    assert.equal(rotationFilter(90), "transpose=1");
    assert.equal(rotationFilter(270), "transpose=2");
    assert.equal(rotationFilter(180), "hflip,vflip");
    assert.equal(rotationFilter(0), undefined);
  });
});
