import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  attachLines,
  buildSequences,
  descriptionIsReady,
  markSkips,
  mergeSequences,
  pickFrameTimes,
  sequenceNeedsVision,
  shotsFromScenes,
} from "./describe-group.ts";
import { dHashFromGray, type FrameHash } from "./match-visual.ts";

function ramp(up: boolean): Uint8Array {
  return Uint8Array.from({ length: 72 }, (_, i) => (up ? i % 9 : 8 - (i % 9)) * 28);
}

function frame(t: number, pixels: Uint8Array, mean: [number, number, number]): FrameHash {
  return { t, hash: dHashFromGray(pixels), mean };
}

describe("shotsFromScenes", () => {
  it("cuts on scene boundaries and folds shots shorter than minShot", () => {
    const shots = shotsFromScenes({
      duration: 10,
      boundaries: [
        { time: 3, score: 0.6 },
        { time: 3.1, score: 0.7 },
        { time: 7, score: 0.5 },
      ],
    });
    assert.deepEqual(
      shots.map((shot) => [shot.in, shot.out]),
      [
        [0, 3.1],
        [3.1, 7],
        [7, 10],
      ],
    );
  });

  it("returns one shot when there are no boundaries", () => {
    assert.deepEqual(shotsFromScenes({ duration: 4, boundaries: [] }), [{ in: 0, out: 4 }]);
  });
});

describe("mergeSequences / attachLines / skip", () => {
  const black = ramp(true);
  const blackMean: [number, number, number] = [0, 0, 0];
  const redMean: [number, number, number] = [255, 0, 0];
  const hashes: FrameHash[] = [
    frame(0.5, black, blackMean),
    frame(1.5, black, blackMean),
    frame(3.5, ramp(false), redMean),
    frame(5.5, ramp(false), redMean),
    frame(8, ramp(true), [0, 0, 255]),
  ];

  it("merges consecutive similar shots and keeps a cut when coverage changes", () => {
    const groups = mergeSequences(
      [
        { in: 0, out: 2 },
        { in: 2, out: 4 },
        { in: 4, out: 7 },
        { in: 7, out: 10 },
      ],
      hashes,
    );
    assert.equal(groups.length, 3);
    assert.equal(groups[0]?.length, 1);
    assert.equal(groups[1]?.length, 2);
    assert.equal(groups[2]?.length, 1);
  });

  it("hangs overlapping transcript lines onto the matching sequence", () => {
    const sequences = attachLines(
      [
        { id: "seq-01", in: 0, out: 4, shots: [{ in: 0, out: 4, t: 2 }], lines: [] },
        { id: "seq-02", in: 4, out: 8, shots: [{ in: 4, out: 8, t: 6 }], lines: [] },
      ],
      [
        { text: "前半句。", start: 0.2, end: 3.5 },
        { text: "后半句。", start: 5, end: 7 },
      ],
    );
    assert.deepEqual(
      sequences.map((item) => item.lines.map((line) => line.text)),
      [["前半句。"], ["后半句。"]],
    );
  });

  it("marks dense-asr when dialogue covers the sequence and same-as-prev across similar sequences", () => {
    const dense = markSkips(
      [
        {
          id: "seq-01",
          in: 0,
          out: 10,
          shots: [{ in: 0, out: 10, t: 5 }],
          lines: [{ text: "一路在说。", start: 0, end: 8 }],
        },
      ],
      hashes,
    );
    assert.equal(dense[0]?.shots[0]?.skip, "dense-asr");
    assert.equal(sequenceNeedsVision(dense[0]!), false);

    const forced = markSkips(
      [
        {
          id: "seq-01",
          in: 0,
          out: 10,
          shots: [{ in: 0, out: 10, t: 5 }],
          lines: [{ text: "一路在说。", start: 0, end: 8 }],
        },
      ],
      hashes,
      { visual: true },
    );
    assert.equal(forced[0]?.shots[0]?.skip, undefined);

    const repeated = markSkips(
      [
        { id: "seq-01", in: 0, out: 1, shots: [{ in: 0, out: 1, t: 0.5 }], lines: [] },
        { id: "seq-02", in: 1, out: 2, shots: [{ in: 1, out: 2, t: 1.5 }], lines: [] },
      ],
      hashes,
    );
    assert.equal(repeated[1]?.shots[0]?.skip, "same-as-prev");
  });
});

describe("pickFrameTimes / descriptionIsReady", () => {
  it("picks the midpoint of a short sequence and head/mid/tail of a long one", () => {
    const short = {
      id: "seq-01",
      in: 0,
      out: 1.2,
      shots: [{ in: 0, out: 1.2, t: 0.6 }],
      lines: [],
    };
    assert.deepEqual(pickFrameTimes(short), [0.6]);
    const long = {
      id: "seq-02",
      in: 0,
      out: 8,
      shots: [{ in: 0, out: 8, t: 4 }],
      lines: [],
    };
    assert.deepEqual(pickFrameTimes(long), [0.1, 4, 7.9]);
    assert.deepEqual(pickFrameTimes({ ...short, shots: [{ in: 0, out: 1.2, t: 0.6, skip: "dense-asr" }] }), []);
  });

  it("treats a tree with sequences as ready", () => {
    assert.equal(
      descriptionIsReady({
        source_path: "/x.mp4",
        duration: 4,
        summary: "",
        sequences: [{ id: "seq-01", in: 0, out: 4, shots: [{ in: 0, out: 4, t: 2 }], lines: [] }],
      }),
      true,
    );
    assert.equal(descriptionIsReady({ source_path: "/x.mp4", duration: 4, summary: "", sequences: [] }), false);
  });
});

describe("buildSequences", () => {
  it("builds a skippable tree from scenes, hashes and lines", () => {
    const hashes: FrameHash[] = [
      frame(1, ramp(true), [0, 0, 0]),
      frame(5, ramp(false), [255, 0, 0]),
    ];
    const sequences = buildSequences(
      { duration: 8, boundaries: [{ time: 3, score: 0.8 }] },
      hashes,
      [{ text: "只有前半段在说。", start: 0, end: 2.8 }],
    );
    assert.equal(sequences.length, 2);
    assert.equal(sequences[0]?.shots[0]?.skip, "dense-asr");
    assert.equal(sequenceNeedsVision(sequences[0]!), false);
    assert.equal(sequenceNeedsVision(sequences[1]!), true);
  });
});
