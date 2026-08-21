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
        {
          id: "voice.prompt",
          kind: "voice",
          label: "讲解女声",
          files: { zh: "voices/prompt-zh.wav", en: "voices/prompt-en.wav" },
        },
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
      task: "study-explainer",
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

export function seedFootageFilm(
  root: string,
  id: string,
  clips: { id: string; in: number; out: number; ost?: "narration" | "original" | "mix"; zh?: string; en?: string }[],
  options: { writeVideo?: boolean; writeWav?: boolean } = {},
) {
  const project = createProject(
    id,
    { source: "user", task: "footage-narration", title: id, output: `${id}.mp4`, outputEn: `${id}.en.mp4` },
    root,
  );
  const video: Asset = { id: "video.origin", kind: "video", file: "assets/source/origin.mp4", label: "origin" };
  saveAssets(project, [video]);
  if (options.writeVideo) touch(path.join(project.root, video.file!));
  for (const clip of clips) {
    if (clip.id === "cut-01") {
      patchScene(project, "cut-01", {
        source: "asset:video.origin",
        in: clip.in,
        out: clip.out,
        ost: clip.ost ?? "narration",
        lines: {
          zh: clip.zh ?? (clip.ost === "original" ? "" : clip.id),
          en: clip.en ?? (clip.ost === "original" ? "" : clip.id),
        },
      });
    } else {
      addScene(project, {
        id: clip.id,
        kind: "clip",
        source: "asset:video.origin",
        in: clip.in,
        out: clip.out,
        ost: clip.ost ?? "narration",
      });
      patchScene(project, clip.id, {
        lines: {
          zh: clip.zh ?? (clip.ost === "original" ? "" : clip.id),
          en: clip.en ?? (clip.ost === "original" ? "" : clip.id),
        },
      });
    }
    if (options.writeWav && clip.ost !== "original") {
      touch(path.join(project.root, `assets/lines/zh/${clip.id}.wav`));
      touch(path.join(project.root, `assets/lines/en/${clip.id}.wav`));
      saveAssets(project, [
        ...project.assets.filter((asset) => asset.id !== `line.${clip.id}.zh` && asset.id !== `line.${clip.id}.en`),
        { id: `line.${clip.id}.zh`, kind: "line", locale: "zh", scene: clip.id, file: `assets/lines/zh/${clip.id}.wav` },
        { id: `line.${clip.id}.en`, kind: "line", locale: "en", scene: clip.id, file: `assets/lines/en/${clip.id}.wav` },
      ]);
    }
  }
  if (clips.length && !clips.some((clip) => clip.id === "cut-01") && project.film.scenes.some((scene) => scene.id === "cut-01")) {
    removeScene(project, "cut-01");
  }
  return loadProject(id, root);
}
