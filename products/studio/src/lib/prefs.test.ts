import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GITHUB_URL, THEME_KEY } from "./prefs.ts";

describe("site prefs", () => {
  it("points GitHub at this repo", () => {
    assert.equal(GITHUB_URL, "https://github.com/boomytc/LightWeaver");
    assert.equal(THEME_KEY, "lightweaver-theme");
  });
});
