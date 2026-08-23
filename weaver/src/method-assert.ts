import fs from "node:fs";
import path from "node:path";
import { loadLibrary } from "./assets.ts";
import { descriptionIsReady, readDescription, type DescriptionDoc } from "./describe-group.ts";
import { recipeIdOf } from "./method.ts";
import { err, isOstMode, methodClipAlignOf, methodNeedsOf, type Issue, type ProjectRecord, type SceneDef } from "./schema.ts";

export function assertMethodGates(project: ProjectRecord, root: string): Issue[] {
  const recipe = project.film.recipe?.trim();
  if (!recipe) return [];
  const wanted = recipeIdOf(recipe);
  const asset = loadLibrary(root).find((item) => item.kind === "method" && recipeIdOf(item.id) === wanted);
  if (!asset) return [];

  const issues: Issue[] = [];
  for (const need of methodNeedsOf(asset)) {
    if (need === "match-report") {
      const abs = path.join(project.root, "assets/match/report.json");
      if (!fs.existsSync(abs)) issues.push(err("recipe.needs.match-report", "需要 weaver match 写出匹配报告"));
      continue;
    }
    if (need === "description") {
      const found = project.assets.some(
        (item) => item.kind === "description" && item.file && fs.existsSync(path.join(project.root, item.file)),
      );
      if (!found) issues.push(err("recipe.needs.description", "需要 weaver describe 写出描述树"));
      continue;
    }
    if (need === "transcript") {
      const found = project.assets.some(
        (item) => item.kind === "transcript" && item.file && fs.existsSync(path.join(project.root, item.file)),
      );
      if (!found) issues.push(err("recipe.needs.transcript", "需要 weaver transcribe 写出转写"));
    }
  }

  if (asset.clipOst && isOstMode(asset.clipOst)) {
    for (const scene of project.film.scenes) {
      if (scene.kind !== "clip") continue;
      if (scene.ost !== asset.clipOst) {
        issues.push(err(`scenes.${scene.id}.ost`, `方法卡要求 ost 为 ${asset.clipOst}`));
      }
    }
  }

  if (methodClipAlignOf(asset) === "sequences") {
    issues.push(...assertSequenceClips(project, root));
  }
  return issues;
}

function assertSequenceClips(project: ProjectRecord, root: string): Issue[] {
  const docs = descriptionDocs(project, root);
  if (!docs.length) return [];
  const clips = project.film.scenes.filter((scene) => scene.kind === "clip");
  if (docs.length === 1) return alignClipsToSequences(clips, docs[0]!.doc);
  const issues: Issue[] = [];
  const matched = new Set<string>();
  for (const { videoId, doc } of docs) {
    const ref = `asset:${videoId}`;
    const subset = clips.filter((scene) => scene.source === ref);
    for (const scene of subset) matched.add(scene.id);
    issues.push(...alignClipsToSequences(subset, doc));
  }
  for (const scene of clips) {
    if (!matched.has(scene.id)) {
      issues.push(err(`scenes.${scene.id}.source`, "clip 对不上描述树的源视频"));
    }
  }
  return issues;
}

function descriptionDocs(project: ProjectRecord, root: string): { videoId: string; doc: DescriptionDoc }[] {
  const found: { videoId: string; doc: DescriptionDoc }[] = [];
  for (const asset of project.assets) {
    if (asset.kind !== "description" || !asset.file) continue;
    const doc = readDescription(path.join(project.root, asset.file));
    if (!doc || !descriptionIsReady(doc)) continue;
    const videoId = asset.scene ?? asset.id.replace(/^description\./, "");
    found.push({ videoId, doc });
  }
  return found;
}

function alignClipsToSequences(clips: SceneDef[], doc: DescriptionDoc): Issue[] {
  const issues: Issue[] = [];
  if (clips.length !== doc.sequences.length) {
    issues.push(err("recipe.clipAlign", `描述树 ${doc.sequences.length} 场，片子 ${clips.length} 场，必须一场一 clip`));
  }
  for (const sequence of doc.sequences) {
    const clip = clips.find((scene) => scene.id === sequence.id);
    if (!clip) {
      issues.push(err(`scenes.${sequence.id}`, `描述场 ${sequence.id} 没有同 id 的 clip`));
      continue;
    }
    if (
      typeof clip.in !== "number" ||
      typeof clip.out !== "number" ||
      Math.abs(clip.in - sequence.in) > 1e-3 ||
      Math.abs(clip.out - sequence.out) > 1e-3
    ) {
      issues.push(err(`scenes.${clip.id}.in`, `clip 的 in/out 必须等于描述场 ${sequence.id}`));
    }
  }
  return issues;
}
