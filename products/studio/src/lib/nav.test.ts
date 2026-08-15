import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseRoute } from "./nav.ts";

describe("parseRoute", () => {
  it("maps the control-site paths", () => {
    assert.deepEqual(parseRoute("/"), { name: "home" });
    assert.deepEqual(parseRoute("/films"), { name: "films" });
    assert.deepEqual(parseRoute("/voices"), { name: "voices" });
    assert.deepEqual(parseRoute("/library"), { name: "library" });
    assert.deepEqual(parseRoute("/f/intent-cascade"), { name: "film", id: "intent-cascade" });
    assert.deepEqual(parseRoute("/f/nav-taxonomy/"), { name: "film", id: "nav-taxonomy" });
  });

  it("does not invent extra product surfaces", () => {
    assert.deepEqual(parseRoute("/studio"), { name: "missing", path: "/studio" });
    assert.deepEqual(parseRoute("/s/intent-cascade"), { name: "missing", path: "/s/intent-cascade" });
  });
});
