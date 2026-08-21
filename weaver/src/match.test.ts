import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { addAsset } from "./assets.ts";
import { cutsToSrt, formatSrtTime, runMatch } from "./match.ts";
import { createProject, loadProject, saveFilm } from "./project.ts";
import { setLangs } from "./scenes.ts";
import { transcriptRel } from "./transcribe.ts";
import { synthesizeWords } from "./sentences.ts";
import { tempWorkspace, touch } from "./test-workspace.ts";

function writeTranscript(
  projectRoot: string,
  videoId: string,
  text: string,
  start: number,
  end: number,
): void {
  const rel = transcriptRel(videoId);
  const abs = path.join(projectRoot, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(
    abs,
    `${JSON.stringify(
      {
        source_path: abs,
        duration: end,
        full_text: text,
        language: "zh",
        sentences: [{ text, start, end, words: synthesizeWords(text, start, end) }],
      },
      null,
      2,
    )}\n`,
  );
}

function seedCloneProject(root: string) {
  const project = createProject("site-clone", { task: "footage-narration", title: "复刻" }, root);
  setLangs(project, ["zh"]);
  saveFilm(project, { ...project.film, recipe: "clone-from-edit" });
  touch(path.join(project.root, "assets/source/edited.mp4"));
  touch(path.join(project.root, "assets/source/ep01.mp4"));
  addAsset({ kind: "project", project }, { id: "video.edited", kind: "video", file: "assets/source/edited.mp4" }, root);
  addAsset({ kind: "project", project }, { id: "video.ep01", kind: "video", file: "assets/source/ep01.mp4" }, root);
  writeTranscript(project.root, "video.edited", "这一下她没再退。", 0, 2);
  writeTranscript(project.root, "video.ep01", "工地这一下她没再退了然后走。", 10, 20);
  return loadProject(project.id, root);
}

describe("runMatch", () => {
  it("writes original clips from text alignment", () => {
    const root = tempWorkspace();
    seedCloneProject(root);
    const result = runMatch(
      { projectId: "site-clone", edited: "asset:video.edited", root, visual: false },
      {
        hasAudio: () => true,
        transcribe: () => {
          throw new Error("should use cached transcript");
        },
        scenes: () => ({ duration: 20, boundaries: [] }),
        duration: () => 20,
      },
    );
    assert.ok(result.cuts.length >= 1);
    const project = loadProject("site-clone", root);
    assert.equal(project.film.recipe, "clone-from-edit");
    assert.deepEqual(project.film.langs, ["zh"]);
    assert.ok(project.film.scenes.every((scene) => scene.kind === "clip" && scene.ost === "original"));
    const first = project.film.scenes[0];
    assert.equal(first?.source, "asset:video.ep01");
    assert.ok((first?.in ?? 99) < (first?.out ?? 0));
    assert.match(first?.lines.zh ?? "", /这一下她没再退/);
    assert.ok(fs.existsSync(path.join(project.root, result.report)));
    assert.ok(result.subtitle);
    assert.ok(fs.existsSync(path.join(project.root, result.subtitle!)));
    assert.match(fs.readFileSync(path.join(project.root, result.subtitle!), "utf8"), /这一下她没再退/);
  });

  it("writes output-timeline srt cues", () => {
    assert.equal(formatSrtTime(0), "00:00:00,000");
    assert.equal(formatSrtTime(1.5), "00:00:01,500");
    const srt = cutsToSrt([
      {
        sceneId: "cut-01",
        sourceRef: "asset:video.ep01",
        in: 1,
        out: 3,
        editedStart: 0,
        editedEnd: 1,
        text: "第一句。",
        score: 1,
        textScore: 1,
        visualScore: 0,
        matchMethod: "text",
        sceneSnapped: false,
        warnings: [],
      },
      {
        sceneId: "cut-02",
        sourceRef: "asset:video.ep01",
        in: 4,
        out: 5,
        editedStart: 2,
        editedEnd: 3,
        text: "",
        score: 1,
        textScore: 0,
        visualScore: 1,
        matchMethod: "silent_gap",
        sceneSnapped: false,
        warnings: [],
      },
    ]);
    assert.match(srt, /00:00:00,000 --> 00:00:02,000/);
    assert.match(srt, /第一句。/);
    assert.doesNotMatch(srt, /cut-02/);
  });

  it("replaces clip scenes on a second run and keeps recipe", () => {
    const root = tempWorkspace();
    seedCloneProject(root);
    const deps = {
      hasAudio: () => true,
      transcribe: () => {
        throw new Error("cached");
      },
      scenes: () => ({ duration: 20, boundaries: [] }),
      duration: () => 20,
    };
    runMatch({ projectId: "site-clone", edited: "asset:video.edited", root, visual: false }, deps);
    const again = runMatch({ projectId: "site-clone", edited: "asset:video.edited", root, visual: false }, deps);
    const project = loadProject("site-clone", root);
    assert.equal(project.film.recipe, "clone-from-edit");
    assert.equal(project.film.scenes[0]?.id, "cut-01");
    assert.equal(again.cuts.length, project.film.scenes.length);
  });

  it("fails when the edited video has no audio and visual is off", () => {
    const root = tempWorkspace();
    seedCloneProject(root);
    assert.throws(
      () =>
        runMatch(
          { projectId: "site-clone", edited: "asset:video.edited", root, visual: false },
          { hasAudio: () => false },
        ),
      /没有音轨/,
    );
  });
});
