import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildAgentBrief, instanceDir } from "./brief.ts";

describe("buildAgentBrief", () => {
  it("stitches voice, kit, recipe, and output home into a copyable agent note", () => {
    const text = buildAgentBrief({
      projectId: "dropdown-taxonomy",
      title: "给下拉起对名字",
      task: "study-explainer",
      recipeId: "taxonomy-parade",
      recipeTitle: "对照表阅兵",
      requiresList: true,
      voices: {
        zh: "library:voice.prompt",
        en: "library:voice.prompt",
      },
      voiceSet: { ref: "library:voice.prompt", label: "讲解女声" },
      voiceLabels: { "library:voice.prompt": "讲解女声" },
      langs: ["zh"],
      langLabels: { zh: "中文", en: "英文" },
      kit: ["library:element.mark"],
      kitLabels: { "library:element.mark": "Light mark" },
      outputHome: "first-party",
      outputs: { zh: "source-tutorial.mp4" },
    });
    assert.match(text, /后处理出片/);
    assert.match(text, /片子：dropdown-taxonomy（给下拉起对名字）/);
    assert.match(text, /方法：对照表阅兵/);
    assert.match(text, /recipe apply --project dropdown-taxonomy --recipe taxonomy-parade/);
    assert.match(text, /要出的语言：中文/);
    assert.match(text, /langs set --project dropdown-taxonomy --langs zh/);
    assert.match(text, /音色：讲解女声/);
    assert.match(text, /voice set --project dropdown-taxonomy --ref library:voice\.prompt/);
    assert.doesNotMatch(text, /音色：library:voice\.prompt/);
    assert.match(text, /素材（可选增强/);
    assert.match(text, /library:element\.mark（Light mark）/);
    assert.match(text, /有自己想法可以不用或另找/);
    assert.match(text, /kit set --project dropdown-taxonomy --refs library:element\.mark/);
    assert.match(text, /data\/first-party\/dropdown-taxonomy\/assets\/outputs/);
    assert.match(text, /source-tutorial\.mp4（zh）/);
    assert.match(text, /不要写到 products\/study-films/);
    assert.doesNotMatch(text, /只准用这些/);
    assert.doesNotMatch(text, /LightUI/);
    assert.doesNotMatch(text, /studies\//);
    assert.doesNotMatch(text, /开始前先问人/);
  });

  it("refuses to list split zh/en voices as two picks", () => {
    const text = buildAgentBrief({
      voices: { zh: "library:voice.prompt-zh", en: "library:voice.prompt-en" },
      kit: [],
    });
    assert.match(text, /还没绑成一套/);
    assert.doesNotMatch(text, /zh = /);
  });

  it("asks the agent to create a film when no project is named", () => {
    const text = buildAgentBrief({
      voices: {},
      kit: [],
    });
    assert.match(text, /片子：未指定/);
    assert.match(text, /任务：未点/);
    assert.match(text, /create 必须带 --task/);
    assert.match(text, /方法：未点/);
    assert.doesNotMatch(text, /study-explainer/);
    assert.match(text, /产物位置：未指定/);
    assert.match(text, /开始前先问人/);
    assert.match(text, /素材：未点/);
    assert.match(text, /产物位置问清后再 weaver project create/);
    assert.match(text, /create 带 --task <task>/);
    assert.match(text, /可选增强/);
    assert.doesNotMatch(text, /不要自己加 library 外/);
  });

  it("names a user-film output dir and does not invent an outside copy", () => {
    const text = buildAgentBrief({
      voices: {},
      kit: [],
      outputHome: "user",
    });
    assert.match(text, /data\/projects\/<id>\/assets\/outputs/);
    assert.match(text, /不要拷到仓库外/);
    assert.match(text, /project create <id> --source user --task <task>/);
    assert.doesNotMatch(text, /开始前先问人/);
    assert.doesNotMatch(text, /publish/);
  });

  it("maps first-party home to data/first-party without an outside project", () => {
    assert.equal(instanceDir("first-party", "nav-taxonomy"), "data/first-party/nav-taxonomy");
    assert.equal(instanceDir("user", "demo"), "data/projects/demo");
    const text = buildAgentBrief({
      voices: {},
      kit: [],
      outputHome: "first-party",
    });
    assert.match(text, /data\/first-party\/<id>\/assets\/outputs/);
    assert.match(text, /--source first-party --task <task>/);
    assert.doesNotMatch(text, /study-slug/);
    assert.doesNotMatch(text, /LightUI/);
    assert.doesNotMatch(text, /studies\//);
  });

  it("tells footage-narration to register source video and skip Remotion", () => {
    const text = buildAgentBrief({
      task: "footage-narration",
      voices: {},
      kit: [],
      langs: ["zh"],
      outputHome: "user",
    });
    assert.match(text, /任务：footage-narration/);
    assert.match(text, /--task footage-narration/);
    assert.match(text, /登记源视频/);
    assert.match(text, /跳过 original/);
    assert.match(text, /ffmpeg/);
    assert.doesNotMatch(text, /缺静帧再补/);
    assert.doesNotMatch(text, /LightUI/);
  });

  it("tells clone-from-edit to match instead of writing in/out", () => {
    const text = buildAgentBrief({
      task: "footage-narration",
      recipeId: "clone-from-edit",
      recipeTitle: "按已剪片复刻",
      requiresList: true,
      voices: {},
      kit: [],
      langs: ["zh"],
      outputHome: "user",
    });
    assert.match(text, /方法：按已剪片复刻/);
    assert.match(text, /weaver match/);
    assert.match(text, /--edited asset:video\.edited/);
    assert.doesNotMatch(text, /weaver recipe apply/);
    assert.match(text, /不要手填 clip 的 in\/out/);
    assert.match(text, /不要 tts/);
    assert.doesNotMatch(text, /跳过 original/);
    assert.doesNotMatch(text, /VoxCPM2/);
  });

  it("tells see-then-narrate to describe before writing lines", () => {
    const text = buildAgentBrief({
      task: "footage-narration",
      recipeId: "see-then-narrate",
      recipeTitle: "先看见再写解说",
      requiresList: true,
      voices: {},
      kit: [],
      langs: ["zh"],
      outputHome: "user",
    });
    assert.match(text, /方法：先看见再写解说/);
    assert.match(text, /weaver describe/);
    assert.match(text, /没有描述树禁止写解说/);
    assert.doesNotMatch(text, /weaver recipe apply/);
    assert.doesNotMatch(text, /weaver match/);
    assert.doesNotMatch(text, /缺静帧再补/);
  });

  it("tells highlight-mix to skip tts", () => {
    const text = buildAgentBrief({
      task: "footage-narration",
      recipeId: "highlight-mix",
      recipeTitle: "混剪抽点",
      requiresList: true,
      voices: {},
      kit: [],
      langs: ["zh"],
      outputHome: "user",
    });
    assert.match(text, /weaver transcribe/);
    assert.match(text, /不要 tts/);
    assert.doesNotMatch(text, /weaver recipe apply/);
    assert.doesNotMatch(text, /VoxCPM2/);
  });
});
