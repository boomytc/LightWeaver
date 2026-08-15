export type Issue = { level: "error" | "warning"; path: string; message: string };

export type ProjectSummary = {
  id: string;
  source: "first-party" | "user";
  root: string;
  brand: string;
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
};

export type SceneDef = {
  id: string;
  kind: "title" | "still" | "close";
  still?: string;
  fit?: "cover" | "contain";
  lines: Record<string, string>;
};

export type FilmDoc = {
  id: string;
  brand: string;
  publish?: { dir: string };
  capture?: { kind: string; slug: string };
  voices: Record<string, string>;
  locales: Record<
    string,
    { title: string; output: string; titleCard: CardCopy; closeCard: Pick<CardCopy, "headline" | "lede"> }
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

export type ProjectDetail = ProjectSummary & {
  film: FilmDoc;
  assets: Asset[];
  issues: Issue[];
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
