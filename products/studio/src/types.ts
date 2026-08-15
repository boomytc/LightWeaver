export type Issue = { level: "error" | "warning"; path: string; message: string };

export type ProjectSummary = {
  id: string;
  source: "first-party" | "user";
  root: string;
  brand: string;
  task?: string;
  studySlug?: string;
  locales: string[];
  scenes: number;
  assets: number;
  titles: Record<string, string>;
};

export type CardCopy = {
  kicker?: string;
  headline?: string;
  lede?: string;
  tags?: string[];
  points?: string[];
};

export type SceneDef = {
  id: string;
  kind: string;
  still?: string;
  fit?: "cover" | "contain";
  role?: "problem" | "rule" | "contrast";
  lines: Record<string, string>;
};

export type FilmDoc = {
  id: string;
  task?: string;
  brand: string;
  study?: { slug: string };
  publish?: { dir: string };
  capture?: { kind: string; slug?: string };
  voices: Record<string, string>;
  locales: Record<
    string,
    { title: string; output: string; titleCard: CardCopy; closeCard: Pick<CardCopy, "headline" | "lede" | "points"> }
  >;
  scenes: SceneDef[];
};

export type Asset = {
  id: string;
  kind: string;
  locale?: string;
  file?: string;
  files?: Record<string, string>;
  text?: string;
  style?: string;
  scene?: string;
  label?: string;
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

export type ProjectPaths = {
  projectRoot: string;
  film: string;
  assetsDoc: string;
  stillFiles: MediaFile[];
  lineFiles: MediaFile[];
  outputFiles: Record<string, MediaPath>;
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

export type Job = {
  id: string;
  type: "tts" | "render";
  projectId: string;
  locale?: string;
  status: "running" | "ok" | "error";
  log: string;
  error?: string;
};
