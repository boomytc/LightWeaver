import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { addAsset, placeVideoFile } from "./assets.ts";
import { destRel, folderFor } from "./ingest.ts";
import { createProject } from "./project.ts";
import { tempWorkspace, touch } from "./test-workspace.ts";

describe("video ingest", () => {
  it("maps video assets into assets/source", () => {
    assert.equal(folderFor("video"), "assets/source");
    assert.equal(folderFor("description"), "assets/descriptions");
    assert.equal(destRel("video", "video.edited", undefined, ".mp4"), "assets/source/edited.mp4");
  });

  it("copies an outside file into the project source folder", () => {
    const root = tempWorkspace();
    const project = createProject("site-clone", { task: "footage-narration" }, root);
    const outside = path.join(root, "outside-edited.mp4");
    touch(outside, "mp4-bytes");
    const asset = addAsset(
      { kind: "project", project },
      { id: "video.edited", kind: "video", file: outside },
      root,
    );
    assert.equal(asset.file, "assets/source/edited.mp4");
    const dest = path.join(project.root, "assets/source/edited.mp4");
    assert.equal(fs.readFileSync(dest, "utf8"), "mp4-bytes");
  });

  it("registers a file already inside the project without copying away", () => {
    const root = tempWorkspace();
    const project = createProject("site-clone", { task: "footage-narration" }, root);
    const rel = "assets/source/origin.mp4";
    touch(path.join(project.root, rel), "inside");
    const placed = placeVideoFile(project, "video.origin", rel);
    assert.equal(placed, rel);
    assert.equal(fs.readFileSync(path.join(project.root, rel), "utf8"), "inside");
  });
});
