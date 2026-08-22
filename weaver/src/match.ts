import fs from "node:fs";
import path from "node:path";
import { findAsset, resolveAssetFile } from "./assets.ts";
import { loadProject, saveFilm } from "./project.ts";
import { weaverRoot } from "./paths.ts";
import { filmLangs, filmTask, type ProjectRecord, type SceneDef } from "./schema.ts";
import { alignEditedToSources, pickCandidate, type Candidate } from "./match-align.ts";
import {
  applyPadding,
  detectScenes,
  dropCrumbs,
  enforceDuration,
  mergeAdjacentCuts,
  splitAndSnapCuts,
  stabilizeCuts,
  type SceneIndex,
  type TimedCut,
} from "./match-scene.ts";
import {
  cutsFromVisualScenes,
  extractFrameHashes,
  fillSilentGaps,
  rankCandidates,
  type FrameHash,
} from "./match-visual.ts";
import { hasAudioStream, probeDuration } from "./probe.ts";
import { runAsr, type AsrResult } from "./asr.ts";
import { readTranscript, runTranscribe, transcriptRel, type TranscriptResult } from "./transcribe.ts";

export type MatchCut = {
  sceneId: string;
  sourceRef: string;
  in: number;
  out: number;
  editedStart: number;
  editedEnd: number;
  text: string;
  score: number;
  textScore: number;
  visualScore: number;
  matchMethod: "text" | "visual" | "visual_scene" | "silent_gap";
  sceneSnapped: boolean;
  warnings: string[];
};

export type MatchItem = {
  sentenceText: string;
  editedStart: number;
  editedEnd: number;
  selected?: Candidate & { visualScore?: number; combinedScore?: number };
  candidates: (Candidate & { visualScore?: number; combinedScore?: number })[];
};

export type MatchReport = {
  edited: string;
  sources: string[];
  visual: boolean;
  warnings: string[];
  items: MatchItem[];
  cuts: MatchCut[];
};

export type MatchOptions = {
  projectId: string;
  edited: string;
  sources?: string[] | string;
  visual?: boolean;
  root?: string;
};

export type MatchDeps = {
  transcribe?: (opts: { audio: string; root?: string }) => AsrResult | Pick<AsrResult, "text">;
  hasAudio?: (file: string) => boolean;
  scenes?: (file: string) => SceneIndex;
  duration?: (file: string) => number;
  hashes?: (file: string) => FrameHash[];
};

export type MatchResult = {
  projectId: string;
  cuts: MatchCut[];
  report: string;
  subtitle?: string;
  visual: boolean;
};

function requireVideoRef(project: ProjectRecord, ref: string, root: string, label: string) {
  const asset = findAsset(project, ref, root);
  if (!asset || asset.kind !== "video") throw new Error(`${label} 必须是 asset:video.*`);
  const resolved = resolveAssetFile(project, ref, undefined, root);
  if (!resolved || !fs.existsSync(resolved.absPath)) throw new Error(`找不到 ${label} ${ref}`);
  return { asset, resolved };
}

function parseSourceList(raw: string[] | string | undefined, project: ProjectRecord, edited: string): string[] {
  const listed = (Array.isArray(raw) ? raw : raw?.split(",") ?? [])
    .map((item) => item.trim())
    .filter(Boolean);
  if (listed.length) return listed;
  return project.assets
    .filter((asset) => asset.kind === "video" && `asset:${asset.id}` !== edited)
    .map((asset) => `asset:${asset.id}`);
}

function ensureRef(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith("asset:")) return trimmed;
  throw new Error("视频引用必须是 asset:video.*");
}

function matchLocale(project: ProjectRecord): string {
  const langs = filmLangs(project.film);
  if (langs.includes("zh")) return "zh";
  return langs[0] ?? Object.keys(project.film.locales)[0] ?? "zh";
}

function sceneId(index: number): string {
  return `cut-${String(index).padStart(2, "0")}`;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function reportRel(): string {
  return "assets/match/report.json";
}

function loadOrTranscribe(
  project: ProjectRecord,
  ref: string,
  root: string,
  transcribe: MatchDeps["transcribe"],
): TranscriptResult {
  const videoId = findAsset(project, ref, root)?.id ?? "origin";
  const abs = path.join(project.root, transcriptRel(videoId));
  const cached = readTranscript(abs);
  if (cached?.sentences.length) return cached;
  return runTranscribe({ projectId: project.id, ref, root }, transcribe ?? runAsr).transcript;
}

export function cutsFromTextAlign(
  edited: TranscriptResult,
  sources: { ref: string; transcript: TranscriptResult }[],
): { cuts: MatchCut[]; items: MatchItem[]; warnings: string[] } {
  const rows = alignEditedToSources(edited, sources);
  const cuts: MatchCut[] = [];
  const items: MatchItem[] = [];
  const warnings: string[] = [];
  for (const row of rows) {
    const picked = pickCandidate(row.candidates);
    const item: MatchItem = {
      sentenceText: row.text,
      editedStart: row.start,
      editedEnd: row.end,
      candidates: row.candidates.map((candidate) => ({ ...candidate, combinedScore: candidate.score, visualScore: 0 })),
      selected: picked ? { ...picked, combinedScore: picked.score, visualScore: 0 } : undefined,
    };
    items.push(item);
    if (!picked || picked.tEnd <= picked.tStart) {
      warnings.push(`句子无候选：${row.text}`);
      continue;
    }
    const index = cuts.length + 1;
    cuts.push({
      sceneId: sceneId(index),
      sourceRef: picked.sourceRef,
      in: round3(picked.tStart),
      out: round3(picked.tEnd),
      editedStart: row.start,
      editedEnd: row.end,
      text: row.text,
      score: picked.score,
      textScore: picked.score,
      visualScore: 0,
      matchMethod: "text",
      sceneSnapped: false,
      warnings: [],
    });
  }
  return { cuts, items, warnings };
}

function loadHashes(
  project: ProjectRecord,
  editedId: string,
  editedFile: string,
  sourceFiles: Map<string, string>,
  custom?: (file: string) => FrameHash[],
): { edited: FrameHash[]; sources: Map<string, FrameHash[]> } {
  const grab = (file: string, id: string) =>
    custom?.(file) ?? extractFrameHashes(file, path.join(project.root, "assets/match/frames", id));
  const sources = new Map<string, FrameHash[]>();
  for (const [ref, file] of sourceFiles) {
    sources.set(ref, grab(file, ref.replace(/^asset:/, "")));
  }
  return { edited: grab(editedFile, editedId), sources };
}

function rerankCuts(
  items: MatchItem[],
  edited: FrameHash[],
  sources: Map<string, FrameHash[]>,
): { items: MatchItem[]; cuts: MatchCut[] } {
  const nextItems: MatchItem[] = [];
  const cuts: MatchCut[] = [];
  for (const item of items) {
    const ranked = rankCandidates(item.candidates, edited, sources, item.editedStart, item.editedEnd);
    const selected = ranked[0];
    nextItems.push({ ...item, candidates: ranked, selected });
    if (!selected || selected.tEnd <= selected.tStart) continue;
    cuts.push({
      sceneId: sceneId(cuts.length + 1),
      sourceRef: selected.sourceRef,
      in: round3(selected.tStart),
      out: round3(selected.tEnd),
      editedStart: item.editedStart,
      editedEnd: item.editedEnd,
      text: item.sentenceText,
      score: selected.combinedScore,
      textScore: selected.score,
      visualScore: selected.visualScore,
      matchMethod: selected.visualScore > 0 ? "visual_scene" : "text",
      sceneSnapped: false,
      warnings: [],
    });
  }
  return { items: nextItems, cuts };
}

function toTimed(cut: MatchCut): TimedCut {
  return {
    sourceRef: cut.sourceRef,
    in: cut.in,
    out: cut.out,
    editedStart: cut.editedStart,
    editedEnd: cut.editedEnd,
    originalIn: cut.in,
    originalOut: cut.out,
    sceneSnapped: cut.sceneSnapped,
    warnings: [...cut.warnings],
    text: cut.text,
    score: cut.score,
    textScore: cut.textScore,
    visualScore: cut.visualScore,
    matchMethod: cut.matchMethod,
  };
}

function fromTimed(cut: TimedCut, index: number): MatchCut {
  return {
    sceneId: sceneId(index),
    sourceRef: cut.sourceRef,
    in: round3(cut.in),
    out: round3(cut.out),
    editedStart: cut.editedStart,
    editedEnd: cut.editedEnd,
    text: cut.text,
    score: cut.score,
    textScore: cut.textScore,
    visualScore: cut.visualScore,
    matchMethod: cut.sceneSnapped && cut.matchMethod === "text" ? "text" : cut.matchMethod,
    sceneSnapped: cut.sceneSnapped,
    warnings: cut.warnings,
  };
}

export function finalizeCuts(
  cuts: MatchCut[],
  editedScene: SceneIndex | undefined,
  sourceScenes: Map<string, SceneIndex>,
  sourceDurations: Map<string, number>,
): MatchCut[] {
  let timed = cuts.map(toTimed);
  timed = splitAndSnapCuts(timed, editedScene, sourceScenes);
  timed = applyPadding(timed, sourceDurations);
  timed = stabilizeCuts(timed);
  timed = enforceDuration(timed, sourceDurations);
  timed = stabilizeCuts(timed);
  timed = mergeAdjacentCuts(timed);
  timed = dropCrumbs(timed);
  return timed.map((cut, index) => fromTimed(cut, index + 1));
}

function writeScenes(project: ProjectRecord, cuts: MatchCut[], locale: string): void {
  const locales = Object.keys(project.film.locales);
  const scenes: SceneDef[] = cuts.map((cut) => ({
    id: cut.sceneId,
    kind: "clip",
    source: cut.sourceRef,
    in: cut.in,
    out: cut.out,
    ost: "original",
    lines: Object.fromEntries(locales.map((key) => [key, key === locale ? cut.text : ""])),
  }));
  saveFilm(project, { ...project.film, scenes });
}

export function formatSrtTime(seconds: number): string {
  const ms = Math.max(0, Math.round(seconds * 1000));
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  const secs = Math.floor((ms % 60_000) / 1000);
  const milli = ms % 1000;
  const pad = (value: number, size: number) => String(value).padStart(size, "0");
  return `${pad(hours, 2)}:${pad(minutes, 2)}:${pad(secs, 2)},${pad(milli, 3)}`;
}

export function cutsToSrt(cuts: MatchCut[]): string {
  let cursor = 0;
  const cues: string[] = [];
  let index = 1;
  for (const cut of cuts) {
    const start = cursor;
    const end = cursor + Math.max(0, cut.out - cut.in);
    cursor = end;
    const text = cut.text.trim();
    if (!text) continue;
    cues.push(`${index}\n${formatSrtTime(start)} --> ${formatSrtTime(end)}\n${text}`);
    index++;
  }
  return cues.length ? `${cues.join("\n\n")}\n` : "";
}

function writeSubtitle(project: ProjectRecord, cuts: MatchCut[], locale: string): string | undefined {
  const body = cutsToSrt(cuts);
  if (!body) return undefined;
  const rel = path.posix.join("assets/subtitles", `${locale}.srt`);
  const abs = path.join(project.root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, body);
  return rel;
}

function writeReport(project: ProjectRecord, report: MatchReport): string {
  const rel = reportRel();
  const abs = path.join(project.root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, `${JSON.stringify(report, null, 2)}\n`);
  return rel;
}

export function runMatch(options: MatchOptions, deps: MatchDeps = {}): MatchResult {
  const root = options.root ?? weaverRoot();
  const project = loadProject(options.projectId, root);
  if (filmTask(project.film) !== "footage-narration") {
    throw new Error("match 只用于 footage-narration");
  }
  const edited = ensureRef(options.edited);
  const sourceRefs = parseSourceList(options.sources, project, edited).map(ensureRef);
  if (!sourceRefs.length) throw new Error("至少一条原片 asset:video.*（不能与已剪片相同）");
  const editedVideo = requireVideoRef(project, edited, root, "已剪片");
  for (const ref of sourceRefs) requireVideoRef(project, ref, root, "原片");

  const visual = options.visual !== false;
  const audioCheck = deps.hasAudio ?? hasAudioStream;
  const editedHasAudio = audioCheck(editedVideo.resolved.absPath);
  if (!editedHasAudio && !visual) {
    throw new Error("已剪片没有音轨，需要视觉对齐（不要加 --no-visual）");
  }

  const sceneOf = deps.scenes ?? detectScenes;
  const durationOf = deps.duration ?? probeDuration;
  const editedScene = sceneOf(editedVideo.resolved.absPath);
  const sourceScenes = new Map<string, SceneIndex>();
  const sourceDurations = new Map<string, number>();
  const sourceFiles = new Map<string, string>();
  for (const ref of sourceRefs) {
    const file = requireVideoRef(project, ref, root, "原片").resolved.absPath;
    sourceScenes.set(ref, sceneOf(file));
    sourceDurations.set(ref, durationOf(file));
    sourceFiles.set(ref, file);
  }

  let hashes: { edited: FrameHash[]; sources: Map<string, FrameHash[]> } | undefined;
  const warnings: string[] = [];
  if (visual) {
    try {
      hashes = loadHashes(
        project,
        editedVideo.asset.id,
        editedVideo.resolved.absPath,
        sourceFiles,
        deps.hashes,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!editedHasAudio) throw new Error(`视觉对齐失败：${message}`);
      warnings.push(`视觉对齐失败，改走文本：${message}`);
    }
  }

  let cuts: MatchCut[] = [];
  let items: MatchItem[] = [];
  if (editedHasAudio) {
    const editedTranscript = loadOrTranscribe(project, edited, root, deps.transcribe);
    const sourceTranscripts = sourceRefs.map((ref) => ({
      ref,
      transcript: loadOrTranscribe(project, ref, root, deps.transcribe),
    }));
    const aligned = cutsFromTextAlign(editedTranscript, sourceTranscripts);
    items = aligned.items;
    warnings.push(...aligned.warnings);
    cuts = aligned.cuts;
    if (hashes) {
      const reranked = rerankCuts(items, hashes.edited, hashes.sources);
      items = reranked.items;
      cuts = reranked.cuts;
    }
  } else if (hashes) {
    cuts = cutsFromVisualScenes(editedScene, hashes.edited, hashes.sources);
  }
  if (hashes && cuts.length) {
    const duration = editedScene.duration || durationOf(editedVideo.resolved.absPath);
    cuts = fillSilentGaps(cuts, duration, hashes.edited, hashes.sources);
  }
  cuts = finalizeCuts(cuts, editedScene, sourceScenes, sourceDurations);
  if (!cuts.length) throw new Error("未能生成任何剪辑点，检查转写或匹配阈值");

  const locale = matchLocale(project);
  writeScenes(project, cuts, locale);
  const report = writeReport(project, {
    edited,
    sources: sourceRefs,
    visual,
    warnings,
    items,
    cuts,
  });
  const subtitle = writeSubtitle(project, cuts, locale);
  return { projectId: project.id, cuts, report, subtitle, visual };
}
