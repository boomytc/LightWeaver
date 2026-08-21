import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { runTranscribe, transcriptFromAsr } from "./transcribe.ts";
import { parseAsrResult } from "./asr.ts";
import { loadProject } from "./project.ts";
import { seedFootageFilm, tempWorkspace } from "./test-workspace.ts";

describe("transcriptFromAsr", () => {
  it("wraps a whole-file ASR result as one sentence", () => {
    const result = transcriptFromAsr("/src.mp4", { text: "这一下她没再退。", language: "zh", seconds: 2.4 });
    assert.equal(result.full_text, "这一下她没再退。");
    assert.equal(result.sentences.length, 1);
    assert.equal(result.sentences[0]?.start, 0);
    assert.equal(result.sentences[0]?.end, 2.4);
    assert.deepEqual(result.sentences[0]?.words, []);
  });
});

describe("runTranscribe", () => {
  it("writes TranscriptResult next to the origin video", () => {
    const root = tempWorkspace();
    const project = seedFootageFilm(root, "site-rescue", [{ id: "say", in: 0, out: 1 }], { writeVideo: true });
    execFileSync(
      "ffmpeg",
      ["-y", "-f", "lavfi", "-i", "sine=frequency=440:duration=1", path.join(project.root, "assets/source/origin.mp4")],
      { stdio: "ignore" },
    );
    const result = runTranscribe({ projectId: project.id, ref: "asset:video.origin", root }, () => ({
      text: "工地上救人",
      language: "zh",
      seconds: 3,
    }));
    assert.equal(result.file, "assets/transcripts/video.origin.json");
    const abs = path.join(project.root, result.file);
    assert.ok(fs.existsSync(abs));
    const body = JSON.parse(fs.readFileSync(abs, "utf8"));
    assert.equal(body.full_text, "工地上救人");
    assert.equal(body.sentences[0].text, "工地上救人");
    assert.ok(body.sentences[0].words.length > 0);
    const reloaded = loadProject(project.id, root);
    assert.ok(reloaded.assets.some((asset) => asset.kind === "transcript" && asset.file === result.file));
    const again = runTranscribe({ projectId: project.id, ref: "asset:video.origin", root }, () => {
      throw new Error("should reuse stamped transcript");
    });
    assert.equal(again.transcript.full_text, "工地上救人");
  });

  it("keeps ASR sentences when they already carry words", () => {
    const parsed = parseAsrResult(
      JSON.stringify({
        text: "这一下她没再退。",
        language: "zh",
        seconds: 2,
        sentences: [
          {
            text: "这一下她没再退。",
            start: 0.2,
            end: 1.8,
            words: [{ token: "这", start: 0.2, end: 0.3 }],
          },
        ],
      }),
    );
    const result = transcriptFromAsr("/src.mp4", parsed);
    assert.equal(result.sentences[0]?.start, 0.2);
    assert.equal(result.sentences[0]?.words[0]?.token, "这");
  });
});
