import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { runRender } from "./render.ts";
import { addScene, removeScene, setLangs } from "./scenes.ts";
import { extractJpeg } from "./describe-frames.ts";
import { runDescribe } from "./describe.ts";
import { dHashFromGray, type FrameHash } from "./match-visual.ts";
import { loadProject } from "./project.ts";
import { projectPaths } from "./project-paths.ts";
import { createProject } from "./project.ts";
import { seedFootageFilm, seedLabFilm, tempWorkspace } from "./test-workspace.ts";
import { validateProject } from "./validate.ts";

const weaverPkg = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function ramp(up: boolean): Uint8Array {
  return Uint8Array.from({ length: 72 }, (_, i) => (up ? i % 9 : 8 - (i % 9)) * 28);
}

function frame(t: number, up: boolean, mean: [number, number, number]): FrameHash {
  return { t, hash: dHashFromGray(ramp(up)), mean };
}

function hashes(): FrameHash[] {
  return [
    frame(1, true, [0, 0, 0]),
    frame(5, false, [255, 0, 0]),
  ];
}

function stubJpeg() {
  return (_file: string, _t: number, dest: string) => {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, "jpeg");
  };
}

describe("runDescribe", () => {
  it("writes a description tree and does not rewrite film.json", () => {
    const root = tempWorkspace();
    const project = seedFootageFilm(root, "site-see", [{ id: "say", in: 0, out: 1 }], { writeVideo: true });
    const before = JSON.stringify(project.film.scenes);
    let calls = 0;
    const result = runDescribe(
      { projectId: project.id, ref: "asset:video.origin", root },
      {
        hasAudio: () => false,
        duration: () => 8,
        scenes: () => ({ duration: 8, boundaries: [{ time: 3, score: 0.9 }] }),
        hashes: () => hashes(),
        jpeg: stubJpeg(),
        vlm: ({ prev }) => {
          calls += 1;
          return { observation: prev ? "红布近景" : "黑场空镜" };
        },
      },
    );
    assert.equal(result.file, "assets/descriptions/video.origin.json");
    assert.equal(result.visualCalls, 2);
    assert.equal(calls, 2);
    assert.equal(result.description.sequences.length, 2);
    assert.equal(result.description.sequences[0]?.observation, "黑场空镜");
    assert.equal(result.description.sequences[1]?.observation, "红布近景");
    assert.equal(result.description.summary, "");
    const abs = path.join(project.root, result.file);
    assert.ok(fs.existsSync(abs));
    const reloaded = loadProject(project.id, root);
    assert.ok(reloaded.assets.some((asset) => asset.kind === "description" && asset.file === result.file));
    assert.equal(JSON.stringify(reloaded.film.scenes), before);
    const paths = projectPaths(reloaded, root);
    assert.equal(paths.descriptionFiles[0]?.rel, result.file);
    assert.equal(paths.descriptionFiles[0]?.exists, true);
  });

  it("reuses a ready tree and skips VLM until --force", () => {
    const root = tempWorkspace();
    const project = seedFootageFilm(root, "site-see", [{ id: "say", in: 0, out: 1 }], { writeVideo: true });
    const deps = {
      hasAudio: () => false,
      duration: () => 8,
      scenes: () => ({ duration: 8, boundaries: [{ time: 3, score: 0.9 }] }),
      hashes: () => hashes(),
      jpeg: stubJpeg(),
      vlm: () => ({ observation: "一次" }),
    };
    const first = runDescribe({ projectId: project.id, ref: "asset:video.origin", root }, deps);
    assert.equal(first.visualCalls, 2);
    let called = false;
    const second = runDescribe(
      { projectId: project.id, ref: "asset:video.origin", root },
      { ...deps, vlm: () => { called = true; return { observation: "二次" }; } },
    );
    assert.equal(called, false);
    assert.equal(second.visualCalls, 0);
    assert.equal(second.description.sequences[0]?.observation, "一次");
    const forced = runDescribe(
      { projectId: project.id, ref: "asset:video.origin", root, force: true },
      { ...deps, vlm: () => ({ observation: "重跑" }) },
    );
    assert.equal(forced.visualCalls, 2);
    assert.equal(forced.description.sequences[0]?.observation, "重跑");
  });

  it("skips VLM on dense dialogue unless --visual", () => {
    const root = tempWorkspace();
    const project = seedFootageFilm(root, "site-talk", [{ id: "say", in: 0, out: 1 }], { writeVideo: true });
    const deps = {
      hasAudio: () => true,
      duration: () => 6,
      scenes: () => ({ duration: 6, boundaries: [] }),
      hashes: () => hashes(),
      jpeg: stubJpeg(),
      transcribe: () => ({
        transcript: {
          source_path: "assets/source/origin.mp4",
          duration: 6,
          full_text: "一直在说。",
          language: "zh",
          sentences: [{ text: "一直在说。", start: 0, end: 5.5, words: [] }],
        },
      }),
    };
    let calls = 0;
    const skipped = runDescribe(
      { projectId: project.id, ref: "asset:video.origin", root },
      { ...deps, vlm: () => { calls += 1; return { observation: "不该看见" }; } },
    );
    assert.equal(calls, 0);
    assert.equal(skipped.visualCalls, 0);
    assert.equal(skipped.description.sequences[0]?.shots[0]?.skip, "dense-asr");
    const seen = runDescribe(
      { projectId: project.id, ref: "asset:video.origin", root, force: true, visual: true },
      { ...deps, vlm: () => { calls += 1; return { observation: "看见了" }; } },
    );
    assert.equal(calls, 1);
    assert.equal(seen.description.sequences[0]?.observation, "看见了");
  });

  it("fails on study-explainer", () => {
    const root = tempWorkspace();
    seedLabFilm(root, "intent-cascade", [{ id: "status", file: "status.png", role: "problem" }]);
    assert.throws(
      () => runDescribe({ projectId: "intent-cascade", root }, { vlm: () => ({ observation: "x" }) }),
      /只用于 footage-narration/,
    );
  });

  it("fails without a video asset", () => {
    const root = tempWorkspace();
    const project = createProject("empty-cut", { task: "footage-narration" }, root);
    assert.throws(() => runDescribe({ projectId: project.id, root }), /没有可描述的源视频/);
  });

  it("lets an agent turn sequences into original-sound clips", () => {
    const root = tempWorkspace();
    const project = seedFootageFilm(root, "site-see", [{ id: "say", in: 0, out: 1, ost: "original", zh: "", en: "" }], {
      writeVideo: true,
    });
    const result = runDescribe(
      { projectId: project.id, ref: "asset:video.origin", root },
      {
        hasAudio: () => false,
        duration: () => 8,
        scenes: () => ({ duration: 8, boundaries: [{ time: 3, score: 0.9 }] }),
        hashes: () => hashes(),
        jpeg: stubJpeg(),
        vlm: () => ({ observation: "空镜" }),
      },
    );
    const live = loadProject(project.id, root);
    for (const sequence of result.description.sequences) {
      addScene(live, {
        id: sequence.id,
        kind: "clip",
        source: "asset:video.origin",
        in: sequence.in,
        out: sequence.out,
        ost: "original",
      });
    }
    if (live.film.scenes.some((scene) => scene.id === "say")) removeScene(live, "say");
    const issues = validateProject(loadProject(project.id, root), root);
    assert.equal(issues.filter((issue) => issue.level === "error").length, 0);
    const scenes = loadProject(project.id, root).film.scenes.filter((scene) => scene.kind === "clip");
    assert.equal(scenes.length, 2);
    assert.equal(scenes[0]?.id, "seq-01");
    assert.equal(scenes[0]?.ost, "original");
  });

  it("renders original-sound clips taken from the description tree", () => {
    const root = tempWorkspace();
    const project = seedFootageFilm(root, "site-see", [{ id: "say", in: 0, out: 1, ost: "original", zh: "", en: "" }], {
      writeVideo: true,
    });
    setLangs(project, ["zh"]);
    const origin = path.join(project.root, "assets/source/origin.mp4");
    execFileSync(
      "ffmpeg",
      ["-y", "-f", "lavfi", "-i", "color=c=blue:s=320x240:d=4", "-pix_fmt", "yuv420p", origin],
      { stdio: "ignore" },
    );
    const result = runDescribe(
      { projectId: project.id, ref: "asset:video.origin", root },
      {
        hasAudio: () => false,
        duration: () => 4,
        scenes: () => ({ duration: 4, boundaries: [{ time: 2, score: 0.9 }] }),
        hashes: () => hashes(),
        jpeg: stubJpeg(),
        vlm: () => ({ observation: "蓝场" }),
      },
    );
    const live = loadProject(project.id, root);
    for (const sequence of result.description.sequences) {
      addScene(live, {
        id: sequence.id,
        kind: "clip",
        source: "asset:video.origin",
        in: sequence.in,
        out: sequence.out,
        ost: "original",
      });
    }
    removeScene(live, "say");
    const rendered = runRender({ projectId: project.id, locale: "zh", root });
    assert.ok(rendered.files[0]?.dest && fs.existsSync(rendered.files[0].dest));
  });
});

describe("extractJpeg", () => {
  it("writes a readable jpeg from a color clip", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "weaver-jpeg-"));
    const video = path.join(dir, "red.mp4");
    const dest = path.join(dir, "frame.jpg");
    execFileSync(
      "ffmpeg",
      ["-y", "-f", "lavfi", "-i", "color=c=red:s=320x240:d=1", "-pix_fmt", "yuv420p", video],
      { stdio: "ignore" },
    );
    extractJpeg(video, 0.4, dest, 160);
    assert.ok(fs.statSync(dest).size > 200);
    extractJpeg(video, 0.4, dest, 160);
    const size = fs.statSync(dest).size;
    assert.ok(size > 200);
  });
});

describe("weaver describe CLI", () => {
  it("reuses a ready tree through the CLI without calling VLM", () => {
    const root = tempWorkspace();
    const project = seedFootageFilm(root, "site-cli", [{ id: "say", in: 0, out: 1 }], { writeVideo: true });
    runDescribe(
      { projectId: project.id, ref: "asset:video.origin", root },
      {
        hasAudio: () => false,
        duration: () => 8,
        scenes: () => ({ duration: 8, boundaries: [{ time: 3, score: 0.9 }] }),
        hashes: () => hashes(),
        jpeg: stubJpeg(),
        vlm: () => ({ observation: "缓存树" }),
      },
    );
    const result = spawnSync(
      process.execPath,
      ["--import", "tsx", "src/cli.ts", "describe", "--project", project.id, "--ref", "asset:video.origin", "--json"],
      { cwd: weaverPkg, encoding: "utf8", env: { ...process.env, LIGHTWEAVER_ROOT: root } },
    );
    assert.equal(result.status, 0, result.stderr);
    const body = JSON.parse(result.stdout);
    assert.equal(body.describe.visualCalls, 0);
    assert.equal(body.describe.file, "assets/descriptions/video.origin.json");
    assert.equal(body.describe.sequences[0]?.observation, "缓存树");
    assert.equal(body.film.scenes[0]?.id, "say");
  });
});
