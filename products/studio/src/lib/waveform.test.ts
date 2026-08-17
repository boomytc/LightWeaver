import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { bucketPeaks, formatClock, resamplePeaks } from "./waveform.ts";

describe("formatClock", () => {
  it("pads minutes and seconds", () => {
    assert.equal(formatClock(0), "00:00");
    assert.equal(formatClock(65), "01:05");
    assert.equal(formatClock(undefined), "00:00");
  });

  it("includes hours when needed", () => {
    assert.equal(formatClock(3661), "1:01:01");
  });
});

describe("bucketPeaks", () => {
  it("normalizes each bucket to the global peak", () => {
    assert.deepEqual(bucketPeaks([0, 1, 0, 0.5], 2), [1, 0.5]);
  });
});

describe("resamplePeaks", () => {
  it("keeps the same array when the count matches", () => {
    const peaks = [1, 0.5];
    assert.equal(resamplePeaks(peaks, 2), peaks);
  });

  it("samples source buckets across the new width", () => {
    assert.deepEqual(resamplePeaks([1, 0.5, 0.25, 0], 2), [1, 0.25]);
  });
});
