import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cutForScene, formatMatchScore, matchMethodLabel, sequenceSpan, skipLabel } from "../tasks/footage-narration";

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

  it("labels description skip reasons", () => {
    assert.equal(skipLabel("dense-asr"), "对白已够");
    assert.equal(skipLabel("same-as-prev"), "同前场");
    assert.equal(sequenceSpan(12.4, 18.1), "12.4s–18.1s");
  });
});
