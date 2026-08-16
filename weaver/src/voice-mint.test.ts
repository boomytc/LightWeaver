import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { keepLibraryVoice, resolveKeepSource, voiceKeepRel } from "./voice-mint.ts";
import { loadLibrary } from "./assets.ts";
import { voiceCandidateRoot } from "./paths.ts";
import { tempWorkspace, touch } from "./test-workspace.ts";

describe("keepLibraryVoice", () => {
  it("copies a candidate wav into the library pack", () => {
    const root = tempWorkspace();
    const src = path.join(voiceCandidateRoot(root), "trial.wav");
    touch(src, "wav-bytes");
    const asset = keepLibraryVoice(
      { id: "voice.prompt", locale: "en", sourceAbs: src, said: "hello there", label: "讲解女声" },
      root,
    );
    assert.equal(asset.files?.en, "voices/prompt-en.wav");
    assert.equal(asset.texts?.en, "hello there");
    assert.equal(fs.readFileSync(path.join(root, "library/voices/prompt-en.wav"), "utf8"), "wav-bytes");
    assert.equal(loadLibrary(root).filter((item) => item.kind === "voice").length, 1);
  });

  it("opens a new pack when the id is new", () => {
    const root = tempWorkspace();
    const src = path.join(voiceCandidateRoot(root), "new.wav");
    touch(src);
    const asset = keepLibraryVoice({ id: "voice.alt", locale: "zh", sourceAbs: src, said: "你好" }, root);
    assert.equal(asset.id, "voice.alt");
    assert.equal(asset.files?.zh, voiceKeepRel("voice.alt", "zh"));
    assert.ok(fs.existsSync(path.join(root, "library", asset.files!.zh!)));
  });

  it("refuses a file outside the workspace trees", () => {
    const root = tempWorkspace();
    const outside = path.join(root, "nope.wav");
    touch(outside);
    assert.throws(() => keepLibraryVoice({ id: "voice.prompt", locale: "zh", sourceAbs: outside }, root), /只能收下/);
    assert.throws(() => resolveKeepSource({ kind: "candidate", rel: "../nope.wav" }, root), /找不到音频|只能收下/);
  });
});
