export const ASSET_KINDS = ["element", "voice", "still", "reference", "line", "output", "method"] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

export const METHOD_EXPANDS = ["fixed", "list"] as const;
export type MethodExpand = (typeof METHOD_EXPANDS)[number];

export function isMethodExpand(value: unknown): value is MethodExpand {
  return value === "fixed" || value === "list";
}

export type MethodScene = {
  id: string;
  kind?: string;
  role?: string;
  fit?: "cover" | "contain";
};

export const TASK_IDS = ["study-explainer"] as const;
export type TaskId = (typeof TASK_IDS)[number];

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
  texts?: Record<Locale, string>;
  style?: string;
  styles?: Record<Locale, string>;
  scene?: string;
  label?: string;
  /** 方法：固定场次或清单一项一场。其它 kind 不用。 */
  expand?: MethodExpand;
  scenes?: MethodScene[];
  task?: string;
};

export type AssetDoc = {
  assets: Asset[];
};

export function methodExpandOf(asset: Pick<Asset, "expand">): MethodExpand {
  return asset.expand === "list" ? "list" : "fixed";
}

export type CardCopy = {
  kicker?: string;
  headline?: string;
  lede?: string;
  tags?: string[];
  /** 要点板正文。lede 只留一句；对照条用 || 分成左右。 */
  points?: string[];
};

export type LocaleCopy = {
  title: string;
  output: string;
  titleCard?: CardCopy;
  closeCard?: Pick<CardCopy, "headline" | "lede" | "points">;
};

export type SceneDef = {
  id: string;
  kind: string;
  still?: AssetRef;
  voice?: AssetRef;
  fit?: "cover" | "contain";
  role?: string;
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
  /** 可选素材增强（library:element|reference）。 */
  kit?: AssetRef[];
  /** 可选方法增强。存 recipe id，或 library:method.<id>。 */
  recipe?: string;
  /** 要出的语言。省略则按 locales 里已有的键都出。 */
  langs?: Locale[];
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

export function isImplementedTask(id: string): id is TaskId {
  return (TASK_IDS as readonly string[]).includes(id);
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
  return film.task ?? "";
}

export function filmStudySlug(film: FilmDoc): string | undefined {
  return film.study?.slug ?? film.capture?.slug;
}

export function filmLangs(film: { locales: Record<string, unknown>; langs?: readonly string[] }): Locale[] {
  const all = Object.keys(film.locales);
  const picked = [...new Set((film.langs ?? []).map((item) => item.trim()).filter(Boolean))];
  if (!picked.length) return all;
  return picked.filter((locale) => all.includes(locale));
}

export function normalizeFilm(film: FilmDoc): FilmDoc {
  const slug = filmStudySlug(film);
  return {
    ...film,
    ...(film.task ? { task: film.task } : {}),
    study: slug ? { slug } : film.study,
  };
}
