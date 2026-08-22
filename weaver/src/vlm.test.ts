import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { describePrompt, parseVlmResult, vlmRuntime } from "./vlm.ts";
import { DEFAULT_VLM_MODEL } from "./describe-settings.ts";
import { tempWorkspace } from "./test-workspace.ts";

describe("parseVlmResult", () => {
  it("reads the last JSON line", () => {
    const output = ["load", '{"observation":"室内两人相对站着。"}'].join("\n");
    assert.equal(parseVlmResult(output).observation, "室内两人相对站着。");
  });

  it("rejects empty output", () => {
    assert.throws(() => parseVlmResult("no json here"), /没有 JSON/);
  });
});

describe("vlmRuntime", () => {
  it("is not ready without a ModelBest key", () => {
    const root = tempWorkspace();
    const runtime = vlmRuntime(root, {});
    assert.equal(runtime.ready, false);
    assert.equal(runtime.model, DEFAULT_VLM_MODEL);
    assert.match(runtime.hint ?? "", /画面描述未就绪/);
    assert.match(runtime.hint ?? "", /modelbest_api_key/);
  });

  it("is ready when the key is in env", () => {
    const root = tempWorkspace();
    const runtime = vlmRuntime(root, { MODELBEST_API_KEY: "sk-test" });
    assert.equal(runtime.ready, true);
    assert.equal(runtime.model, DEFAULT_VLM_MODEL);
  });
});

describe("describePrompt", () => {
  it("carries the previous sequence line and frame times", () => {
    const text = describePrompt([{ t: 1.2 }, { t: 4 }], "走廊里有人走过");
    assert.match(text, /上一场：走廊里有人走过/);
    assert.match(text, /1.20/);
    assert.match(text, /只写能看见的画面/);
    assert.doesNotMatch(text, /旁白/);
  });
});
