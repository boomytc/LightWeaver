import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { modelbestStatus, probeModelbest, setModelbestApiKey } from "./config.ts";
import { tempWorkspace } from "./test-workspace.ts";

describe("modelbestStatus", () => {
  it("reads a file key and never returns the secret", () => {
    const root = tempWorkspace();
    fs.writeFileSync(path.join(root, "config.local.yaml"), "modelbest_api_key: 'sk-live-9f2a'\n");
    const status = modelbestStatus(root, {});
    assert.deepEqual(status, { configured: true, hint: "··9f2a", source: "file" });
    assert.doesNotMatch(fs.readFileSync(path.join(root, "config.local.yaml"), "utf8"), /undefined/);
  });

  it("prefers the environment over the file", () => {
    const root = tempWorkspace();
    fs.writeFileSync(path.join(root, "config.local.yaml"), "modelbest_api_key: 'file-key-zzzz'\n");
    const status = modelbestStatus(root, { MODELBEST_API_KEY: "env-key-abcd" });
    assert.equal(status.source, "env");
    assert.equal(status.hint, "··abcd");
  });

  it("writes the key into config.local.yaml", () => {
    const root = tempWorkspace();
    const status = setModelbestApiKey("sk-new-wxyz", root);
    assert.equal(status.configured, true);
    assert.equal(status.hint, "··wxyz");
    assert.match(fs.readFileSync(path.join(root, "config.local.yaml"), "utf8"), /modelbest_api_key: 'sk-new-wxyz'/);
    assert.match(fs.readFileSync(path.join(root, "config.local.yaml"), "utf8"), /modelbest_base_url:/);
  });

  it("probe asks to fetch a key when none is set", async () => {
    const root = tempWorkspace();
    const result = await probeModelbest(root, {});
    assert.deepEqual(result, { ok: false, message: "还没有密钥，先去获取" });
  });

  it("probe posts speech and treats 401 as a bad key", async () => {
    const root = tempWorkspace();
    let url = "";
    let method = "";
    const result = await probeModelbest(root, { MODELBEST_API_KEY: "bad" }, async (next, init) => {
      url = String(next);
      method = String(init?.method ?? "");
      return new Response("", { status: 401 });
    });
    assert.match(url, /\/audio\/speech$/);
    assert.equal(method, "POST");
    assert.deepEqual(result, { ok: false, message: "密钥无效" });
  });

  it("remembers a successful probe for the same key", async () => {
    const root = tempWorkspace();
    const env = { MODELBEST_API_KEY: "sk-live-okok" };
    await probeModelbest(root, env, async () => new Response("ok", { status: 200 }));
    const status = modelbestStatus(root, env);
    assert.deepEqual(status.probe, { ok: true, message: "连接正常" });
  });

  it("drops the cached probe when the key changes", async () => {
    const root = tempWorkspace();
    await probeModelbest(root, { MODELBEST_API_KEY: "sk-old-aaaa" }, async () => new Response("ok", { status: 200 }));
    const status = modelbestStatus(root, { MODELBEST_API_KEY: "sk-new-bbbb" });
    assert.equal(status.probe, undefined);
  });

  it("clears a successful cache after the same key fails", async () => {
    const root = tempWorkspace();
    const env = { MODELBEST_API_KEY: "sk-flip-cccc" };
    await probeModelbest(root, env, async () => new Response("ok", { status: 200 }));
    await probeModelbest(root, env, async () => new Response("", { status: 401 }));
    assert.equal(modelbestStatus(root, env).probe, undefined);
  });
});
