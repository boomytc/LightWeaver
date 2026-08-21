import type { FilmDoc, Issue, ProjectRecord, ProjectSource, TaskId } from "../schema.ts";

export type { TaskId };

export type CreateFilmInput = {
  id: string;
  title?: string;
  brand?: string;
  studySlug?: string;
  source?: ProjectSource;
  output?: string;
  outputEn?: string;
};

export type TaskFrame = {
  pinnedKinds: readonly string[];
  expandableKinds: readonly string[];
  insertBeforeKind?: string;
  firstKind?: string;
  lastKind?: string;
  minExpandable?: number;
  seedPlaceholderId?: string;
};

export type TaskCardSlot = {
  which: string;
  localeKey: "titleCard" | "closeCard";
  syncTitle?: boolean;
  forbid?: readonly string[];
};

export type TaskRenderer = "remotion" | "compose";
export type TaskSurface = "cards" | "clips";

export type TaskModule = {
  id: string;
  /** `library/methods/<recipePack>/`，可以和 task id 不同。 */
  recipePack: string;
  /** 出片作业。sync / render 按这个分流，不要按 task id 写死。 */
  renderer: TaskRenderer;
  /** 复盘面：静帧卡片或时间轴 clip。 */
  surface: TaskSurface;
  label: { zh: string; en: string };
  sceneKinds: readonly string[];
  /** 该任务 still 可用的 role。方法固定场次从这里选。 */
  roles?: readonly string[];
  frame: TaskFrame;
  cards?: readonly TaskCardSlot[];
  createFilm: (input: CreateFilmInput, root: string) => FilmDoc;
  validate: (project: ProjectRecord, root: string) => Issue[];
  isReadyToRender?: (project: ProjectRecord, root: string) => boolean;
  isComplete?: (project: ProjectRecord, root: string) => boolean;
};
