import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildAgentBrief } from "./brief.ts";

describe("buildAgentBrief", () => {
  it("stitches voice, kit, and recipe into a copyable agent note", () => {
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
    assert.doesNotMatch(text, /未点名/);
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
    assert.match(text, /project create/);
  });
});
