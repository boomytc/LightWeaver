export type Locale = "zh" | "en";
export type SceneKind = "title" | "still" | "close";

export type SceneDef = {
  id: string;
  kind: SceneKind;
  still?: string;
  kicker?: string;
  headline?: string;
  lede?: string;
  tags?: string[];
  fit?: "cover" | "contain";
};

export type TimedScene = SceneDef & {
  from: number;
  durationInFrames: number;
  line: string;
};

export type CardCopy = Pick<SceneDef, "kicker" | "headline" | "lede" | "tags">;

export type LocaleCopy = {
  title: string;
  output: string;
  titleCard: CardCopy;
  closeCard: Pick<SceneDef, "headline" | "lede">;
};

export type FilmSpec = {
  id: string;
  brand: string;
  publish?: { dir: string };
  capture?: { kind: string; slug: string };
  locales: Partial<Record<Locale, LocaleCopy>>;
  scenes: SceneDef[];
};

export type FilmDef = {
  filmId: string;
  locale: Locale;
  brand: string;
  title: string;
  output: string;
  stillDir: string;
  voiceDir: string;
  publishDir?: string;
  scenes: SceneDef[];
};

export type CompId = `${string}-${Locale}`;

export type NarrationFile = {
  voices: Record<string, string>;
  prompts: Record<string, { text: string; audio: string }>;
  films: Record<string, Partial<Record<Locale, { id: string; text: string }[]>>>;
};
