import fs from "node:fs";
import path from "node:path";
import { findAsset, resolveAssetFile } from "./assets.ts";
import { hasAudioStream } from "./probe.ts";
import { loadProject, saveFilm } from "./project.ts";
import { weaverRoot } from "./paths.ts";
import { filmLangs, filmTask, type ProjectRecord, type SceneDef } from "./schema.ts";
import { alignEditedToSources, pickCandidate, type Candidate } from "./match-align.ts";
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
    });
  }
  return { cuts, items, warnings };
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

  const visual = Boolean(options.visual);
  const audioCheck = deps.hasAudio ?? hasAudioStream;
  const editedHasAudio = audioCheck(editedVideo.resolved.absPath);
  if (!editedHasAudio) {
    throw new Error("已剪片没有音轨，需要视觉对齐");
  }

  const editedTranscript = loadOrTranscribe(project, edited, root, deps.transcribe);
  const sourceTranscripts = sourceRefs.map((ref) => ({
    ref,
    transcript: loadOrTranscribe(project, ref, root, deps.transcribe),
  }));
  const { cuts, items, warnings } = cutsFromTextAlign(editedTranscript, sourceTranscripts);
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
  return { projectId: project.id, cuts, report, visual };
}
