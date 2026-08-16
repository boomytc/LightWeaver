import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GITHUB_URL, MODELBEST_URL, THEME_KEY } from "./prefs.ts";

describe("site prefs", () => {
  it("points GitHub at this repo and ModelBest at the console", () => {
    assert.equal(GITHUB_URL, "https://github.com/boomytc/LightWeaver");
    assert.equal(MODELBEST_URL, "https://platform.modelbest.cn/console/login?ref=B08B4DDF");
    assert.equal(THEME_KEY, "lightweaver-theme");
  });
});
