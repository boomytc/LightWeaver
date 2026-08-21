import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { clipArgs } from "./compose.ts";
import { runRender } from "./render.ts";
import { seedFootageFilm, tempWorkspace } from "./test-workspace.ts";
import { setLangs } from "./scenes.ts";

describe("clipArgs", () => {
  it("strips original audio for narration and maps the wav", () => {
    const args = clipArgs({
      source: "/src.mp4",
      start: 1.5,
      duration: 2,
      dest: "/out.mp4",
      ost: "narration",
      wav: "/line.wav",
      hasAudio: true,
    });
    assert.ok(args.includes("-ss"));
    assert.equal(args[args.indexOf("-ss") + 1], "1.500");
    assert.ok(args.includes("-map"));
    assert.ok(args.includes("1:a:0"));
    assert.ok(!args.some((item, i) => item === "-filter_complex"));
  });

  it("keeps source audio for original ost", () => {
    const args = clipArgs({
      source: "/src.mp4",
      start: 0,
      duration: 3,
      dest: "/out.mp4",
      ost: "original",
      hasAudio: true,
    });
    assert.ok(!args.includes("-i") || args.filter((item) => item === "-i").length === 1);
    assert.ok(args.includes("-c:a"));
  });

  it("mixes original and voice when ost is mix", () => {
    const args = clipArgs({
      source: "/src.mp4",
      start: 0,
      duration: 2,
      dest: "/out.mp4",
      ost: "mix",
      wav: "/line.wav",
      hasAudio: true,
    });
    const filter = args[args.indexOf("-filter_complex") + 1];
    assert.match(filter, /amix/);
    assert.match(filter, /volume=1.2/);
  });
});

describe("runCompose", () => {
  it("renders an all-original film without tts wavs", () => {
    const root = tempWorkspace();
    const project = seedFootageFilm(
      root,
      "keep-cut",
      [{ id: "keep", in: 0.2, out: 1.4, ost: "original", zh: "", en: "" }],
      { writeVideo: true },
    );
    setLangs(project, ["zh"]);
    writeColorVideo(path.join(project.root, "assets/source/origin.mp4"), 2);
    const result = runRender({ projectId: project.id, locale: "zh", root });
    assert.ok(result.files[0]?.dest && fs.existsSync(result.files[0].dest));
  });

  it("refuses to compose when the origin file is missing", () => {
    const root = tempWorkspace();
    const project = seedFootageFilm(root, "need-origin", [{ id: "say", in: 0, out: 1, ost: "narration" }]);
    setLangs(project, ["zh"]);
    assert.throws(() => runRender({ projectId: project.id, locale: "zh", root }), /还不能合成/);
  });

  it("cuts origin video into an output without Remotion", () => {
    const root = tempWorkspace();
    const project = seedFootageFilm(
      root,
      "site-rescue",
      [
        { id: "say", in: 0.2, out: 1.5, ost: "narration", zh: "说一句", en: "say" },
        { id: "keep", in: 1.6, out: 2.4, ost: "original", zh: "", en: "" },
      ],
      { writeVideo: true, writeWav: true },
    );
    setLangs(project, ["zh"]);
    const origin = path.join(project.root, "assets/source/origin.mp4");
    writeColorVideo(origin, 3);
    writeToneWav(path.join(project.root, "assets/lines/zh/say.wav"), 0.8);

    const result = runRender({ projectId: project.id, locale: "zh", root });
    const dest = result.files[0]?.dest;
    assert.ok(dest && fs.existsSync(dest));
    assert.match(dest, /assets\/outputs\/site-rescue\.mp4/);
    assert.ok(fs.existsSync(path.join(project.root, "assets/clips/zh/say.mp4")));
    assert.ok(fs.existsSync(path.join(project.root, "assets/clips/zh/keep.mp4")));
  });
});

function writeColorVideo(dest: string, seconds: number): void {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  execFileSync(
    "ffmpeg",
    [
      "-y",
      "-f",
      "lavfi",
      "-i",
      `color=c=blue:s=320x240:d=${seconds}`,
      "-f",
      "lavfi",
      "-i",
      `sine=frequency=440:duration=${seconds}`,
      "-pix_fmt",
      "yuv420p",
      "-shortest",
      dest,
    ],
    { stdio: "ignore" },
  );
}

function writeToneWav(dest: string, seconds: number): void {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  execFileSync(
    "ffmpeg",
    ["-y", "-f", "lavfi", "-i", `sine=frequency=880:duration=${seconds}`, dest],
    { stdio: "ignore" },
  );
}
