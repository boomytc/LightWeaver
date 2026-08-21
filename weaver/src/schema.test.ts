import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { filmLangs, filmTask, normalizeFilm, parseAssetRef, type FilmDoc } from "./schema.ts";
import { jargonIn } from "./tasks/study-jargon.ts";
import { getTask, resolveTask, tryGetTask } from "./tasks/registry.ts";
import { createProject } from "./project.ts";
import { validateProject } from "./validate.ts";
import { tempWorkspace } from "./test-workspace.ts";

describe("parseAssetRef", () => {
  it("accepts asset and library refs", () => {
    assert.deepEqual(parseAssetRef("asset:still.problem"), { scope: "asset", id: "still.problem" });
    assert.deepEqual(parseAssetRef("library:voice.prompt-zh"), { scope: "library", id: "voice.prompt-zh" });
  });

  it("rejects bare filenames", () => {
    assert.equal(parseAssetRef("desktop-full.png"), null);
    assert.equal(parseAssetRef("asset:"), null);
  });
});

describe("filmLangs", () => {
  it("defaults to every locale when langs is omitted", () => {
    assert.deepEqual(filmLangs({ locales: { zh: {} as never, en: {} as never } }), ["zh", "en"]);
  });

  it("keeps only picked locales that exist on the film", () => {
    assert.deepEqual(filmLangs({ locales: { zh: {} as never, en: {} as never }, langs: ["zh", "ja"] }), ["zh"]);
  });
});

describe("filmTask", () => {
  it("does not invent study-explainer when task is missing", () => {
    assert.equal(filmTask({ id: "x" } as FilmDoc), "");
    const film = normalizeFilm({
      id: "bare",
      brand: "LightWeaver",
      voices: {},
      locales: {},
      scenes: [],
    });
    assert.equal(film.task, undefined);
    assert.equal(filmTask(film), "");
  });
});

describe("task registry", () => {
  it("does not default getTask / tryGetTask to study-explainer", () => {
    assert.equal(tryGetTask(), undefined);
    assert.equal(tryGetTask(""), undefined);
    assert.throws(() => getTask(), /未知任务类型/);
    assert.throws(() => getTask(""), /未知任务类型/);
    assert.throws(() => resolveTask(), /缺少任务类型/);
  });

  it("createProject without task fails when more than one task exists", () => {
    const root = tempWorkspace();
    assert.throws(() => createProject("solo-task", { title: "演示" }, root), /缺少任务类型/);
  });

  it("does not treat a film without task as study-explainer", () => {
    const root = tempWorkspace();
    const project = createProject("no-task-film", { title: "演示", task: "study-explainer" }, root);
    const bare = { ...project, film: { ...project.film, task: undefined } };
    assert.equal(filmTask(bare.film), "");
    const issues = validateProject(bare, root);
    assert.ok(issues.some((issue) => issue.path === "task" && issue.level === "error"));
    assert.ok(!issues.some((issue) => issue.message.includes("恰好一个 title")));
  });
});

describe("plain talk", () => {
  it("flags stacked jargon and accepts everyday wording", () => {
    assert.equal(jargonIn("级联选择必须走到叶子才提交一条路径。")[0]?.term, "叶子");
    assert.equal(jargonIn("Cascader must reach a leaf before it commits.")[0]?.term, "leaf");
    assert.equal(jargonIn("先定提交模型。")[0]?.term, "提交模型");
    assert.equal(jargonIn("First decide the commit model.")[0]?.term, "commit model");
    assert.equal(jargonIn("用安全三角保护斜向穿越")[0]?.term, "安全三角");
    assert.equal(jargonIn("用 sticky 钉住，不要用 fixed。")[0]?.term, "sticky");
    assert.equal(jargonIn("点击跳转时先锁观察器。")[0]?.term, "观察器");
    assert.equal(jargonIn("隐藏式默认宽度为零")[0]?.term, "宽度为零");
    assert.equal(jargonIn("Lock the observer on a click jump.")[0]?.term, "observer");
    assert.deepEqual(jargonIn("点到不能再往下的那一级，才算选完。"), []);
    assert.deepEqual(jargonIn("面包屑是你怎么走到这一页的路径，不是主菜单。"), []);
    assert.deepEqual(jargonIn("斜着走过去先别换菜单，上下扫的时候马上换。"), []);
    assert.deepEqual(jargonIn("On a long page, the matching item lights up as you scroll."), []);
  });
});
