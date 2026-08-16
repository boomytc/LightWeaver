import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { listVoiceSets, patchLibraryAsset, resolveVoicePrompt, voiceCloneText, voiceHifiRef, voiceParts, voiceSetId, voiceStyle } from "./assets.ts";
import { tempWorkspace, touch } from "./test-workspace.ts";
import type { Asset } from "./schema.ts";

describe("voice packs", () => {
  it("treats one bilingual asset as a single set", () => {
    const asset: Asset = {
      id: "voice.prompt",
      kind: "voice",
      files: { zh: "voices/prompt-zh.wav", en: "voices/prompt-en.wav" },
      texts: { zh: "中文稿", en: "English prompt" },
      label: "讲解女声",
    };
    assert.equal(voiceSetId(asset), "voice.prompt");
    assert.equal(voiceCloneText(asset, "zh"), "中文稿");
    assert.equal(voiceCloneText(asset, "en"), "English prompt");
    const sets = listVoiceSets([asset]);
    assert.equal(sets.length, 1);
    assert.deepEqual(sets[0]?.locales.sort(), ["en", "zh"]);
    assert.equal(sets[0]?.ref, "library:voice.prompt");
  });

  it("groups leftover per-locale voice assets into one set", () => {
    const sets = listVoiceSets([
      { id: "voice.prompt-zh", kind: "voice", locale: "zh", file: "voices/prompt-zh.wav" },
      { id: "voice.prompt-en", kind: "voice", locale: "en", file: "voices/prompt-en.wav" },
    ]);
    assert.equal(sets.length, 1);
    assert.equal(sets[0]?.id, "voice.prompt");
  });

  it("merges texts and styles onto a library pack", () => {
    const root = tempWorkspace();
    const next = patchLibraryAsset(
      "voice.prompt",
      {
        texts: { zh: "新中文稿", en: "new english" },
        styles: { zh: "稳", en: "steady" },
      },
      root,
    );
    assert.equal(next.texts?.zh, "新中文稿");
    assert.equal(next.texts?.en, "new english");
    assert.equal(next.styles?.en, "steady");
    assert.equal(next.locale, undefined);
  });

  it("treats leftover locale wavs as preview, not clone", () => {
    const asset: Asset = {
      id: "voice.prompt",
      kind: "voice",
      files: { zh: "voices/prompt-zh.wav", en: "voices/prompt-en.wav" },
      texts: { zh: "中文稿", en: "English prompt" },
      style: "青春女声",
    };
    const parts = voiceParts(asset);
    assert.equal(parts.preview?.file, "voices/prompt-zh.wav");
    assert.equal(parts.preview?.said, "中文稿");
    assert.equal(parts.clone, undefined);
    assert.equal(parts.instruct, "青春女声");
    assert.equal(voiceHifiRef(asset)?.file, "voices/prompt-zh.wav");
  });

  it("prefers preview over clone for Hi-Fi", () => {
    const asset: Asset = {
      id: "voice.prompt",
      kind: "voice",
      file: "voices/voice.prompt.wav",
      text: "试听稿",
      files: { clone: "voices/voice.prompt.clone.wav" },
      texts: { clone: "克隆稿" },
    };
    assert.equal(voiceHifiRef(asset)?.file, "voices/voice.prompt.wav");
    assert.equal(voiceHifiRef(asset)?.said, "试听稿");
  });

  it("falls back to the other side of a voice pack", () => {
    const root = tempWorkspace();
    const zh = `${root}/library/voices/prompt-zh.wav`;
    touch(zh);
    const resolved = resolveVoicePrompt(null, "library:voice.prompt", "en", root);
    assert.ok(resolved);
    assert.equal(resolved.relPath, "voices/prompt-zh.wav");
    assert.equal(voiceStyle({ id: "voice.prompt", kind: "voice", styles: { zh: "稳" } }, "en"), "稳");
  });
});
