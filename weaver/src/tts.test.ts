import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseTtsResult } from "./tts.ts";

describe("parseTtsResult", () => {
  it("reads the wrote envelope, not the last nested object", () => {
    const output = '{"wrote": [{"scene": "title", "file": "assets/lines/zh/title.wav", "seconds": 5.12}]}';
    const result = parseTtsResult(output);
    assert.equal(result.wrote?.[0]?.scene, "title");
    assert.equal(result.wrote?.length, 1);
  });

  it("uses the last JSON line when logs precede it", () => {
    const output = ['noise', '{"wrote":[]}'].join("\n");
    assert.deepEqual(parseTtsResult(output).wrote, []);
  });
});
