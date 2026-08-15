export type SceneKind = "title" | "still" | "close";

export type CardCopy = {
  kicker?: string;
  headline?: string;
  lede?: string;
  tags?: string[];
  points?: string[];
};

export type TimedScene = {
  id: string;
  kind: SceneKind;
  from: number;
  durationInFrames: number;
  line: string;
  stillSrc?: string;
  voiceSrc?: string;
  fit?: "cover" | "contain";
  kicker?: string;
  headline?: string;
  lede?: string;
  tags?: string[];
  points?: string[];
};

export type ResolvedFilm = {
  projectId: string;
  locale: string;
  brand: string;
  title: string;
};
