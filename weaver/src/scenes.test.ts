import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { createProject } from "./project.ts";
import { addScene, moveScene, patchScene, removeScene, setCard, setKit, setLangs, setVoicePack } from "./scenes.ts";
import { getTask } from "./tasks/registry.ts";
import { hasErrors, validateProject } from "./validate.ts";

function tempRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "weaver-"));
  fs.mkdirSync(path.join(root, "library"), { recursive: true });
  fs.writeFileSync(path.join(root, "library/assets.json"), `${JSON.stringify({ assets: [] })}\n`);
  return root;
}

describe("scenes", () => {
  it("adds a still before close and refuses to drop the last still", () => {
    const project = createProject("demo-film", { title: "演示" }, tempRoot());
    assert.deepEqual(project.film.scenes.map((scene) => scene.id), ["title", "hero", "close"]);
    addScene(project, { id: "shot", kind: "still", still: "asset:still.shot" });
    assert.deepEqual(project.film.scenes.map((scene) => scene.id), ["title", "hero", "shot", "close"]);
    assert.ok(project.assets.some((asset) => asset.id === "still.shot"));
    removeScene(project, "hero");
    assert.throws(() => removeScene(project, "shot"), /最后一场 still/);
    assert.throws(() => removeScene(project, "title"), /title/);
  });

  it("patches zh without dropping en", () => {
    const project = createProject("demo-film", { title: "演示" }, tempRoot());
    patchScene(project, "hero", { lines: { zh: "中文" } });
    const hero = project.film.scenes.find((scene) => scene.id === "hero");
    assert.equal(hero?.lines.zh, "中文");
    assert.equal(hero?.lines.en, "演示");
  });

  it("refuses to move title off the front", () => {
    const project = createProject("demo-film", { title: "演示" }, tempRoot());
    addScene(project, { id: "shot", kind: "still", still: "asset:still.shot" });
    assert.throws(() => moveScene(project, "title", { after: "hero" }), /钉住/);
    moveScene(project, "shot", { after: "title" });
    assert.equal(project.film.scenes[1]?.id, "shot");
    assert.equal(project.film.scenes[0]?.kind, "title");
    assert.equal(project.film.scenes.at(-1)?.kind, "close");
  });

  it("keeps headline and kicker when the CLI patch includes undefined keys", () => {
    const project = createProject("demo-film", { title: "演示" }, tempRoot());
    const kicker = project.film.locales.zh.titleCard?.kicker;
    assert.ok(kicker);
    setCard(project, "zh", "close", {
      headline: undefined,
      lede: undefined,
      kicker: undefined,
      tags: undefined,
      points: ["分组选择是分类 || 级联选择才是上下级"],
    });
    setCard(project, "zh", "title", {
      headline: undefined,
      lede: undefined,
      kicker: undefined,
      tags: undefined,
      points: ["先说名称"],
    });
    assert.equal(project.film.locales.zh.closeCard?.headline, "说清楚");
    assert.equal(project.film.locales.zh.titleCard?.kicker, kicker);
    assert.deepEqual(project.film.locales.zh.closeCard?.points, ["分组选择是分类 || 级联选择才是上下级"]);
  });

  it("writes card points without dropping the lede", () => {
    const project = createProject("demo-film", { title: "演示" }, tempRoot());
    setCard(project, "zh", "close", {
      points: ["分组选择是分类 || 级联选择才是上下级", " 先说名称 "],
    });
    assert.deepEqual(project.film.locales.zh.closeCard?.points, [
      "分组选择是分类 || 级联选择才是上下级",
      "先说名称",
    ]);
    assert.equal(project.film.locales.zh.closeCard?.headline, "说清楚");
  });

  it("seed hero is not renderable until a still is bound", () => {
    const project = createProject("demo-film", { title: "演示" }, tempRoot());
    assert.ok(hasErrors(validateProject(project)));
  });

  it("records a library kit and rejects project-scoped refs", () => {
    const project = createProject("demo-film", { title: "演示" }, tempRoot());
    setKit(project, ["library:element.mark", "library:element.mark", " library:reference.board "]);
    assert.deepEqual(project.film.kit, ["library:element.mark", "library:reference.board"]);
    assert.throws(() => setKit(project, ["asset:still.hero"]), /library:/);
  });

  it("binds one voice pack to every locale", () => {
    const project = createProject("demo-film", { title: "演示" }, tempRoot());
    setVoicePack(project, "library:voice.prompt");
    assert.equal(project.film.voices.zh, "library:voice.prompt");
    assert.equal(project.film.voices.en, "library:voice.prompt");
  });

  it("records which languages to produce", () => {
    const project = createProject("demo-film", { title: "演示" }, tempRoot());
    setLangs(project, ["zh"]);
    assert.deepEqual(project.film.langs, ["zh"]);
    assert.throws(() => setLangs(project, []), /至少选一种/);
    assert.throws(() => setLangs(project, ["ja"]), /没有语言/);
  });

  it("refuses setCard when the task has no cards", () => {
    const project = createProject("demo-film", { title: "演示" }, tempRoot());
    const task = getTask("study-explainer");
    const saved = task.cards;
    task.cards = undefined;
    try {
      assert.throws(() => setCard(project, "zh", "close", { lede: "x" }), /没有卡片/);
    } finally {
      task.cards = saved;
    }
  });
});
