import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { activeCue, cuesFromLine } from "./subtitles";

describe("cuesFromLine", () => {
  it("returns empty for blank text", () => {
    assert.deepEqual(cuesFromLine("   ", 90), []);
  });

  it("splits on sentence punctuation and covers the tail", () => {
    const cues = cuesFromLine("第一句。第二句。", 120);
    assert.equal(cues.length, 2);
    assert.equal(cues[0]?.text, "第一句。");
    const last = cues[1];
    assert.ok(last);
    assert.equal(last.text, "第二句。");
    assert.ok(last.from + last.durationInFrames <= 120);
    assert.ok(last.from + last.durationInFrames >= 116);
  });

  it("picks the cue that owns the frame", () => {
    const cues = cuesFromLine("Hello. World.", 80);
    assert.equal(activeCue(cues, 0), null);
    assert.equal(activeCue(cues, cues[0]!.from)?.text, "Hello.");
    const last = cues.at(-1);
    assert.ok(last);
    assert.equal(activeCue(cues, last.from)?.text, "World.");
  });
});
