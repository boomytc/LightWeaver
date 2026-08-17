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
      requiresKinds: true,
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
      publishDir: "studies/dropdown-taxonomy/references",
      outputs: { zh: "source-tutorial.mp4" },
    });
    assert.match(text, /请用 LightWeaver/);
    assert.match(text, /片子：dropdown-taxonomy（给下拉起对名字）/);
    assert.match(text, /方法卡：taxonomy-parade（对照表阅兵）/);
    assert.match(text, /recipe apply --project dropdown-taxonomy --recipe taxonomy-parade/);
    assert.match(text, /要出的语言：中文/);
    assert.match(text, /langs set --project dropdown-taxonomy --langs zh/);
    assert.match(text, /音色套：讲解女声/);
    assert.match(text, /voice set --project dropdown-taxonomy --ref library:voice\.prompt/);
    assert.doesNotMatch(text, /音色套：library:voice\.prompt/);
    assert.doesNotMatch(text, /中英成对，不要拆开换/);
    assert.match(text, /library:element\.mark（Light mark）/);
    assert.match(text, /kit set --project dropdown-taxonomy --refs library:element\.mark/);
    assert.match(text, /data\/first-party\/dropdown-taxonomy\/assets\/outputs/);
    assert.match(text, /source-tutorial\.mp4（zh）/);
    assert.match(text, /studies\/dropdown-taxonomy\/references/);
    assert.match(text, /不要写到 products\/study-films/);
    assert.doesNotMatch(text, /未点名/);
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
    assert.match(text, /方法卡：未点名/);
    assert.match(text, /产物位置：未指定/);
    assert.match(text, /开始前先问人/);
    assert.match(text, /产物位置问清后再 weaver project create/);
    assert.doesNotMatch(text, /先 weaver project create，再 langs set/);
  });

  it("names a user-film output dir and forbids publish", () => {
    const text = buildAgentBrief({
      voices: {},
      kit: [],
      outputHome: "user",
    });
    assert.match(text, /data\/projects\/<id>\/assets\/outputs/);
    assert.match(text, /不要 publish/);
    assert.match(text, /project create <id> --source user/);
    assert.doesNotMatch(text, /开始前先问人/);
  });

  it("maps first-party home to data/first-party and a LightUI copy", () => {
    assert.equal(instanceDir("first-party", "nav-taxonomy"), "data/first-party/nav-taxonomy");
    assert.equal(instanceDir("user", "demo"), "data/projects/demo");
    const text = buildAgentBrief({
      voices: {},
      kit: [],
      outputHome: "first-party",
    });
    assert.match(text, /data\/first-party\/<slug>\/assets\/outputs/);
    assert.match(text, /studies\/<slug>\/references/);
    assert.match(text, /--source first-party --study-slug <slug>/);
  });
});
