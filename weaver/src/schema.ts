export const ASSET_KINDS = ["element", "voice", "still", "reference", "line", "output"] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

export const SCENE_KINDS = ["title", "still", "close"] as const;
export type SceneKind = (typeof SCENE_KINDS)[number];

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
  kind: SceneKind;
  still?: AssetRef;
  voice?: AssetRef;
  fit?: "cover" | "contain";
  kicker?: string;
  headline?: string;
  lede?: string;
  tags?: string[];
  lines: Record<Locale, string>;
};

export type FilmDoc = {
  id: string;
  brand: string;
  publish?: { dir: string };
  capture?: { kind: string; slug: string };
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

export function isSceneKind(value: string): value is SceneKind {
  return (SCENE_KINDS as readonly string[]).includes(value);
}

export function parseAssetRef(ref: string): { scope: "asset" | "library"; id: string } | null {
  const match = /^(asset|library):([^:\s]+)$/.exec(ref.trim());
  if (!match) return null;
  return { scope: match[1] as "asset" | "library", id: match[2] };
}

export function assetRef(scope: "asset" | "library", id: string): AssetRef {
  return `${scope}:${id}`;
}
