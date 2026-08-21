import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseTtsResult, runTts, ttsItems } from "./tts.ts";
import { seedFootageFilm, tempWorkspace } from "./test-workspace.ts";

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

describe("ttsItems", () => {
  it("skips original ost and empty lines", () => {
    const items = ttsItems(
      [
        { id: "say", kind: "clip", ost: "narration", lines: { zh: "这一下她没再退。" } },
        { id: "keep", kind: "clip", ost: "original", lines: { zh: "" } },
        { id: "quiet", kind: "clip", ost: "mix", lines: { zh: "  " } },
      ],
      "zh",
    );
    assert.deepEqual(
      items.map((item) => item.id),
      ["say"],
    );
  });
});

describe("runTts", () => {
  it("writes nothing for an all-original film and does not require wavs", () => {
    const root = tempWorkspace();
    const project = seedFootageFilm(root, "silent-cut", [
      { id: "keep", in: 1, out: 2, ost: "original", zh: "", en: "" },
    ]);
    const result = runTts({ projectId: project.id, root, locale: "zh" });
    assert.deepEqual(result.wrote, []);
  });
});
