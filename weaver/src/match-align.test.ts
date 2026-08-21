import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  alignEditedToSources,
  alignSentence,
  buildSourceCorpus,
  matchingBlocks,
  pickCandidate,
  sequenceRatio,
} from "./match-align.ts";
import { synthesizeWords, type TranscriptDoc } from "./sentences.ts";

function transcript(text: string, start: number, end: number, source = "/a.mp4"): TranscriptDoc {
  return {
    source_path: source,
    duration: end,
    full_text: text,
    language: "zh",
    sentences: [{ text, start, end, words: synthesizeWords(text, start, end) }],
  };
}

describe("sequenceRatio", () => {
  it("is 1 for identical strings and 0 for disjoint ones", () => {
    assert.equal(sequenceRatio("这一下她没再退", "这一下她没再退"), 1);
    assert.equal(sequenceRatio("abc", "xyz"), 0);
  });

  it("finds the longest matching block", () => {
    const blocks = matchingBlocks("这一下她没再退", "工地这一下她没再退了然后走");
    assert.ok(blocks.some((block) => block.size >= 7));
  });
});

describe("alignSentence", () => {
  it("recovers the source window for a sentence", () => {
    const sources = [{ ref: "asset:video.ep01", transcript: transcript("工地这一下她没再退了然后走。", 10, 20) }];
    const { text, mapping } = buildSourceCorpus(sources);
    const candidates = alignSentence("这一下她没再退", text, mapping);
    const best = pickCandidate(candidates);
    assert.ok(best);
    assert.equal(best?.sourceRef, "asset:video.ep01");
    assert.ok((best?.tStart ?? 99) < 16);
    assert.ok((best?.tEnd ?? 0) > 12);
    assert.ok((best?.score ?? 0) >= 0.6);
  });

  it("does not cross into another source file", () => {
    const { text, mapping } = buildSourceCorpus([
      { ref: "asset:video.ep01", transcript: transcript("前面垫话。", 0, 4) },
      { ref: "asset:video.ep02", transcript: transcript("这一下她没再退。", 4, 10) },
    ]);
    const candidates = alignSentence("这一下她没再退", text, mapping);
    assert.ok(candidates.every((item) => item.sourceRef === "asset:video.ep02"));
  });

  it("returns nothing below the fuzzy threshold", () => {
    const { text, mapping } = buildSourceCorpus([
      { ref: "asset:video.ep01", transcript: transcript("完全不相干的内容。", 0, 3) },
    ]);
    assert.equal(alignSentence("这一下她没再退", text, mapping).length, 0);
  });
});

describe("alignEditedToSources", () => {
  it("aligns each edited sentence", () => {
    const edited = transcript("这一下她没再退。工地上有人喊。", 0, 4);
    edited.sentences = [
      { text: "这一下她没再退。", start: 0, end: 2, words: synthesizeWords("这一下她没再退。", 0, 2) },
      { text: "工地上有人喊。", start: 2, end: 4, words: synthesizeWords("工地上有人喊。", 2, 4) },
    ];
    const rows = alignEditedToSources(edited, [
      {
        ref: "asset:video.ep01",
        transcript: transcript("旁白这一下她没再退。工地上有人喊完。", 8, 20),
      },
    ]);
    assert.equal(rows.length, 2);
    assert.ok(rows.every((row) => row.candidates.length > 0));
  });
});
