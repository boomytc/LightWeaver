import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { createProject } from "./project.ts";
import { assetsPath, filmPath } from "./project.ts";
import { projectPaths } from "./project-paths.ts";
import { firstPartyRoot, labUrl, lightasrRoot, lightuiRoot, recipeRoot, weaverRoot } from "./paths.ts";
import { isRenderable } from "./validate.ts";
import { seedLabFilm, tempWorkspace } from "./test-workspace.ts";

const weaverSrc = path.dirname(fileURLToPath(import.meta.url));
const weaverPkg = path.resolve(weaverSrc, "..");

function withLightui(root: string): { env: NodeJS.ProcessEnv; uiRoot: string } {
  const uiRoot = path.join(root, "LightUI");
  fs.mkdirSync(uiRoot, { recursive: true });
  return { env: { ...process.env, LIGHTUI_ROOT: uiRoot }, uiRoot };
}

function showJson(root: string, id: string) {
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "src/cli.ts", "project", "show", id, "--json"],
    { cwd: weaverPkg, encoding: "utf8", env: { ...process.env, LIGHTWEAVER_ROOT: root } },
  );
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

function listJson(root: string) {
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "src/cli.ts", "project", "list", "--json"],
    { cwd: weaverPkg, encoding: "utf8", env: { ...process.env, LIGHTWEAVER_ROOT: root } },
  );
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

describe("projectPaths", () => {
  it("maps first-party stills from assets.json, not scene ids", () => {
    const root = tempWorkspace();
    const project = seedLabFilm(
      root,
      "intent-cascade",
      [{ id: "status", file: "status.png", role: "problem" }],
      { writePng: true },
    );
    const { env } = withLightui(root);
    const paths = projectPaths(project, root, env);
    assert.equal(paths.brief.kind, "study");
    assert.equal(paths.brief.files.kinds.exists, false);
    const statusZh = paths.stillFiles.find((file) => file.sceneId === "status" && file.locale === "zh");
    assert.ok(statusZh);
    assert.equal(statusZh.rel, "assets/stills/zh/status.png");
    assert.equal(statusZh.ref, "asset:still.status");
    assert.equal(statusZh.exists, true);
    assert.ok(project.root.startsWith(firstPartyRoot(root)));
    assert.equal(paths.outputFiles.zh.rel, "assets/outputs/intent-cascade.mp4");
    assert.equal(paths.recipes, path.join(recipeRoot(root), "study-explainer"));
    assert.equal(paths.labUrl, `${labUrl(env)}/s/intent-cascade`);
    assert.equal(paths.publishDir, "studies/intent-cascade/references");
    assert.equal(paths.film, filmPath(project.root));
    assert.equal(paths.assetsDoc, assetsPath(project.root));
  });

  it("keeps official still names from the catalog", () => {
    const root = tempWorkspace();
    const project = seedLabFilm(root, "dropdown-taxonomy", [
      { id: "select", file: "select-open.png", role: "contrast" },
      { id: "multi", file: "multi-open.png", role: "contrast" },
      { id: "date", file: "date-open.png", role: "contrast" },
    ]);
    const paths = projectPaths(project, root);
    const rel = (id: string) =>
      paths.stillFiles.find((file) => file.sceneId === id && file.locale === "zh")?.rel;
    assert.equal(rel("select"), "assets/stills/zh/select-open.png");
    assert.equal(rel("multi"), "assets/stills/zh/multi-open.png");
    assert.equal(rel("date"), "assets/stills/zh/date-open.png");
    assert.notEqual(rel("select"), "assets/stills/zh/select.png");
  });

  it("does not guess output names when stills are missing", () => {
    const root = tempWorkspace();
    const project = seedLabFilm(root, "nav-taxonomy", [
      { id: "floating", file: "floating.png", role: "contrast" },
    ]);
    const { env } = withLightui(root);
    const paths = projectPaths(project, root, env);
    assert.equal(paths.brief.kind, "study");
    const floating = paths.stillFiles.find((file) => file.sceneId === "floating" && file.locale === "zh");
    assert.equal(floating?.rel, "assets/stills/zh/floating.png");
    assert.equal(floating?.exists, false);
    assert.equal(isRenderable(project, root), false);
    assert.equal(paths.outputFiles.zh.rel, "assets/outputs/nav-taxonomy.mp4");
  });

  it("does not invent a LightUI study path without LIGHTUI_ROOT", () => {
    const root = tempWorkspace();
    const project = seedLabFilm(root, "intent-cascade", [{ id: "status", file: "status.png", role: "problem" }]);
    const emptyEnv = { ...process.env };
    delete emptyEnv.LIGHTUI_ROOT;
    const paths = projectPaths(project, root, emptyEnv);
    assert.equal(paths.brief.kind, "project-brief");
    assert.equal(paths.labUrl, undefined);
    assert.equal(lightuiRoot(root, emptyEnv), undefined);
  });

  it("treats a user film without slug as project-brief", () => {
    const root = tempWorkspace();
    const project = createProject("demo-film", { title: "演示", task: "study-explainer" }, root);
    const emptyEnv = { ...process.env };
    delete emptyEnv.LIGHTUI_ROOT;
    delete emptyEnv.LIGHTASR_ROOT;
    assert.equal(lightuiRoot(root, emptyEnv), undefined);
    assert.equal(lightasrRoot(root, emptyEnv), undefined);
    const paths = projectPaths(project, root, emptyEnv);
    assert.equal(paths.brief.kind, "project-brief");
    assert.equal(paths.brief.files.brief.exists, false);
    assert.equal(paths.brief.files.briefEn.exists, false);
    assert.ok(paths.brief.files.brief.path.endsWith(`${path.sep}brief.md`));
    assert.equal("root" in paths.brief, false);
    assert.equal(paths.labUrl, undefined);
    assert.equal(paths.publishDir, undefined);
    const heroZh = paths.stillFiles.find((file) => file.sceneId === "hero" && file.locale === "zh");
    assert.equal(heroZh?.exists, false);
    assert.equal(heroZh?.ref, undefined);
    assert.equal(heroZh?.rel, "assets/stills/zh/hero.png");
  });

  it("marks a user film with study.slug as hybrid", () => {
    const root = tempWorkspace();
    const project = createProject(
      "user-intent",
      { source: "user", task: "study-explainer", studySlug: "intent-cascade" },
      root,
    );
    const { env } = withLightui(root);
    const paths = projectPaths(project, root, env);
    assert.equal(project.source, "user");
    assert.equal(project.film.study?.slug, "intent-cascade");
    assert.equal(paths.brief.kind, "hybrid");
    assert.ok(paths.brief.files.idea.path.includes(path.join("studies", "intent-cascade", "idea.md")));
    assert.equal(paths.brief.files.kinds.exists, false);
    assert.equal(paths.brief.files.brief.exists, false);
    assert.ok(paths.brief.files.brief.path.endsWith(`${path.sep}brief.md`));
    assert.ok(paths.labUrl?.endsWith("/s/intent-cascade"));
  });

  it("honors recipeRoot default and LIGHTWEAVER_RECIPES", () => {
    assert.equal(recipeRoot("/ws"), path.join("/ws", "library/methods"));
    assert.equal(recipeRoot(), path.join(weaverRoot(), "library/methods"));
    const prev = process.env.LIGHTWEAVER_RECIPES;
    const fixture = path.join(os.tmpdir(), "lw-recipes-fixture");
    process.env.LIGHTWEAVER_RECIPES = fixture;
    try {
      assert.equal(recipeRoot("/ignored"), path.resolve(fixture));
      const root = tempWorkspace();
      const project = seedLabFilm(root, "intent-cascade", [{ id: "status", file: "status.png", role: "problem" }]);
      const paths = projectPaths(project, root);
      assert.equal(paths.recipes, path.join(path.resolve(fixture), "study-explainer"));
    } finally {
      if (prev === undefined) delete process.env.LIGHTWEAVER_RECIPES;
      else process.env.LIGHTWEAVER_RECIPES = prev;
    }
  });

  it("keeps project.ts a leaf and project-paths off validate", () => {
    const projectSrc = fs.readFileSync(path.join(weaverSrc, "project.ts"), "utf8");
    assert.equal(/from ["']\.\/project-paths/.test(projectSrc), false);
    assert.equal(/from ["']\.\/assets/.test(projectSrc), false);
    const pathsSrc = fs.readFileSync(path.join(weaverSrc, "project-paths.ts"), "utf8");
    assert.equal(/from ["']\.\/validate/.test(pathsSrc), false);
  });
});

describe("project show CLI", () => {
  it("exposes paths and renderable on show, not list", () => {
    const root = tempWorkspace();
    seedLabFilm(root, "nav-taxonomy", [{ id: "floating", file: "floating.png", role: "contrast" }]);
    const shown = showJson(root, "nav-taxonomy");
    assert.equal(shown.id, "nav-taxonomy");
    assert.equal(shown.task, "study-explainer");
    assert.equal(shown.renderable, false);
    assert.ok(Array.isArray(shown.paths.stillFiles));
    assert.ok(shown.film);
    assert.ok(Array.isArray(shown.assets));
    assert.equal(shown.project, undefined);
    assert.equal(shown.paths.renderable, undefined);
    const listed = listJson(root);
    assert.ok(Array.isArray(listed));
    assert.equal(listed[0].paths, undefined);
    assert.equal(listed[0].renderable, undefined);
  });
});
