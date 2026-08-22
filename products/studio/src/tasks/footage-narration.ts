import { projectMedia } from "../api";
import type { ProjectDetail, SceneDef } from "../types";

export function sourcePreviewSrc(detail: ProjectDetail): string | undefined {
  const file = detail.paths.sourceFiles.find((item) => item.exists && item.rel);
  return file?.rel ? projectMedia(detail.id, file.rel) : undefined;
}

export function missingSourceRefs(detail: ProjectDetail): string[] {
  return detail.paths.sourceFiles.filter((file) => file.exists !== true).map((file) => file.ref);
}

export function ostLabel(ost: string | undefined): string {
  if (ost === "original") return "原声";
  if (ost === "mix") return "混合";
  if (ost === "narration") return "解说";
  return ost ?? "";
}

export function sceneLinePreview(scene: SceneDef, locale: string): string {
  if (scene.ost === "original") return "原声";
  return (scene.lines[locale] ?? "").slice(0, 72);
}

export function clipTime(scene: SceneDef): string {
  if (typeof scene.in !== "number" || typeof scene.out !== "number") return "";
  return `${scene.in.toFixed(1)}s–${scene.out.toFixed(1)}s`;
}

export type MatchCutView = {
  sceneId: string;
  score: number;
  matchMethod: string;
  text?: string;
};

export type MatchReportView = {
  warnings?: string[];
  cuts?: MatchCutView[];
  items?: { sentenceText: string; selected?: unknown }[];
};

export function matchMethodLabel(method: string): string {
  if (method === "silent_gap") return "静音缝";
  if (method === "visual") return "视觉";
  if (method === "visual_scene") return "文本+视觉";
  if (method === "text") return "文本";
  return method;
}

export function cutForScene(report: MatchReportView | undefined, sceneId: string): MatchCutView | undefined {
  return report?.cuts?.find((cut) => cut.sceneId === sceneId);
}

export function formatMatchScore(score: number | undefined): string {
  if (typeof score !== "number" || !Number.isFinite(score)) return "";
  return score.toFixed(2);
}

export function skipLabel(skip: string | undefined): string {
  if (skip === "dense-asr") return "对白已够";
  if (skip === "same-as-prev") return "同前场";
  return skip ?? "";
}

export function sequenceSpan(inPoint: number, outPoint: number): string {
  return `${inPoint.toFixed(1)}s–${outPoint.toFixed(1)}s`;
}
