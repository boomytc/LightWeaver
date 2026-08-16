import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { filmVoiceRef, listVoicePacks, voiceFile, voicePackId, voiceSlots } from "./voices.ts";
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

  it("marks the first kept wav as the primary slot", () => {
    const slots = voiceSlots({
      id: "voice.prompt",
      kind: "voice",
      files: { zh: "voices/prompt-zh.wav", en: "voices/prompt-en.wav" },
      texts: { zh: "中", en: "en" },
    });
    assert.equal(slots[0]?.primary, true);
    assert.equal(slots[0]?.key, "zh");
    assert.equal(filmVoiceRef({ zh: "library:voice.prompt", en: "library:voice.prompt" }), "library:voice.prompt");
  });
});
