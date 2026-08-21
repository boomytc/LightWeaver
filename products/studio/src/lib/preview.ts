import { projectMedia } from "../api";
import type { ProjectDetail } from "../types";

export function outputPreview(
  detail: ProjectDetail,
  locale: string,
): { src: string; path: string } | undefined {
  const out = detail.paths.outputFiles[locale];
  if (!out?.exists || !out.rel) return undefined;
  return { src: projectMedia(detail.id, out.rel), path: out.rel };
}
