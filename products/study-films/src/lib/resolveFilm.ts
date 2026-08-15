import { staticFile } from "remotion";
import type { CardCopy, SceneKind } from "./types";

export type AssetDoc = {
  assets: {
    id: string;
    kind: string;
    locale?: string;
    file?: string;
    files?: Record<string, string>;
    scene?: string;
  }[];
};

export type FilmDoc = {
  id: string;
  brand: string;
  locales: Record<
    string,
    {
      title: string;
      output: string;
      titleCard: CardCopy;
      closeCard: Pick<CardCopy, "headline" | "lede">;
    }
  >;
  scenes: {
    id: string;
    kind: SceneKind;
    still?: string;
    fit?: "cover" | "contain";
    lines: Record<string, string>;
  }[];
};

export async function fetchJson<T>(publicPath: string): Promise<T> {
  const response = await fetch(staticFile(publicPath));
  if (!response.ok) throw new Error(`load ${publicPath}: ${response.status}`);
  return (await response.json()) as T;
}

export function resolveProjectFile(
  projectId: string,
  assets: AssetDoc,
  ref: string | undefined,
  locale: string,
): string | undefined {
  if (!ref) return undefined;
  const id = ref.startsWith("asset:") ? ref.slice("asset:".length) : ref;
  const asset = assets.assets.find((item) => item.id === id);
  if (!asset) return undefined;
  const rel = asset.files?.[locale] ?? asset.file;
  if (!rel) return undefined;
  return `projects/${projectId}/${rel}`;
}

export function linePublicPath(projectId: string, sceneId: string, locale: string): string {
  return `projects/${projectId}/assets/lines/${locale}/${sceneId}.wav`;
}
