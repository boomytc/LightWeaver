import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  attachLines,
  buildSequences,
  descriptionIsReady,
  foldShortShots,
  foldSkippedSequences,
  markSkips,
  mergeSequences,
  pickFrameTimes,
  resolveDescribeWindow,
  sequencesInWindow,
  sequenceNeedsVision,
  shotsFromScenes,
  summaryFromSequences,
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

describe("foldShortShots / foldSkippedSequences", () => {
  it("folds adjacent shots shorter than minSequence into one span", () => {
    const folded = foldShortShots(
      [
        { in: 0, out: 1.1 },
        { in: 1.1, out: 3 },
        { in: 3, out: 4.5 },
      ],
      3,
    );
    assert.deepEqual(folded, [{ in: 0, out: 4.5 }]);
  });

  it("merges same-as-prev sequences into the previous field", () => {
    const folded = foldSkippedSequences([
      { id: "seq-01", in: 0, out: 4, shots: [{ in: 0, out: 4, t: 2 }], lines: [] },
      {
        id: "seq-02",
        in: 4,
        out: 6,
        shots: [{ in: 4, out: 6, t: 5, skip: "same-as-prev" }],
        lines: [],
      },
    ]);
    assert.equal(folded.length, 1);
    assert.equal(folded[0]?.id, "seq-01");
    assert.equal(folded[0]?.out, 6);
    assert.equal(folded[0]?.shots.length, 2);
  });

  it("builds at most four sequences from twelve similar 1.5s shots", () => {
    const hashes: FrameHash[] = Array.from({ length: 18 }, (_, t) => frame(t, ramp(true), [0, 0, 0]));
    const boundaries = Array.from({ length: 11 }, (_, i) => ({ time: (i + 1) * 1.5, score: 0.9 }));
    const sequences = buildSequences({ duration: 18, boundaries }, hashes);
    assert.ok(sequences.length <= 4, `expected ≤4 sequences, got ${sequences.length}`);
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

  it("joins sequence observations and filters a time window", () => {
    const sequences = [
      { id: "seq-01", in: 0, out: 8, observation: "黑场", shots: [{ in: 0, out: 8, t: 4 }], lines: [] },
      { id: "seq-02", in: 8, out: 20, observation: "红布", shots: [{ in: 8, out: 20, t: 14 }], lines: [] },
      { id: "seq-03", in: 20, out: 30, shots: [{ in: 20, out: 30, t: 25 }], lines: [] },
    ];
    assert.equal(summaryFromSequences(sequences), "黑场；红布");
    assert.deepEqual(
      sequencesInWindow(sequences, { from: 0, to: 4 }).map((item) => item.id),
      ["seq-01"],
    );
    assert.equal(resolveDescribeWindow(undefined, undefined, 30), undefined);
    assert.equal(resolveDescribeWindow(0, 90, 30), undefined);
    assert.deepEqual(resolveDescribeWindow(0, 10, 30), { from: 0, to: 10 });
    assert.throws(() => resolveDescribeWindow(8, 2, 30), /时间窗无效/);
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
