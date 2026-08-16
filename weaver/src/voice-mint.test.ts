import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { keepLibraryVoice, resolveKeepSource } from "./voice-mint.ts";
import { loadLibrary, voiceParts } from "./assets.ts";
import { voiceCandidateRoot } from "./paths.ts";
import { tempWorkspace, touch } from "./test-workspace.ts";

describe("keepLibraryVoice", () => {
  it("stores a minted preview, not a clone source", () => {
    const root = tempWorkspace();
    const src = path.join(voiceCandidateRoot(root), "trial.wav");
    touch(src, "wav-bytes");
    const asset = keepLibraryVoice(
      { id: "voice.prompt", sourceAbs: src, said: "hello there", label: "讲解女声" },
      root,
    );
    assert.equal(asset.file, "voices/prompt-zh.wav");
    assert.equal(asset.text, "hello there");
    assert.equal(asset.files?.clone, undefined);
    assert.equal(fs.readFileSync(path.join(root, "library/voices/prompt-zh.wav"), "utf8"), "wav-bytes");
    assert.equal(loadLibrary(root).filter((item) => item.kind === "voice").length, 1);
    assert.equal(voiceParts(asset).preview?.file, "voices/prompt-zh.wav");
    assert.equal(voiceParts(asset).clone, undefined);
  });

  it("keeps a recording as clone without replacing preview", () => {
    const root = tempWorkspace();
    const preview = path.join(voiceCandidateRoot(root), "prev.wav");
    const clone = path.join(voiceCandidateRoot(root), "clone.wav");
    touch(preview, "preview");
    touch(clone, "clone");
    keepLibraryVoice({ id: "voice.prompt", sourceAbs: preview, said: "试听稿", as: "preview" }, root);
    const asset = keepLibraryVoice(
      { id: "voice.prompt", sourceAbs: clone, said: "克隆稿", as: "clone" },
      root,
    );
    assert.equal(asset.file, "voices/prompt-zh.wav");
    assert.equal(asset.text, "试听稿");
    assert.equal(asset.files?.clone, "voices/voice.prompt.clone.wav");
    assert.equal(asset.texts?.clone, "克隆稿");
    assert.equal(fs.readFileSync(path.join(root, "library/voices/voice.prompt.clone.wav"), "utf8"), "clone");
  });

  it("opens a new pack when the id is new", () => {
    const root = tempWorkspace();
    const src = path.join(voiceCandidateRoot(root), "new.wav");
    touch(src);
    const asset = keepLibraryVoice({ id: "voice.alt", sourceAbs: src, said: "你好" }, root);
    assert.equal(asset.id, "voice.alt");
    assert.equal(asset.file, "voices/voice.alt.wav");
    assert.equal(asset.text, "你好");
    assert.ok(fs.existsSync(path.join(root, "library", asset.file!)));
  });

  it("refuses a file outside the workspace trees", () => {
    const root = tempWorkspace();
    const outside = path.join(root, "nope.wav");
    touch(outside);
    assert.throws(() => keepLibraryVoice({ id: "voice.prompt", sourceAbs: outside }, root), /只能收下/);
    assert.throws(() => resolveKeepSource({ kind: "candidate", rel: "../nope.wav" }, root), /找不到音频|只能收下/);
  });
});
