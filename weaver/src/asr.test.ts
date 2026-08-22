import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { asrAudio, asrRuntime, ensureVoiceSaid, parseAsrResult } from "./asr.ts";
import { tempWorkspace } from "./test-workspace.ts";

const weaverPkg = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

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

describe("asrAudio", () => {
  it("passes a wav through and rejects a missing file", () => {
    const root = tempWorkspace();
    const wav = path.join(root, "clip.wav");
    fs.writeFileSync(wav, "RIFF");
    const prepared = asrAudio(wav);
    assert.equal(prepared.audio, wav);
    assert.equal(prepared.tmp, undefined);
    assert.throws(() => asrAudio(path.join(root, "missing.wav")), /找不到音频/);
  });

  it("extracts wav from a video file", () => {
    const root = tempWorkspace();
    const video = path.join(root, "clip.mp4");
    execFileSync(
      "ffmpeg",
      ["-y", "-f", "lavfi", "-i", "sine=frequency=440:duration=0.4", "-pix_fmt", "yuv420p", video],
      { stdio: "ignore" },
    );
    const prepared = asrAudio(video);
    assert.ok(prepared.tmp);
    assert.ok(fs.existsSync(prepared.audio));
    assert.match(prepared.audio, /\.wav$/i);
    fs.rmSync(prepared.tmp, { force: true });
  });
});

describe("weaver asr CLI", () => {
  it("fails without --file", () => {
    const result = spawnSync(process.execPath, ["--import", "tsx", "src/cli.ts", "asr", "--json"], {
      cwd: weaverPkg,
      encoding: "utf8",
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stdout + result.stderr, /weaver asr --file/);
  });
});

describe("asrRuntime", () => {
  it("is not ready without env or config and does not touch /Users/boom/Model", () => {
    const root = tempWorkspace();
    const runtime = asrRuntime(root, {});
    assert.equal(runtime.ready, false);
    assert.equal(runtime.model, undefined);
    assert.match(runtime.hint ?? "", /转写未就绪/);
    assert.doesNotMatch(runtime.hint ?? "", /\/Users\/boom\/Model/);
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
