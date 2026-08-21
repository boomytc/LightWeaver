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
