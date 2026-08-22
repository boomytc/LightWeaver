import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { parseTtsResult, runTts, speakLine, ttsItems } from "./tts.ts";
import { seedFootageFilm, tempWorkspace } from "./test-workspace.ts";

const weaverPkg = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("parseTtsResult", () => {
  it("reads the wrote envelope, not the last nested object", () => {
    const output = '{"wrote": [{"scene": "title", "file": "assets/lines/zh/title.wav", "seconds": 5.12}]}';
    const result = parseTtsResult(output);
    assert.equal(result.wrote?.[0]?.scene, "title");
    assert.equal(result.wrote?.length, 1);
  });

  it("uses the last JSON line when logs precede it", () => {
    const output = ['noise', '{"wrote":[]}'].join("\n");
    assert.deepEqual(parseTtsResult(output).wrote, []);
  });
});

describe("ttsItems", () => {
  it("skips original ost and empty lines", () => {
    const items = ttsItems(
      [
        { id: "say", kind: "clip", ost: "narration", lines: { zh: "这一下她没再退。" } },
        { id: "keep", kind: "clip", ost: "original", lines: { zh: "" } },
        { id: "quiet", kind: "clip", ost: "mix", lines: { zh: "  " } },
      ],
      "zh",
    );
    assert.deepEqual(
      items.map((item) => item.id),
      ["say"],
    );
  });
});

describe("speakLine", () => {
  it("refuses a non-library voice and a missing clone source", () => {
    const root = tempWorkspace();
    assert.throws(
      () => speakLine({ text: "这一下。", voice: "asset:voice.prompt", dest: "/tmp/x.wav", root }),
      /library:voice/,
    );
    assert.throws(
      () => speakLine({ text: "这一下。", voice: "library:voice.prompt", dest: "/tmp/x.wav", root }),
      /还没有克隆源/,
    );
    assert.throws(
      () => speakLine({ text: "这一下。", voice: "library:voice.prompt", dest: "/tmp/x.mp3", root }),
      /\.wav/,
    );
  });
});

describe("weaver tts CLI", () => {
  it("uses the standalone contract when --text is set", () => {
    const result = spawnSync(
      process.execPath,
      ["--import", "tsx", "src/cli.ts", "tts", "--text", "嗨", "--json"],
      { cwd: weaverPkg, encoding: "utf8" },
    );
    assert.notEqual(result.status, 0);
    assert.match(result.stdout + result.stderr, /weaver tts --text/);
  });
});

describe("runTts", () => {
  it("writes nothing for an all-original film and does not require wavs", () => {
    const root = tempWorkspace();
    const project = seedFootageFilm(root, "silent-cut", [
      { id: "keep", in: 1, out: 2, ost: "original", zh: "", en: "" },
    ]);
    const result = runTts({ projectId: project.id, root, locale: "zh" });
    assert.deepEqual(result.wrote, []);
  });
});
