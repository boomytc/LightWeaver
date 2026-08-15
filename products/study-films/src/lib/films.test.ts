import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FILM_SPECS } from "./catalog";
import { COMP_IDS, FILMS, catalogProblems, lineOf } from "./films";

describe("film catalog", () => {
  it("has no catalog problems", () => {
    assert.deepEqual(catalogProblems(), []);
  });

  it("registers zh and en compositions for every spec", () => {
    for (const spec of FILM_SPECS) {
      assert.ok(COMP_IDS.includes(`${spec.id}-zh`));
      assert.ok(COMP_IDS.includes(`${spec.id}-en`));
    }
  });

  it("keeps scene copy and spoken line aligned", () => {
    const film = FILMS["intent-cascade-zh"];
    assert.equal(film.brand, "LightUI");
    assert.equal(film.scenes[0]?.kind, "title");
    assert.ok(lineOf("intent-cascade", "zh", "title").includes("菜单意图预测"));
    assert.ok(film.scenes.some((scene) => scene.still === "desktop-full.png"));
  });
});
