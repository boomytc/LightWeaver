import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyPadding,
  parseSceneLog,
  snapToSceneBoundary,
  splitAndSnapCuts,
  splitRangeByScene,
  stabilizeCuts,
  type TimedCut,
} from "./match-scene.ts";

const sample = `
[Parsed_metadata_1 @ 0x] frame:12 pts:300 pts_time:1.200
[Parsed_metadata_1 @ 0x] lavfi.scene_score=0.612
[Parsed_metadata_1 @ 0x] frame:40 pts:1000 pts_time:4.000
[Parsed_metadata_1 @ 0x] lavfi.scene_score=0.441
`;

function cut(partial: Partial<TimedCut> = {}): TimedCut {
  return {
    sourceRef: "asset:video.ep01",
    in: 10,
    out: 16,
    editedStart: 0,
    editedEnd: 2,
    originalIn: 10,
    originalOut: 16,
    sceneSnapped: false,
    warnings: [],
    text: "这一下",
    score: 0.9,
    textScore: 0.9,
    visualScore: 0,
    matchMethod: "text",
    ...partial,
  };
}

describe("parseSceneLog", () => {
  it("reads pts_time and scene_score pairs", () => {
    const boundaries = parseSceneLog(sample, 0.4);
    assert.deepEqual(boundaries.map((item) => item.time), [1.2, 4]);
  });
});

describe("snapToSceneBoundary", () => {
  const index = { duration: 20, boundaries: [{ time: 5, score: 0.5 }, { time: 12, score: 0.6 }] };

  it("snaps when inside the window", () => {
    const snapped = snapToSceneBoundary(5.4, index, 1);
    assert.equal(snapped.time, 5);
    assert.equal(snapped.snapped, true);
  });

  it("leaves the time alone outside the window", () => {
    const snapped = snapToSceneBoundary(8, index, 1);
    assert.equal(snapped.time, 8);
    assert.equal(snapped.snapped, false);
  });
});

describe("splitRangeByScene", () => {
  it("splits a range on internal scene cuts", () => {
    const ranges = splitRangeByScene(0, 10, { duration: 10, boundaries: [{ time: 4, score: 1 }] }, 0.25);
    assert.deepEqual(ranges, [
      [0, 4],
      [4, 10],
    ]);
  });
});

describe("splitAndSnapCuts", () => {
  it("maps edited scene pieces onto the source window", () => {
    const cuts = splitAndSnapCuts(
      [cut({ editedStart: 0, editedEnd: 4, in: 10, out: 18 })],
      { duration: 4, boundaries: [{ time: 2, score: 1 }] },
      new Map([["asset:video.ep01", { duration: 30, boundaries: [] }]]),
    );
    assert.equal(cuts.length, 2);
    assert.ok(cuts[0]!.out <= cuts[1]!.in + 1e-6);
  });
});

describe("applyPadding / stabilizeCuts", () => {
  it("extends the first and last cut and fixes overlap", () => {
    const padded = applyPadding(
      [
        cut({ in: 10, out: 16, editedStart: 0, editedEnd: 2 }),
        cut({ in: 15.9, out: 20, editedStart: 2.5, editedEnd: 4, originalIn: 16, originalOut: 20 }),
      ],
      new Map([["asset:video.ep01", 40]]),
    );
    assert.ok(padded[0]!.in < 10);
    const stable = stabilizeCuts(padded);
    assert.ok(stable[0]!.out <= stable[1]!.in + 0.05 + 1e-6);
  });
});
