import type { Asset, CardCopy, FilmDoc, Issue, SceneDef } from "@lightweaver/weaver/schema";

export type { Asset, CardCopy, FilmDoc, Issue, SceneDef };

export type ProjectSummary = {
  id: string;
  source: "first-party" | "user";
  root: string;
  brand: string;
  task?: string;
  studySlug?: string;
  locales: string[];
  langs?: string[];
  scenes: number;
  assets: number;
  titles: Record<string, string>;
  voices: Record<string, string>;
  kit: string[];
  recipe?: string;
  renderable?: boolean;
  surface?: "cards" | "clips";
};

/** 项目外路径（brief.files）。不要依赖 rel。 */
export type PathEntry = { path: string; exists: boolean; rel?: string };

/** 项目内媒体。rel 必填，供 projectMedia(id, rel)。 */
export type MediaPath = { path: string; exists: boolean; rel: string };

export type MediaFile = MediaPath & {
  sceneId: string;
  locale: string;
  ref?: string;
};

export type BriefPaths =
  | { kind: "study"; root: string; files: Record<string, PathEntry> }
  | { kind: "project-brief"; files: { brief: PathEntry; briefEn: PathEntry } }
  | { kind: "hybrid"; root?: string; files: Record<string, PathEntry> };

export type SourceFile = MediaPath & { sceneId: string; ref: string };

export type ProjectPaths = {
  projectRoot: string;
  film: string;
  assetsDoc: string;
  stillFiles: MediaFile[];
  sourceFiles: SourceFile[];
  lineFiles: MediaFile[];
  outputFiles: Record<string, MediaPath>;
  matchReport?: MediaPath;
  subtitleFiles: MediaPath[];
  library: string;
  recipes: string;
  labUrl?: string;
  publishDir?: string;
  brief: BriefPaths;
};

export type ProjectDetail = ProjectSummary & {
  film: FilmDoc;
  assets: Asset[];
  issues: Issue[];
  renderable: boolean;
  paths: ProjectPaths;
};
