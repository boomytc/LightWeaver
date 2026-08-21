import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cutForScene, formatMatchScore, matchMethodLabel } from "../tasks/footage-narration";

describe("match report view", () => {
  it("joins a cut to its scene and labels the method", () => {
    const report = {
      cuts: [{ sceneId: "cut-01", score: 0.91, matchMethod: "text" }],
    };
    const cut = cutForScene(report, "cut-01");
    assert.equal(cut?.score, 0.91);
    assert.equal(matchMethodLabel(cut?.matchMethod ?? ""), "文本");
    assert.equal(formatMatchScore(cut?.score), "0.91");
    assert.equal(cutForScene(report, "cut-99"), undefined);
  });
});
