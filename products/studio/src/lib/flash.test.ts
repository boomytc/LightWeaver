import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FLASH_MS } from "./flash.ts";

describe("flash", () => {
  it("dismisses success copy after 3 seconds", () => {
    assert.equal(FLASH_MS, 3000);
  });
});
