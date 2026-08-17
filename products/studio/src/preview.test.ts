import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { missingStillSceneIds, outputPreview } from "./tasks/study-explainer.tsx";
import type { ProjectDetail } from "./types.ts";

const here = path.dirname(fileURLToPath(import.meta.url));

function detail(partial: Partial<ProjectDetail["paths"]> = {}): ProjectDetail {
  return {
    id: "intent-cascade",
    source: "first-party",
    root: "/proj",
    brand: "LightUI",
    task: "study-explainer",
    studySlug: "intent-cascade",
    locales: ["zh", "en"],
    scenes: 1,
    titles: { zh: "菜单" },
    voices: { zh: "library:voice.prompt", en: "library:voice.prompt" },
    kit: ["library:element.mark"],
    film: {
      id: "intent-cascade",
      brand: "LightUI",
      voices: {},
      locales: {
        zh: { title: "菜单", output: "cursor-movement.mp4", titleCard: {}, closeCard: {} },
      },
      scenes: [],
    },
    assets: [],
    issues: [],
    renderable: true,
    paths: {
      projectRoot: "/proj",
      film: "/proj/film.json",
      assetsDoc: "/proj/assets.json",
      stillFiles: [],
      lineFiles: [],
      outputFiles: {},
      library: "/library",
      recipes: "/recipes/lightui-study-explainer",
      brief: { kind: "study", root: "/ui", files: {} },
      ...partial,
    },
  } as unknown as ProjectDetail;
}

describe("outputPreview", () => {
  it("uses /api/media/project relative src, never a disk path", () => {
    const preview = outputPreview(
      detail({
        outputFiles: {
          zh: {
            path: "/Users/boom/workspace/LightWeaver/data/first-party/intent-cascade/assets/outputs/cursor-movement.mp4",
            exists: true,
            rel: "assets/outputs/cursor-movement.mp4",
          },
        },
      }),
      "zh",
    );
    assert.ok(preview);
    assert.equal(
      preview.src,
      "/api/media/project/intent-cascade/assets/outputs/cursor-movement.mp4",
    );
    assert.match(preview.path, /cursor-movement\.mp4$/);
    assert.doesNotMatch(preview.src, /^\/Users\//);
    assert.doesNotMatch(preview.src, /^file:/);
  });

  it("falls back when the output is missing", () => {
    assert.equal(
      outputPreview(
        detail({
          outputFiles: {
            zh: { path: "/proj/assets/outputs/x.mp4", exists: false, rel: "assets/outputs/x.mp4" },
          },
        }),
        "zh",
      ),
      undefined,
    );
  });

  it("lists missing stills from paths.stillFiles", () => {
    const ids = missingStillSceneIds(
      detail({
        stillFiles: [
          { sceneId: "floating", locale: "zh", rel: "assets/stills/zh/floating.png", path: "/a", exists: false },
          { sceneId: "floating", locale: "en", rel: "assets/stills/en/floating.png", path: "/b", exists: false },
          { sceneId: "sidebar", locale: "zh", rel: "assets/stills/zh/sidebar.png", path: "/c", exists: true },
        ],
      }),
      "zh",
    );
    assert.deepEqual(ids, ["floating"]);
  });
});

describe("voices catalog contract", () => {
  it("treats kept wav as the pack and does not seed from film tts", () => {
    const page = fs.readFileSync(path.join(here, "pages/Voices.tsx"), "utf8");
    assert.match(page, /Hi-Fi/);
    assert.match(page, /设计指令/);
    assert.match(page, /文本/);
    assert.match(page, /MODELBEST_URL/);
    assert.match(page, /keepVoice/);
    assert.match(page, /useFlash/);
    assert.match(page, /from "\.\.\/components\/Toast"/);
    const toast = fs.readFileSync(path.join(here, "components/Toast.tsx"), "utf8");
    assert.match(toast, /toast-/);
    const css = fs.readFileSync(path.join(here, "index.css"), "utf8");
    assert.match(css, /toast-ring 1s/);
    assert.doesNotMatch(page, /banner-ok/);
    assert.doesNotMatch(page, /banner-error/);
    assert.match(page, /保存音色/);
    assert.match(page, /删除/);
    assert.match(page, /确定删除/);
    assert.match(page, /removeLibrary/);
    assert.match(page, /音色库/);
    assert.match(page, /type="radio"/);
    assert.match(page, /VoiceDrop/);
    assert.match(page, /create-save/);
    assert.match(page, /stageVoice/);
    assert.match(page, /keepUploaded/);
    assert.match(page, /keepName/);
    assert.match(page, /先写名称再保存/);
    assert.match(page, /form\.set\("force"/);
    assert.match(page, /点击或拖入 wav/);
    assert.match(page, /转写结果可改/);
    assert.doesNotMatch(page, /换一支再转写/);
    assert.doesNotMatch(page, /收下进音色库/);
    assert.doesNotMatch(page, /还没进库/);
    assert.doesNotMatch(page, /可空，上传后自动转写/);
    assert.doesNotMatch(page, /上传后直接听，空着的文本/);
    assert.doesNotMatch(page, /uploadLibrary/);
    assert.doesNotMatch(page, /这支在说/);
    assert.match(page, /VoiceLibraryCard/);
    assert.doesNotMatch(page, /备声/);
    assert.doesNotMatch(page, /主声/);
    assert.doesNotMatch(page, /收下为试听/);
    assert.doesNotMatch(page, /建套，再铸/);
    assert.doesNotMatch(page, /VoicePackCard/);
    assert.doesNotMatch(page, /onBlur/);
    assert.doesNotMatch(page, /片子点名/);
    assert.doesNotMatch(page, /从片子旁白提一支/);
    assert.doesNotMatch(page, /usedBy/);
    assert.doesNotMatch(page, /套 id/);
  });
});

describe("workbench contract", () => {
  it("lets the human name the output home and tells the agent to ask when missing", () => {
    const page = fs.readFileSync(path.join(here, "pages/Home.tsx"), "utf8");
    assert.match(page, /产物写到哪/);
    assert.match(page, /outputHome/);
    assert.match(page, /data\/projects/);
    assert.match(page, /data\/first-party/);
    assert.match(page, /publishLightui/);
    const brief = fs.readFileSync(path.join(here, "lib/brief.ts"), "utf8");
    assert.match(brief, /产物位置：未指定/);
    assert.match(brief, /开始前先问人/);
    assert.match(brief, /不要写到 products\/study-films/);
  });
});

describe("library catalog contract", () => {
  it("does not list films that picked a material", () => {
    const page = fs.readFileSync(path.join(here, "pages/Library.tsx"), "utf8");
    assert.doesNotMatch(page, /usedBy/);
    assert.doesNotMatch(page, /还没有片子点名/);
    assert.doesNotMatch(page, /api\.projects/);
  });
});

describe("methods catalog contract", () => {
  it("shows a reusable apply contract, not recipe markdown or instance-bound copy", () => {
    const page = fs.readFileSync(path.join(here, "pages/Methods.tsx"), "utf8");
    assert.match(page, /buildMethodBrief/);
    assert.match(page, /methodApplyLine/);
    assert.doesNotMatch(page, /recipe\.body/);
    assert.doesNotMatch(page, /还没有片子点名这张卡/);
  });
});

describe("preview source contract", () => {
  it("Film video src is outputPreview, not an absolute path field", () => {
    const film = fs.readFileSync(path.join(here, "pages/Film.tsx"), "utf8");
    assert.match(film, /outputPreview/);
    assert.match(film, /src=\{output\.src\}/);
    assert.doesNotMatch(film, /src=\{output\.path\}/);
    assert.doesNotMatch(film, /outputExists/);
  });
});
