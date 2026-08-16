import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { keepLibraryVoice, resolveKeepSource, updateLibraryVoice, voiceIdFromName } from "./voice-mint.ts";
import { loadLibrary, removeLibraryAsset, voiceCloneSource } from "./assets.ts";
import { voiceCandidateRoot } from "./paths.ts";
import { tempWorkspace, touch } from "./test-workspace.ts";

describe("keepLibraryVoice", () => {
  it("keeps an instruct design as the one clone source", () => {
    const root = tempWorkspace();
    const src = path.join(voiceCandidateRoot(root), "trial.wav");
    touch(src, "wav-bytes");
    const asset = keepLibraryVoice(
      {
        id: "voice.prompt",
        sourceAbs: src,
        said: "hello there",
        label: "讲解女声",
        origin: "instruct",
        style: "青春女声",
      },
      root,
    );
    assert.equal(asset.file, "voices/prompt-zh.wav");
    assert.equal(asset.text, "hello there");
    assert.equal(asset.style, "青春女声");
    assert.equal(asset.files, undefined);
    assert.equal(fs.readFileSync(path.join(root, "library/voices/prompt-zh.wav"), "utf8"), "wav-bytes");
    assert.equal(loadLibrary(root).filter((item) => item.kind === "voice").length, 1);
    assert.equal(voiceCloneSource(asset).origin, "instruct");
    assert.equal(voiceCloneSource(asset).file, "voices/prompt-zh.wav");
  });

  it("upload replaces the clone and clears instruct", () => {
    const root = tempWorkspace();
    const designed = path.join(voiceCandidateRoot(root), "designed.wav");
    const uploaded = path.join(voiceCandidateRoot(root), "uploaded.wav");
    touch(designed, "designed");
    touch(uploaded, "uploaded");
    keepLibraryVoice(
      { id: "voice.prompt", sourceAbs: designed, said: "铸出的", origin: "instruct", style: "青春女声" },
      root,
    );
    const asset = keepLibraryVoice(
      { id: "voice.prompt", sourceAbs: uploaded, said: "录音稿", origin: "upload" },
      root,
    );
    assert.equal(asset.file, "voices/prompt-zh.wav");
    assert.equal(asset.text, "录音稿");
    assert.equal(asset.style, "");
    assert.equal(voiceCloneSource(asset).origin, "upload");
    assert.equal(fs.readFileSync(path.join(root, "library/voices/prompt-zh.wav"), "utf8"), "uploaded");
  });

  it("allocates a default id from the name", () => {
    const root = tempWorkspace();
    const src = path.join(voiceCandidateRoot(root), "named.wav");
    touch(src, "bytes");
    const asset = keepLibraryVoice(
      { sourceAbs: src, said: "稿", label: "讲解男声", origin: "instruct", style: "稳" },
      root,
    );
    assert.equal(asset.label, "讲解男声");
    assert.equal(asset.id, "voice.pack");
    touch(src, "bytes");
    assert.throws(
      () => keepLibraryVoice({ sourceAbs: src, said: "另一稿", label: "讲解男声", origin: "upload" }, root),
      /已在音色库里/,
    );
  });

  it("slugs an ascii name into the default id", () => {
    assert.equal(voiceIdFromName("Studio Narrator"), "voice.studio-narrator");
    assert.equal(voiceIdFromName("讲解女声", ["voice.prompt"]), "voice.pack");
    assert.equal(voiceIdFromName("讲解男声", ["voice.prompt", "voice.pack"]), "voice.pack-2");
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

  it("transcribes when upload keep has no text", () => {
    const root = tempWorkspace();
    const src = path.join(voiceCandidateRoot(root), "bare.wav");
    touch(src, "bytes");
    const asset = keepLibraryVoice(
      { sourceAbs: src, label: "讲解男声", origin: "upload" },
      root,
      () => ({ text: "自动转写稿" }),
    );
    assert.equal(asset.text, "自动转写稿");
    assert.equal(asset.label, "讲解男声");
    assert.equal(voiceCloneSource(asset).origin, "upload");
  });

  it("drops the trial wav after keep", () => {
    const root = tempWorkspace();
    const src = path.join(voiceCandidateRoot(root), "drop-me.wav");
    touch(src, "bytes");
    keepLibraryVoice({ sourceAbs: src, said: "稿", label: "临时声", origin: "upload" }, root);
    assert.equal(fs.existsSync(src), false);
  });

  it("renames a voice without changing the id", () => {
    const root = tempWorkspace();
    const src = path.join(voiceCandidateRoot(root), "named.wav");
    touch(src, "bytes");
    keepLibraryVoice({ sourceAbs: src, said: "稿", label: "旧名", origin: "upload" }, root);
    const next = updateLibraryVoice("voice.pack", { label: "新名", text: "改正文" }, root);
    assert.equal(next.id, "voice.pack");
    assert.equal(next.label, "新名");
    assert.equal(next.text, "改正文");
    assert.throws(() => updateLibraryVoice("voice.pack", { label: "讲解女声" }, root), /已在音色库里/);
    assert.throws(() => updateLibraryVoice("voice.pack", { text: "  " }, root), /文本不能空/);
  });

  it("removes the library wav with the catalog row", () => {
    const root = tempWorkspace();
    const src = path.join(voiceCandidateRoot(root), "gone.wav");
    touch(src, "bytes");
    const asset = keepLibraryVoice({ sourceAbs: src, said: "稿", label: "可删", origin: "upload" }, root);
    const dest = path.join(root, "library", asset.file!);
    assert.ok(fs.existsSync(dest));
    removeLibraryAsset(asset.id, root);
    assert.equal(fs.existsSync(dest), false);
    assert.equal(loadLibrary(root).some((item) => item.id === asset.id), false);
  });

  it("refuses a file outside the workspace trees", () => {
    const root = tempWorkspace();
    const outside = path.join(root, "nope.wav");
    touch(outside);
    assert.throws(() => keepLibraryVoice({ id: "voice.prompt", sourceAbs: outside }, root), /只能收下/);
    assert.throws(() => resolveKeepSource({ kind: "candidate", rel: "../nope.wav" }, root), /找不到音频|只能收下/);
  });
});
