import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseSilenceLog } from "./probe.ts";
import { coreText, splitSentences, stampSentences, stampTranscript, synthesizeWords } from "./sentences.ts";

describe("splitSentences", () => {
  it("keeps the terminator on each Chinese sentence", () => {
    assert.deepEqual(splitSentences("这一下她没再退。工地上有人喊。"), ["这一下她没再退。", "工地上有人喊。"]);
  });

  it("returns the whole string when there is no terminator", () => {
    assert.deepEqual(splitSentences("工地上救人"), ["工地上救人"]);
  });
});

describe("stampSentences", () => {
  it("lays sentences onto speech islands by character weight", () => {
    const sentences = stampSentences("甲。乙乙。", 10, [{ start: 1, end: 5 }]);
    assert.equal(sentences.length, 2);
    assert.equal(sentences[0]?.text, "甲。");
    assert.equal(sentences[1]?.text, "乙乙。");
    assert.ok((sentences[0]?.end ?? 0) <= (sentences[1]?.start ?? 0) + 1e-9);
    assert.ok((sentences[0]?.end ?? 0) - (sentences[0]?.start ?? 0) < (sentences[1]?.end ?? 0) - (sentences[1]?.start ?? 0));
    assert.ok((sentences[0]?.words.length ?? 0) > 0);
    const times = sentences.flatMap((sentence) => sentence.words.map((word) => word.start));
    for (let i = 1; i < times.length; i++) assert.ok(times[i]! >= times[i - 1]!);
  });

  it("uses the full span when there is no punctuation", () => {
    const sentences = stampSentences("工地上救人", 3, [{ start: 0, end: 3 }]);
    assert.equal(sentences.length, 1);
    assert.equal(sentences[0]?.start, 0);
    assert.equal(sentences[0]?.end, 3);
    assert.equal(coreText(sentences[0]?.text ?? ""), "工地上救人");
  });
});

describe("synthesizeWords", () => {
  it("skips punctuation and interpolates core chars", () => {
    const words = synthesizeWords("她没再退。", 2, 4);
    assert.deepEqual(words.map((word) => word.token), ["她", "没", "再", "退"]);
    assert.equal(words[0]?.start, 2);
    assert.ok((words.at(-1)?.end ?? 0) <= 4 + 1e-9);
  });
});

describe("stampTranscript", () => {
  it("does not rewrite a transcript that already has words", () => {
    const stamped = stampTranscript({
      source_path: "/a.mp4",
      duration: 2,
      full_text: "她没再退。",
      language: "zh",
      sentences: [{ text: "她没再退。", start: 0.2, end: 1.1, words: [{ token: "她", start: 0.2, end: 0.4 }] }],
    });
    assert.equal(stamped.sentences[0]?.start, 0.2);
    assert.equal(stamped.sentences[0]?.words.length, 1);
  });
});

describe("parseSilenceLog", () => {
  it("inverts silence intervals into speech islands", () => {
    const log = ["silence_start: 0.0", "silence_end: 1.0", "silence_start: 4.0", "silence_end: 5.0"].join("\n");
    assert.deepEqual(parseSilenceLog(log, 5), [{ start: 1, end: 4 }]);
  });

  it("treats a file with no silence as one island", () => {
    assert.deepEqual(parseSilenceLog("", 3), [{ start: 0, end: 3 }]);
  });
});
