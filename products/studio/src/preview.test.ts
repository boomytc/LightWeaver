import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { outputPreview } from "./lib/preview";
import { missingStillSceneIds } from "./tasks/study-explainer.tsx";
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
      sourceFiles: [],
      lineFiles: [],
      outputFiles: {},
      subtitleFiles: [],
      descriptionFiles: [],
      library: "/library",
      recipes: "/recipes/study-explainer",
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
    assert.match(page, /VoiceWave/);
    assert.match(page, /onClear/);
    const wave = fs.readFileSync(path.join(here, "components/VoiceWave.tsx"), "utf8");
    assert.match(wave, /清除已选录音/);
    assert.match(wave, /音频波形，点击跳转播放位置/);
    assert.match(css, /voice-wave-close/);
    assert.match(css, /voice-wave-canvas/);
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
    assert.match(page, /可选增强/);
    assert.match(page, /素材/);
    assert.doesNotMatch(page, /api\.recipes/);
    assert.doesNotMatch(page, /publishLightui/);
    assert.doesNotMatch(page, /LightUI/);
    const brief = fs.readFileSync(path.join(here, "lib/brief.ts"), "utf8");
    assert.match(brief, /产物位置：未指定/);
    assert.match(brief, /开始前先问人/);
    assert.match(brief, /不要写到 products\/study-films/);
    assert.match(brief, /可选增强/);
    assert.doesNotMatch(brief, /只准用这些/);
    assert.doesNotMatch(brief, /LightUI/);
    assert.doesNotMatch(page, /study-explainer/);
    assert.doesNotMatch(brief, /study-explainer/);
    assert.doesNotMatch(page, /createProject/);
    assert.doesNotMatch(page, /\/api\/jobs/);
  });
});

describe("films review contract", () => {
  it("reviews trajectory and does not copy an agent brief", () => {
    const films = fs.readFileSync(path.join(here, "pages/Films.tsx"), "utf8");
    const film = fs.readFileSync(path.join(here, "pages/Film.tsx"), "utf8");
    assert.match(films, /看 agent 出过的任务/);
    assert.match(films, /methodLabel/);
    assert.doesNotMatch(films, /空壳/);
    assert.doesNotMatch(films, /createProject/);
    assert.match(film, /当时用了什么/);
    assert.match(film, /复盘这场出片/);
    assert.doesNotMatch(film, /BriefPanel/);
    assert.doesNotMatch(film, /点名给 agent/);
    assert.doesNotMatch(film, /api\.setRecipe/);
    assert.doesNotMatch(film, /setVoicePack/);
    assert.doesNotMatch(film, /setKit/);
    assert.doesNotMatch(film, /127\.0\.0\.1:5173/);
    assert.doesNotMatch(film, /LightUI/);
    assert.doesNotMatch(films, /study-explainer/);
    assert.match(film, /from "\.\.\/tasks\/study-explainer"/);
    assert.match(film, /from "\.\.\/tasks\/footage-narration"/);
    assert.match(film, /surface === "clips"/);
    assert.match(film, /画面描述/);
    assert.doesNotMatch(film, /createProject/);
    assert.doesNotMatch(film, /setRecipe/);
  });
});

describe("library catalog contract", () => {
  it("lets the catalog add, rename, delete without typing an id", () => {
    const page = fs.readFileSync(path.join(here, "pages/Library.tsx"), "utf8");
    assert.match(page, /uploadLibrary/);
    assert.match(page, /保存素材/);
    assert.match(page, /removeLibrary/);
    assert.match(page, /patchLibrary/);
    assert.doesNotMatch(page, /element\.mark/);
    assert.doesNotMatch(page, /先写素材 id/);
    assert.doesNotMatch(page, /usedBy/);
    assert.doesNotMatch(page, /还没有片子点名/);
    assert.doesNotMatch(page, /api\.projects/);
  });
});

describe("methods catalog contract", () => {
  it("lets the catalog add, edit, delete, then send a card to the workbench", () => {
    const page = fs.readFileSync(path.join(here, "pages/Methods.tsx"), "utf8");
    assert.match(page, /methodExpandName/);
    assert.match(page, /methodPlanLine/);
    assert.match(page, /ExpandPick/);
    assert.match(page, /SceneEditor/);
    assert.match(page, /加一场/);
    assert.doesNotMatch(page, /api\.recipes/);
    assert.doesNotMatch(page, /一种模型一场/);
    assert.doesNotMatch(page, /methodShape/);
    assert.match(page, /createMethod/);
    assert.match(page, /patchLibrary/);
    assert.match(page, /removeLibrary/);
    assert.match(page, /去组合/);
    assert.match(page, /\/\?recipe=/);
    assert.match(page, /kind === "method"/);
    assert.match(page, /保存方法/);
    assert.match(page, /删除/);
    assert.match(page, /可选铺场方案/);
    assert.doesNotMatch(page, /不改不删/);
    assert.doesNotMatch(page, /buildMethodBrief/);
    assert.doesNotMatch(page, /methodApplyLine/);
    assert.doesNotMatch(page, /复制用法/);
    assert.doesNotMatch(page, /举过例/);
    assert.doesNotMatch(page, /api\.projects/);
    assert.doesNotMatch(page, /recipe\.body/);
    assert.doesNotMatch(page, /kinds\.ts/);
    assert.doesNotMatch(page, /study-explainer/);
  });
});

describe("browser-safe weaver imports", () => {
  it("does not import the weaver barrel from src/", () => {
    const files = [
      "types.ts",
      "api.ts",
      "lib/voices.ts",
      "lib/langs.ts",
      "lib/method-brief.ts",
      "lib/brief.ts",
      "pages/Home.tsx",
      "pages/Film.tsx",
      "pages/Films.tsx",
      "pages/Methods.tsx",
    ];
    for (const file of files) {
      const text = fs.readFileSync(path.join(here, file), "utf8");
      assert.doesNotMatch(text, /from ["']@lightweaver\/weaver["']/);
    }
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
