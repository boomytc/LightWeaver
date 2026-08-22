import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isTruncated, stitchAsrResults, stripOverlap, windowsFor } from "./asr-chunk.ts";
import { ASR_SETTINGS } from "./asr-settings.ts";
import { runAsr } from "./asr.ts";
import { tempWorkspace } from "./test-workspace.ts";
import fs from "node:fs";
import path from "node:path";

describe("windowsFor", () => {
  it("keeps a short clip as one window", () => {
    assert.deepEqual(windowsFor(12), [{ start: 0, end: 12 }]);
  });

  it("splits 90s into three overlapping windows", () => {
    const windows = windowsFor(90);
    assert.equal(windows.length, 3);
    assert.equal(windows[0]?.start, 0);
    assert.equal(windows[0]?.end, ASR_SETTINGS.chunkSeconds);
    assert.equal(windows[1]?.start, ASR_SETTINGS.chunkSeconds - ASR_SETTINGS.overlapSeconds);
    assert.equal(windows.at(-1)?.end, 90);
  });
});

describe("stripOverlap / stitchAsrResults", () => {
  it("drops a duplicated prefix on the next window", () => {
    assert.equal(stripOverlap("你好世界", "世界后面"), "后面");
  });

  it("offsets sentence times and joins Chinese without spaces", () => {
    const stitched = stitchAsrResults([
      {
        start: 0,
        end: 40,
        result: {
          text: "先把名称说清楚",
          language: "zh",
          seconds: 40,
          sentences: [{ text: "先把名称说清楚", start: 0, end: 8 }],
        },
      },
      {
        start: 38,
        end: 78,
        result: {
          text: "再说规则",
          language: "zh",
          seconds: 40,
          sentences: [{ text: "再说规则", start: 2, end: 6 }],
        },
      },
    ]);
    assert.equal(stitched.text, "先把名称说清楚再说规则");
    assert.equal(stitched.language, "zh");
    assert.equal(stitched.seconds, 78);
    assert.equal(stitched.sentences?.[1]?.start, 40);
    assert.equal(stitched.sentences?.[1]?.end, 44);
  });
});

describe("isTruncated", () => {
  it("flags OutputTruncated and sparse text", () => {
    assert.equal(isTruncated({ text: "够了的句子", log: "ok" }, 10), false);
    assert.equal(isTruncated({ text: "半句", log: "ggml OutputTruncated" }, 40), true);
    assert.equal(isTruncated({ text: "ab", truncated: true }, 10), true);
    assert.equal(isTruncated({ text: "x" }, 40), true);
    assert.equal(isTruncated({ text: "" }, 10), false);
  });
});

describe("runAsr chunking", () => {
  it("does not slice a short wav", () => {
    const root = tempWorkspace();
    const wav = path.join(root, "clip.wav");
    fs.writeFileSync(wav, "RIFF");
    let sliced = 0;
    const result = runAsr(
      { audio: wav, root },
      {
        duration: () => 12,
        slice: () => {
          sliced += 1;
        },
        engine: () => ({ text: "短句", language: "zh", seconds: 12 }),
      },
    );
    assert.equal(sliced, 0);
    assert.equal(result.text, "短句");
    assert.equal(result.seconds, 12);
  });

  it("slices a 90s file into three windows", () => {
    const root = tempWorkspace();
    const wav = path.join(root, "long.wav");
    fs.writeFileSync(wav, "RIFF");
    const starts: number[] = [];
    const result = runAsr(
      { audio: wav, root },
      {
        duration: () => 90,
        slice: (_file, start, _duration, dest) => {
          starts.push(start);
          fs.writeFileSync(dest, "RIFF");
        },
        engine: (audio) => {
          const startMs = Number(path.basename(audio).replace(/\.wav$/, "").split("-").at(-2));
          const text =
            startMs === 0
              ? "先把名称、场景和规则说清楚，再动手做交互。"
              : startMs < 50000
                ? "场景和规则要分开讲明白，不要混成一句。"
                : "最后收束到对照这一条，听者只记一对。";
          return { text, language: "zh", seconds: 40 };
        },
      },
    );
    assert.equal(starts.length, 3);
    assert.equal(starts[0], 0);
    assert.match(result.text, /先把名称/);
    assert.match(result.text, /最后收束/);
    assert.equal(result.seconds, 90);
  });

  it("splits a truncated window once", () => {
    const root = tempWorkspace();
    const wav = path.join(root, "long.wav");
    fs.writeFileSync(wav, "RIFF");
    const spans: string[] = [];
    const result = runAsr(
      { audio: wav, root },
      {
        duration: () => 50,
        slice: (_file, start, duration, dest) => {
          spans.push(`${start}-${start + duration}`);
          fs.writeFileSync(dest, "RIFF");
        },
        engine: () => {
          const span = spans.at(-1) ?? "";
          const width = Number(span.split("-")[1]) - Number(span.split("-")[0]);
          if (width > 30) return { text: "半句而已", language: "zh", seconds: width, truncated: true };
          return { text: `这一段已经把名称和规则说清楚了。${spans.length}`, language: "zh", seconds: width };
        },
      },
    );
    assert.ok(spans.some((item) => Number(item.split("-")[1]) - Number(item.split("-")[0]) > 35));
    assert.ok(spans.some((item) => Number(item.split("-")[1]) - Number(item.split("-")[0]) <= 25));
    assert.match(result.text, /这一段已经把名称/);
    assert.equal(result.seconds, 50);
  });

  it("keeps earlier windows when a short tail is silent", () => {
    const root = tempWorkspace();
    const wav = path.join(root, "long.wav");
    fs.writeFileSync(wav, "RIFF");
    const result = runAsr(
      { audio: wav, root },
      {
        duration: () => 50,
        slice: (_file, _start, _duration, dest) => {
          fs.writeFileSync(dest, "RIFF");
        },
        engine: (audio) => {
          const startMs = Number(path.basename(audio).replace(/\.wav$/, "").split("-").at(-2));
          if (startMs >= 38000) return { text: "", language: "zh", seconds: 12 };
          return { text: "先把名称、场景和规则说清楚，再动手做交互。", language: "zh", seconds: 40 };
        },
      },
    );
    assert.match(result.text, /先把名称/);
    assert.equal(result.seconds, 50);
  });
});
