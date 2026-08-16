import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { filmVoiceRef, listVoicePacks, voiceCloneSource, voiceFile, voicePackId } from "./voices.ts";
import type { Asset } from "../types.ts";

describe("listVoicePacks", () => {
  it("keeps one bilingual library voice as a single pack", () => {
    const pack: Asset = {
      id: "voice.prompt",
      kind: "voice",
      label: "讲解女声",
      files: { zh: "voices/prompt-zh.wav", en: "voices/prompt-en.wav" },
    };
    const listed = listVoicePacks([pack, { id: "element.mark", kind: "element", file: "elements/mark.svg" }]);
    assert.equal(listed.length, 1);
    assert.equal(listed[0]?.id, "voice.prompt");
    assert.equal(voiceFile(pack, "zh"), "voices/prompt-zh.wav");
    assert.equal(voiceFile(pack, "en"), "voices/prompt-en.wav");
  });

  it("does not list zh and en leftovers as two picks", () => {
    const listed = listVoicePacks([
      { id: "voice.prompt-zh", kind: "voice", locale: "zh", file: "voices/prompt-zh.wav" },
      { id: "voice.prompt-en", kind: "voice", locale: "en", file: "voices/prompt-en.wav" },
    ]);
    assert.equal(listed.length, 1);
    assert.equal(voicePackId(listed[0]!), "voice.prompt");
  });

  it("treats instruct-designed wav as the clone source", () => {
    const source = voiceCloneSource({
      id: "voice.prompt",
      kind: "voice",
      files: { zh: "voices/prompt-zh.wav", en: "voices/prompt-en.wav" },
      texts: { zh: "中", en: "en" },
      style: "青春女声",
    });
    assert.equal(source.file, "voices/prompt-zh.wav");
    assert.equal(source.said, "中");
    assert.equal(source.instruct, "青春女声");
    assert.equal(source.origin, "instruct");
    assert.equal(filmVoiceRef({ zh: "library:voice.prompt", en: "library:voice.prompt" }), "library:voice.prompt");
  });

  it("treats a wav without instruct as an uploaded clone", () => {
    const source = voiceCloneSource({
      id: "voice.prompt",
      kind: "voice",
      file: "voices/voice.prompt.wav",
      text: "录音稿",
    });
    assert.equal(source.origin, "upload");
    assert.equal(source.file, "voices/voice.prompt.wav");
  });
});
