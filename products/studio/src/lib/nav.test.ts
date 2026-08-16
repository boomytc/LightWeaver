import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isWorkbench, parseRoute } from "./nav.ts";

describe("parseRoute", () => {
  it("maps the control-site paths", () => {
    assert.deepEqual(parseRoute("/"), { name: "home" });
    assert.deepEqual(parseRoute("/films"), { name: "films" });
    assert.deepEqual(parseRoute("/voices"), { name: "voices" });
    assert.deepEqual(parseRoute("/library"), { name: "library" });
    assert.deepEqual(parseRoute("/methods"), { name: "methods" });
    assert.deepEqual(parseRoute("/f/intent-cascade"), { name: "film", id: "intent-cascade" });
    assert.deepEqual(parseRoute("/f/nav-taxonomy/"), { name: "film", id: "nav-taxonomy" });
  });

  it("treats combo catalogs as the workbench", () => {
    assert.equal(isWorkbench("/"), true);
    assert.equal(isWorkbench("/methods"), true);
    assert.equal(isWorkbench("/voices"), true);
    assert.equal(isWorkbench("/library"), true);
    assert.equal(isWorkbench("/films"), false);
    assert.equal(isWorkbench("/f/intent-cascade"), false);
  });

  it("does not invent extra product surfaces", () => {
    assert.deepEqual(parseRoute("/studio"), { name: "missing", path: "/studio" });
    assert.deepEqual(parseRoute("/s/intent-cascade"), { name: "missing", path: "/s/intent-cascade" });
  });
});
