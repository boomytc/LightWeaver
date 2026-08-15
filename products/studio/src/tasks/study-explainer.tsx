import { projectMedia } from "../api";
import type { ProjectDetail, SceneDef } from "../types";

export function stillPreviewSrc(detail: ProjectDetail, scene: SceneDef | undefined, locale: string): string | undefined {
  if (!detail || !scene?.still) return undefined;
  const id = scene.still.replace(/^asset:/, "");
  const asset = detail.assets.find((item) => item.id === id);
  const file = asset?.files?.[locale] ?? asset?.file;
  return file ? projectMedia(detail.id, file) : undefined;
}

export function outputPreview(
  detail: ProjectDetail,
  locale: string,
): { src: string; path: string } | undefined {
  const out = detail.paths.outputFiles[locale];
  if (!out?.exists || !out.rel) return undefined;
  return { src: projectMedia(detail.id, out.rel), path: out.path };
}

export function missingStillSceneIds(detail: ProjectDetail, locale: string): string[] {
  return detail.paths.stillFiles
    .filter((file) => file.locale === locale && file.exists !== true)
    .map((file) => file.sceneId);
}
