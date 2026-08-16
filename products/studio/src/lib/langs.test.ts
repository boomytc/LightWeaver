import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { filmLangs, langLabel } from "./langs.ts";

describe("filmLangs", () => {
  it("treats omitted langs as every locale on the film", () => {
    assert.deepEqual(filmLangs({ locales: { zh: {}, en: {} } }), ["zh", "en"]);
    assert.deepEqual(filmLangs({ locales: { zh: {}, en: {} }, langs: ["zh"] }), ["zh"]);
    assert.equal(langLabel("zh"), "中文");
  });
});
