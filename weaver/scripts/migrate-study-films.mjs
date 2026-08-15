#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const filmsRoot = path.join(root, "products/study-films");
const oldFilmsDir = path.join(filmsRoot, "films");
const narrationPath = path.join(filmsRoot, "scripts/narration.json");

if (!fs.existsSync(oldFilmsDir) || !fs.existsSync(narrationPath)) {
  console.log("skip migrate: old films/ or narration.json already gone");
  process.exit(0);
}

const narration = JSON.parse(fs.readFileSync(narrationPath, "utf8"));

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
}

function copyIf(src, dest) {
  if (!fs.existsSync(src)) return false;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  return true;
}

const libraryDir = path.join(root, "library");
fs.mkdirSync(path.join(libraryDir, "voices"), { recursive: true });
fs.mkdirSync(path.join(libraryDir, "elements"), { recursive: true });

copyIf(path.join(filmsRoot, "assets/voice-prompt.zh.wav"), path.join(libraryDir, "voices/prompt-zh.wav"));
copyIf(path.join(filmsRoot, "assets/voice-prompt.en.wav"), path.join(libraryDir, "voices/prompt-en.wav"));
copyIf(path.join(filmsRoot, "assets/voice-prompt.zh.txt"), path.join(libraryDir, "voices/prompt-zh.txt"));
copyIf(path.join(filmsRoot, "assets/voice-prompt.en.txt"), path.join(libraryDir, "voices/prompt-en.txt"));

writeJson(path.join(libraryDir, "assets.json"), {
  assets: [
    {
      id: "voice.prompt-zh",
      kind: "voice",
      locale: "zh",
      file: "voices/prompt-zh.wav",
      text: narration.prompts.zh.text,
      style: narration.voices.zh,
      label: "讲解女声（中）",
    },
    {
      id: "voice.prompt-en",
      kind: "voice",
      locale: "en",
      file: "voices/prompt-en.wav",
      text: narration.prompts.en.text,
      style: narration.voices.en,
      label: "Narrator (EN)",
    },
    {
      id: "element.mark",
      kind: "element",
      file: "elements/mark.svg",
      label: "Light mark",
    },
  ],
});

const markSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
  <rect width="24" height="24" rx="6" fill="#17181c"/>
  <path d="M5 19 19 5v14Z" fill="white" fill-opacity="0.35" stroke="white" stroke-width="1.4"/>
</svg>
`;
fs.writeFileSync(path.join(libraryDir, "elements/mark.svg"), markSvg);

function extraStills(filmId) {
  if (filmId === "intent-cascade") return ["mobile.png"];
  return ["comp-01.png", "comp-07.png", "mobile.png"];
}

function stillIdFromFile(file, usedByScene) {
  if (usedByScene) return `still.${usedByScene}`;
  return `still.${path.basename(file, ".png")}`;
}

for (const name of fs.readdirSync(oldFilmsDir).filter((file) => file.endsWith(".json"))) {
  const spec = JSON.parse(fs.readFileSync(path.join(oldFilmsDir, name), "utf8"));
  const projectDir = path.join(filmsRoot, "projects", spec.id);
  const lines = narration.films[spec.id];
  const fileToScene = {};
  const assets = [];

  const scenes = spec.scenes.map((scene) => {
    const next = {
      id: scene.id,
      kind: scene.kind,
      fit: scene.fit,
      lines: {
        zh: lines.zh.find((line) => line.id === scene.id)?.text ?? "",
        en: lines.en.find((line) => line.id === scene.id)?.text ?? "",
      },
    };
    if (scene.still) {
      next.still = `asset:still.${scene.id}`;
      fileToScene[scene.still] = scene.id;
    }
    return next;
  });

  const stillFiles = new Set([
    ...Object.keys(fileToScene),
    ...extraStills(spec.id),
  ]);

  for (const file of stillFiles) {
    const sceneId = fileToScene[file];
    const id = stillIdFromFile(file, sceneId);
    const files = {};
    for (const locale of ["zh", "en"]) {
      const src =
        locale === "en"
          ? path.join(filmsRoot, "public/stills/en", spec.id, file)
          : path.join(filmsRoot, "public/stills", spec.id, file);
      const dest = path.join(projectDir, "assets/stills", locale, file);
      if (copyIf(src, dest)) files[locale] = `assets/stills/${locale}/${file}`;
    }
    if (Object.keys(files).length) {
      assets.push({ id, kind: "still", files, label: file });
    }
  }

  for (const locale of ["zh", "en"]) {
    for (const scene of spec.scenes) {
      const src = path.join(filmsRoot, "public/voice", locale, spec.id, `${scene.id}.wav`);
      const dest = path.join(projectDir, "assets/lines", locale, `${scene.id}.wav`);
      if (copyIf(src, dest)) {
        assets.push({
          id: `line.${scene.id}.${locale}`,
          kind: "line",
          locale,
          scene: scene.id,
          file: `assets/lines/${locale}/${scene.id}.wav`,
        });
      }
    }
  }

  const film = {
    id: spec.id,
    brand: spec.brand,
    publish: spec.publish,
    capture: spec.capture,
    voices: {
      zh: "library:voice.prompt-zh",
      en: "library:voice.prompt-en",
    },
    locales: spec.locales,
    scenes,
  };

  writeJson(path.join(projectDir, "film.json"), film);
  writeJson(path.join(projectDir, "assets.json"), { assets });
  console.log("migrated", spec.id, "scenes", scenes.length, "assets", assets.length);
}

console.log("migrate done");
