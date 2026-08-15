import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createProject, loadProject, saveAssets, saveFilm } from "./project.ts";
import type { Asset } from "./schema.ts";
import { addScene, patchScene, removeScene } from "./scenes.ts";

export function tempWorkspace(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "weaver-"));
  fs.mkdirSync(path.join(root, "library"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "library/assets.json"),
    `${JSON.stringify({
      assets: [
        { id: "voice.prompt-zh", kind: "voice", locale: "zh", file: "voices/prompt-zh.wav" },
        { id: "voice.prompt-en", kind: "voice", locale: "en", file: "voices/prompt-en.wav" },
      ],
    })}\n`,
  );
  return root;
}

export function touch(file: string, body = "x"): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, body);
}

export function seedLabFilm(
  root: string,
  id: string,
  stills: { id: string; file: string; role?: "problem" | "rule" | "contrast" }[],
  options: { writePng?: boolean; lines?: Record<string, { zh: string; en: string }> } = {},
) {
  const project = createProject(
    id,
    {
      source: "first-party",
      studySlug: id,
      title: id,
      output: `${id}.mp4`,
      outputEn: `${id}.en.mp4`,
    },
    root,
  );
  for (const still of stills) {
    addScene(project, {
      id: still.id,
      kind: "still",
      still: `asset:still.${still.id}`,
      fit: "contain",
      role: still.role,
    });
    const asset: Asset = {
      id: `still.${still.id}`,
      kind: "still",
      files: {
        zh: `assets/stills/zh/${still.file}`,
        en: `assets/stills/en/${still.file}`,
      },
    };
    saveAssets(project, [...project.assets.filter((item) => item.id !== asset.id), asset]);
    if (options.writePng) {
      touch(path.join(project.root, "assets/stills/zh", still.file));
      touch(path.join(project.root, "assets/stills/en", still.file));
    }
    const line = options.lines?.[still.id];
    if (line) patchScene(project, still.id, { lines: line });
  }
  if (project.film.scenes.some((scene) => scene.id === "hero")) removeScene(project, "hero");
  return loadProject(id, root);
}
