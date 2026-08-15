export const ASSET_KINDS = ["element", "voice", "still", "reference", "line", "output"] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

export const TASK_IDS = ["study-explainer"] as const;
export type TaskId = (typeof TASK_IDS)[number];

export const STUDY_SCENE_KINDS = ["title", "still", "close"] as const;
export type StudySceneKind = (typeof STUDY_SCENE_KINDS)[number];

/** 兼容旧 import；表示 study-explainer 的 kind，不是「所有任务」 */
export const SCENE_KINDS = STUDY_SCENE_KINDS;
export type SceneKind = StudySceneKind;

export const STUDY_ROLES = ["problem", "rule", "contrast"] as const;
export type StudyRole = (typeof STUDY_ROLES)[number];

export const CAPTURE_KINDS = ["lightui-lab", "manual"] as const;
export type CaptureKind = (typeof CAPTURE_KINDS)[number];

export const PROJECT_SOURCES = ["first-party", "user"] as const;
export type ProjectSource = (typeof PROJECT_SOURCES)[number];

export type Locale = string;

export type AssetRef = string;

export type Asset = {
  id: string;
  kind: AssetKind;
  locale?: Locale;
  file?: string;
  files?: Record<Locale, string>;
  text?: string;
  style?: string;
  scene?: string;
  label?: string;
};

export type AssetDoc = {
  assets: Asset[];
};

export type CardCopy = {
  kicker?: string;
  headline?: string;
  lede?: string;
  tags?: string[];
};

export type LocaleCopy = {
  title: string;
  output: string;
  titleCard: CardCopy;
  closeCard: Pick<CardCopy, "headline" | "lede">;
};

export type SceneDef = {
  id: string;
  kind: string;
  still?: AssetRef;
  voice?: AssetRef;
  fit?: "cover" | "contain";
  role?: StudyRole;
  kicker?: string;
  headline?: string;
  lede?: string;
  tags?: string[];
  lines: Record<Locale, string>;
};

export type FilmDoc = {
  id: string;
  task?: TaskId | string;
  brand: string;
  study?: { slug: string };
  publish?: { dir: string };
  capture?: { kind: string; slug?: string };
  voices: Record<Locale, AssetRef>;
  locales: Record<Locale, LocaleCopy>;
  scenes: SceneDef[];
};

export type ProjectRecord = {
  id: string;
  source: ProjectSource;
  root: string;
  film: FilmDoc;
  assets: Asset[];
};

export type Issue = {
  level: "error" | "warning";
  path: string;
  message: string;
};

export function isAssetKind(value: string): value is AssetKind {
  return (ASSET_KINDS as readonly string[]).includes(value);
}

export function isStudyRole(value: string): value is StudyRole {
  return (STUDY_ROLES as readonly string[]).includes(value);
}

export function isImplementedTask(id: string): id is TaskId {
  return (TASK_IDS as readonly string[]).includes(id);
}

export function isSceneKind(value: string): value is SceneKind {
  return (STUDY_SCENE_KINDS as readonly string[]).includes(value);
}

export function parseAssetRef(ref: string): { scope: "asset" | "library"; id: string } | null {
  const match = /^(asset|library):([^:\s]+)$/.exec(ref.trim());
  if (!match) return null;
  return { scope: match[1] as "asset" | "library", id: match[2] };
}

export function assetRef(scope: "asset" | "library", id: string): AssetRef {
  return `${scope}:${id}`;
}

export function err(path: string, message: string): Issue {
  return { level: "error", path, message };
}

export function warn(path: string, message: string): Issue {
  return { level: "warning", path, message };
}

export function filmTask(film: FilmDoc): string {
  return film.task ?? "study-explainer";
}

export function filmStudySlug(film: FilmDoc): string | undefined {
  return film.study?.slug ?? film.capture?.slug;
}

export function normalizeFilm(film: FilmDoc): FilmDoc {
  const task = filmTask(film);
  const slug = filmStudySlug(film);
  return {
    ...film,
    task,
    study: slug ? { slug } : film.study,
  };
}
