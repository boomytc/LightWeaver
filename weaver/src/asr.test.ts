import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { asrRuntime, ensureVoiceSaid, parseAsrResult } from "./asr.ts";
import { tempWorkspace } from "./test-workspace.ts";

describe("parseAsrResult", () => {
  it("reads the last JSON line", () => {
    const output = ['load model', '{"text":"先把名称说清楚","language":"zh","seconds":2.4}'].join("\n");
    const result = parseAsrResult(output);
    assert.equal(result.text, "先把名称说清楚");
    assert.equal(result.language, "zh");
    assert.equal(result.seconds, 2.4);
  });

  it("rejects empty output", () => {
    assert.throws(() => parseAsrResult("no json here"), /没有 JSON/);
  });
});

describe("ensureVoiceSaid", () => {
  it("keeps a handwritten line and does not call transcribe", () => {
    const said = ensureVoiceSaid("/nope.wav", "  手写稿  ", "/tmp", () => {
      throw new Error("should not transcribe");
    });
    assert.equal(said, "手写稿");
  });

  it("fills from transcribe when the line is empty", () => {
    const said = ensureVoiceSaid("/clip.wav", "  ", "/tmp", () => ({ text: "转写稿" }));
    assert.equal(said, "转写稿");
  });
});

describe("asrRuntime", () => {
  it("is not ready in an empty workspace", () => {
    const root = tempWorkspace();
    const runtime = asrRuntime(root, {});
    assert.equal(runtime.ready, false);
    assert.match(runtime.hint ?? "", /转写未就绪/);
  });

  it("is ready when model, library and bindings exist", () => {
    const root = tempWorkspace();
    const model = path.join(root, "qwen.gguf");
    const library = path.join(root, "libtranscribe.dylib");
    const bindings = path.join(root, "bindings");
    fs.writeFileSync(model, "gguf");
    fs.writeFileSync(library, "lib");
    fs.mkdirSync(path.join(bindings, "transcribe_cpp"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "config.local.yaml"),
      [`asr_model: '${model}'`, `asr_library: '${library}'`, `asr_bindings: '${bindings}'`].join("\n"),
    );
    const runtime = asrRuntime(root, {});
    assert.equal(runtime.ready, true);
    assert.equal(runtime.model, model);
    assert.equal(runtime.library, library);
    assert.equal(runtime.bindings, bindings);
  });
});
