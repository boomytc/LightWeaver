import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { addAsset } from "./assets.ts";
import { runMatch } from "./match.ts";
import { transcriptRel } from "./transcribe.ts";
import { synthesizeWords } from "./sentences.ts";
import {
  cutsFromVisualScenes,
  dHashFromGray,
  extractFrameHashes,
  findBestVisualWindow,
  hashScore,
  silentRanges,
  type FrameHash,
} from "./match-visual.ts";
import { createProject } from "./project.ts";
import { setLangs } from "./scenes.ts";
import { tempWorkspace } from "./test-workspace.ts";

function gray(value: number): Uint8Array {
  return Uint8Array.from({ length: 72 }, () => value);
}

function colorClip(dest: string, color: string, seconds: number): void {
  execFileSync(
    "ffmpeg",
    ["-y", "-f", "lavfi", "-i", `color=c=${color}:s=320x240:d=${seconds}`, "-pix_fmt", "yuv420p", dest],
    { stdio: "ignore" },
  );
}

describe("dHash", () => {
  it("scores identical frames as 1 and opposite ramps as lower", () => {
    const flat = dHashFromGray(gray(20));
    assert.equal(hashScore(flat, flat), 1);
    const up = dHashFromGray(Uint8Array.from({ length: 72 }, (_, i) => (i % 9) * 20));
    const down = dHashFromGray(Uint8Array.from({ length: 72 }, (_, i) => (8 - (i % 9)) * 20));
    assert.ok(hashScore(up, down) < 0.5);
  });
});

describe("silentRanges", () => {
  it("returns gaps between speech cuts", () => {
    assert.deepEqual(
      silentRanges(
        [
          { editedStart: 1, editedEnd: 2 },
          { editedStart: 4, editedEnd: 5 },
        ],
        8,
        0.35,
      ),
      [
        [0, 1],
        [2, 4],
        [5, 8],
      ],
    );
  });
});

function ramp(up: boolean): Uint8Array {
  return Uint8Array.from({ length: 72 }, (_, i) => (up ? i % 9 : 8 - (i % 9)) * 28);
}

function frame(t: number, up: boolean, mean: [number, number, number]): FrameHash {
  return { t, hash: dHashFromGray(ramp(up)), mean };
}

describe("occupied visual window", () => {
  it("skips a used span and takes the later twin", () => {
    const edited = [frame(0, true, [255, 0, 0]), frame(1, true, [255, 0, 0])];
    const source = Array.from({ length: 13 }, (_, t) => frame(t, true, [255, 0, 0]));
    const found = findBestVisualWindow(edited, source, 0, 2, 0, 13, 1, undefined, [[0, 6]]);
    assert.ok(found);
    assert.ok(found!.start >= 6, `expected unused red, got ${found!.start}`);
  });
});

describe("cutsFromVisualScenes continuity", () => {
  it("stays on the previous source when the local window is close enough", () => {
    const edited = [
      frame(0, false, [0, 0, 0]),
      frame(1, false, [0, 0, 0]),
      frame(2, false, [0, 0, 0]),
      frame(3, true, [255, 0, 0]),
      frame(4, true, [255, 0, 0]),
      frame(5, true, [255, 0, 0]),
    ];
    const ep01 = [
      frame(0, false, [0, 0, 0]),
      frame(1, false, [0, 0, 0]),
      frame(2, false, [0, 0, 0]),
      frame(3, true, [200, 30, 30]),
      frame(4, true, [200, 30, 30]),
      frame(5, true, [200, 30, 30]),
    ];
    const ep02 = [frame(0, true, [255, 0, 0]), frame(1, true, [255, 0, 0]), frame(2, true, [255, 0, 0])];
    const cuts = cutsFromVisualScenes(
      { duration: 6, boundaries: [{ time: 3, score: 0.9 }] },
      edited,
      new Map([
        ["asset:video.ep01", ep01],
        ["asset:video.ep02", ep02],
      ]),
    );
    assert.equal(cuts.length, 2);
    assert.equal(cuts[0]?.sourceRef, "asset:video.ep01");
    assert.equal(cuts[1]?.sourceRef, "asset:video.ep01");
    assert.ok((cuts[1]?.in ?? 0) >= 2.5);
  });
});

describe("visual window", () => {
  it("finds a red edited clip inside a black-red-black source", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "weaver-vis-"));
    const blackA = path.join(dir, "b1.mp4");
    const red = path.join(dir, "r.mp4");
    const blackB = path.join(dir, "b2.mp4");
    const source = path.join(dir, "source.mp4");
    const edited = path.join(dir, "edited.mp4");
    colorClip(blackA, "black", 3);
    colorClip(red, "red", 4);
    colorClip(blackB, "black", 3);
    colorClip(edited, "red", 2);
    const list = path.join(dir, "list.txt");
    fs.writeFileSync(list, [`file '${blackA}'`, `file '${red}'`, `file '${blackB}'`].join("\n"));
    execFileSync("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", source], { stdio: "ignore" });
    const sourceHashes = extractFrameHashes(source, path.join(dir, "source-hash"));
    const editedHashes = extractFrameHashes(edited, path.join(dir, "edited-hash"));
    const found = findBestVisualWindow(editedHashes, sourceHashes, 0, 2, 0, 10);
    assert.ok(found);
    assert.ok(found!.start >= 2 && found!.start <= 4, `expected red window near 3s, got ${found!.start}`);
  });
});

describe("runMatch visual mute path", () => {
  it("matches a mute red recut to the red span in the source", () => {
    const root = tempWorkspace();
    const project = createProject("color-clone", { task: "footage-narration" }, root);
    setLangs(project, ["zh"]);
    const source = path.join(project.root, "assets/source/ep01.mp4");
    const edited = path.join(project.root, "assets/source/edited.mp4");
    fs.mkdirSync(path.dirname(source), { recursive: true });
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "weaver-vis2-"));
    const blackA = path.join(dir, "b1.mp4");
    const red = path.join(dir, "r.mp4");
    const blackB = path.join(dir, "b2.mp4");
    colorClip(blackA, "black", 3);
    colorClip(red, "red", 4);
    colorClip(blackB, "black", 3);
    colorClip(edited, "red", 2);
    const list = path.join(dir, "list.txt");
    fs.writeFileSync(list, [`file '${blackA}'`, `file '${red}'`, `file '${blackB}'`].join("\n"));
    execFileSync("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", source], { stdio: "ignore" });
    addAsset({ kind: "project", project }, { id: "video.edited", kind: "video", file: edited }, root);
    addAsset({ kind: "project", project }, { id: "video.ep01", kind: "video", file: source }, root);
    const result = runMatch(
      { projectId: "color-clone", edited: "asset:video.edited", root, visual: true },
      { hasAudio: () => false },
    );
    assert.ok(result.cuts.length >= 1);
    const first = result.cuts[0]!;
    assert.equal(first.sourceRef, "asset:video.ep01");
    assert.ok(first.in >= 2 && first.in <= 5, `in=${first.in}`);
  });

  it("falls back to visual scenes when the edited speech does not match the source", () => {
    const root = tempWorkspace();
    const project = createProject("color-clone", { task: "footage-narration" }, root);
    setLangs(project, ["zh"]);
    const source = path.join(project.root, "assets/source/ep01.mp4");
    const edited = path.join(project.root, "assets/source/edited.mp4");
    fs.mkdirSync(path.dirname(source), { recursive: true });
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "weaver-vis3-"));
    const blackA = path.join(dir, "b1.mp4");
    const red = path.join(dir, "r.mp4");
    const blackB = path.join(dir, "b2.mp4");
    colorClip(blackA, "black", 3);
    colorClip(red, "red", 4);
    colorClip(blackB, "black", 3);
    colorClip(edited, "red", 2);
    const list = path.join(dir, "list.txt");
    fs.writeFileSync(list, [`file '${blackA}'`, `file '${red}'`, `file '${blackB}'`].join("\n"));
    execFileSync("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", source], { stdio: "ignore" });
    addAsset({ kind: "project", project }, { id: "video.edited", kind: "video", file: edited }, root);
    addAsset({ kind: "project", project }, { id: "video.ep01", kind: "video", file: source }, root);
    writeSpeech(project.root, "video.edited", "可是我嫁人那天。", 2);
    writeSpeech(project.root, "video.ep01", "tapi di hari pernikahanku", 10);
    let transcribed = 0;
    const result = runMatch(
      { projectId: "color-clone", edited: "asset:video.edited", root, visual: true },
      {
        hasAudio: () => true,
        transcribe: () => {
          transcribed += 1;
          throw new Error("should use cached transcript");
        },
      },
    );
    assert.equal(transcribed, 0);
    assert.ok(result.cuts.length >= 1);
    const first = result.cuts[0]!;
    assert.equal(first.sourceRef, "asset:video.ep01");
    assert.ok(first.in >= 2 && first.in <= 5, `in=${first.in}`);
    const report = JSON.parse(fs.readFileSync(path.join(project.root, result.report), "utf8")) as {
      warnings: string[];
    };
    assert.ok(report.warnings.some((line) => line.includes("对白与原片对不上")));
  });
});

function writeSpeech(projectRoot: string, videoId: string, text: string, end: number): void {
  const abs = path.join(projectRoot, transcriptRel(videoId));
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(
    abs,
    `${JSON.stringify(
      {
        source_path: abs,
        duration: end,
        full_text: text,
        language: "zh",
        sentences: [{ text, start: 0, end, words: synthesizeWords(text, 0, end) }],
      },
      null,
      2,
    )}\n`,
  );
}
