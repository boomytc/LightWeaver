import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { saveAssets } from "./project.ts";
import { applyRecipe, setFilmRecipe } from "./recipes.ts";
import { addScene, patchScene, removeScene, setLangs } from "./scenes.ts";
import { sceneNeedsLine } from "./schema.ts";
import { createProject, loadProject } from "./project.ts";
import { weaverRoot } from "./paths.ts";
import { hasErrors, isRenderable, validateProject } from "./validate.ts";
import { runDescribe } from "./describe.ts";
import { dHashFromGray, type FrameHash } from "./match-visual.ts";
import { seedFootageFilm, tempWorkspace, touch } from "./test-workspace.ts";

function ramp(up: boolean): Uint8Array {
  return Uint8Array.from({ length: 72 }, (_, i) => (up ? i % 9 : 8 - (i % 9)) * 28);
}

function frame(t: number, up: boolean, mean: [number, number, number]): FrameHash {
  return { t, hash: dHashFromGray(ramp(up)), mean };
}

function hashes(): FrameHash[] {
  return [frame(1, true, [0, 0, 0]), frame(5, false, [255, 0, 0])];
}

function stubJpeg() {
  return (_file: string, _t: number, dest: string) => {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, "jpeg");
  };
}

function seedCatalogMethod(root: string, id: string, extra: Record<string, unknown> = {}): void {
  const file = path.join(root, "library/assets.json");
  const doc = JSON.parse(fs.readFileSync(file, "utf8")) as { assets: Record<string, unknown>[] };
  doc.assets.push({
    id: `method.${id}`,
    kind: "method",
    label: id,
    file: `methods/footage-narration/${id}.md`,
    task: "footage-narration",
    text: id,
    expand: "list",
    ...extra,
  });
  fs.writeFileSync(file, `${JSON.stringify(doc, null, 2)}\n`);
}

describe("footage method fixtures", () => {
  it("see-then-narrate: empty tree is blocked; sequences become narration clips; observation is not lines", () => {
    const root = tempWorkspace();
    seedCatalogMethod(root, "see-then-narrate", { needs: ["description"], clipAlign: "sequences" });
    const project = seedFootageFilm(root, "site-see", [{ id: "say", in: 0, out: 1 }], { writeVideo: true, writeWav: true });
    setFilmRecipe(project, "see-then-narrate", root);
    setLangs(project, ["zh"]);
    assert.ok(validateProject(project, root).some((issue) => issue.path === "recipe.needs.description"));

    const described = runDescribe(
      { projectId: project.id, ref: "asset:video.origin", root },
      {
        hasAudio: () => false,
        duration: () => 8,
        scenes: () => ({ duration: 8, boundaries: [{ time: 3, score: 0.9 }] }),
        hashes: () => hashes(),
        jpeg: stubJpeg(),
        vlm: ({ prev }) => ({ observation: prev ? "红布近景" : "黑场空镜" }),
      },
    );
    const live = loadProject(project.id, root);
    assert.ok(!validateProject(live, root).some((issue) => issue.path === "recipe.needs.description"));
    for (const sequence of described.description.sequences) {
      addScene(live, {
        id: sequence.id,
        kind: "clip",
        source: "asset:video.origin",
        in: sequence.in,
        out: sequence.out,
        ost: "narration",
      });
      patchScene(live, sequence.id, { lines: { zh: `听者旁白-${sequence.id}` } });
      touch(path.join(live.root, `assets/lines/zh/${sequence.id}.wav`));
      saveAssets(live, [
        ...live.assets.filter((asset) => asset.id !== `line.${sequence.id}.zh`),
        { id: `line.${sequence.id}.zh`, kind: "line", locale: "zh", scene: sequence.id, file: `assets/lines/zh/${sequence.id}.wav` },
      ]);
    }
    removeScene(live, "say");
    const next = loadProject(project.id, root);
    const clips = next.film.scenes.filter((scene) => scene.kind === "clip");
    assert.equal(clips.length, 2);
    assert.equal(clips[0]?.in, described.description.sequences[0]?.in);
    assert.notEqual(clips[0]?.lines?.zh, described.description.sequences[0]?.observation);
    assert.match(clips[0]?.lines?.zh ?? "", /听者旁白/);
    assert.equal(isRenderable(next, root), true);
  });

  it("highlight-mix: transcript gate, original ost, no narration", () => {
    const root = tempWorkspace();
    seedCatalogMethod(root, "highlight-mix", { needs: ["transcript"], clipOst: "original" });
    const project = seedFootageFilm(
      root,
      "site-mix",
      [
        { id: "beat-a", in: 1, out: 2, ost: "original", zh: "", en: "" },
        { id: "beat-b", in: 3, out: 4, ost: "original", zh: "", en: "" },
        { id: "beat-c", in: 5, out: 6, ost: "original", zh: "", en: "" },
      ],
      { writeVideo: true },
    );
    setFilmRecipe(project, "highlight-mix", root);
    setLangs(project, ["zh"]);
    assert.ok(validateProject(project, root).some((issue) => issue.path === "recipe.needs.transcript"));
    touch(path.join(project.root, "assets/transcripts/video.origin.json"), `${JSON.stringify({ sentences: [{ text: "a", start: 1, end: 2 }] })}\n`);
    saveAssets(project, [
      ...project.assets,
      { id: "transcript.video.origin", kind: "transcript", file: "assets/transcripts/video.origin.json", scene: "video.origin" },
    ]);
    const next = loadProject(project.id, root);
    assert.ok(!hasErrors(validateProject(next, root)));
    assert.ok(next.film.scenes.every((scene) => !sceneNeedsLine(scene)));
    assert.equal(isRenderable(next, root), true);
  });

  it("plot-then-match: timed narration clips render without a description tree", () => {
    const root = tempWorkspace();
    seedCatalogMethod(root, "plot-then-match");
    const project = seedFootageFilm(
      root,
      "site-plot",
      [
        { id: "beat-a", in: 1, out: 3, ost: "narration", zh: "这一下她没再退。" },
        { id: "beat-b", in: 4, out: 6, ost: "narration", zh: "工地先把规则说清。" },
      ],
      { writeVideo: true, writeWav: true },
    );
    setFilmRecipe(project, "plot-then-match", root);
    setLangs(project, ["zh"]);
    const issues = validateProject(project, root);
    assert.ok(!issues.some((issue) => issue.path.startsWith("recipe.needs")));
    assert.equal(isRenderable(project, root), true);
  });

  it("copy-then-match: apply lays copy scenes, then in/out and mixed ost", () => {
    const root = tempWorkspace();
    const project = createProject("site-copy", { task: "footage-narration" }, root);
    applyRecipe(project, "copy-then-match", { items: ["line-a", "line-b"] }, weaverRoot());
    assert.deepEqual(
      project.film.scenes.map((scene) => scene.id),
      ["line-a", "line-b"],
    );
    assert.equal(project.film.scenes[0]?.ost, "narration");
    assert.equal(project.film.scenes[0]?.in, undefined);
    saveAssets(project, [{ id: "video.origin", kind: "video", file: "assets/source/origin.mp4" }]);
    touch(path.join(project.root, "assets/source/origin.mp4"));
    patchScene(project, "line-a", { source: "asset:video.origin", in: 1, out: 3, ost: "narration", lines: { zh: "文案先行。" } });
    patchScene(project, "line-b", { source: "asset:video.origin", in: 4, out: 6, ost: "original", lines: { zh: "" } });
    touch(path.join(project.root, "assets/lines/zh/line-a.wav"));
    saveAssets(project, [
      ...project.assets,
      { id: "line.line-a.zh", kind: "line", locale: "zh", scene: "line-a", file: "assets/lines/zh/line-a.wav" },
    ]);
    setLangs(project, ["zh"]);
    const next = loadProject(project.id, root);
    assert.equal(next.film.recipe, "copy-then-match");
    assert.equal(next.film.scenes[1]?.ost, "original");
    assert.equal(isRenderable(next, weaverRoot()), true);
  });

  it("clone-from-edited: match report plus original clips is renderable", () => {
    const root = tempWorkspace();
    seedCatalogMethod(root, "clone-from-edited", { needs: ["match-report"], clipOst: "original" });
    const project = seedFootageFilm(
      root,
      "site-clone",
      [{ id: "cut-01", in: 10, out: 16, ost: "original", zh: "", en: "" }],
      { writeVideo: true },
    );
    setFilmRecipe(project, "clone-from-edited", root);
    setLangs(project, ["zh"]);
    assert.ok(validateProject(project, root).some((issue) => issue.path === "recipe.needs.match-report"));
    touch(path.join(project.root, "assets/match/report.json"), "{}\n");
    const next = loadProject(project.id, root);
    assert.ok(!hasErrors(validateProject(next, root)));
    assert.ok(next.film.scenes.every((scene) => scene.ost === "original"));
    assert.equal(isRenderable(next, root), true);
  });
});
