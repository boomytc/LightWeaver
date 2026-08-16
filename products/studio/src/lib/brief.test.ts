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
        zh: "library:voice.prompt-zh",
        en: "library:voice.prompt-en",
      },
      voiceLabels: { "library:voice.prompt-zh": "讲解女声（中）" },
      kit: ["library:element.mark"],
      kitLabels: { "library:element.mark": "Light mark" },
    });
    assert.match(text, /请用 LightWeaver/);
    assert.match(text, /片子：dropdown-taxonomy（给下拉起对名字）/);
    assert.match(text, /方法卡：taxonomy-parade（对照表阅兵）/);
    assert.match(text, /recipe apply --project dropdown-taxonomy --recipe taxonomy-parade/);
    assert.match(text, /zh = library:voice\.prompt-zh（讲解女声（中））/);
    assert.match(text, /library:element\.mark（Light mark）/);
    assert.match(text, /kit set --project dropdown-taxonomy --refs library:element\.mark/);
    assert.doesNotMatch(text, /未点名/);
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
