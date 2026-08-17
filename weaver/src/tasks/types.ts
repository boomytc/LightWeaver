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

export type TaskModule = {
  id: TaskId;
  /** `library/methods/<recipePack>/`，可以和 task id 不同。 */
  recipePack: string;
  label: { zh: string; en: string };
  sceneKinds: readonly string[];
  /** 该任务 still 可用的 role。方法固定场次从这里选。 */
  roles?: readonly string[];
  createFilm: (input: CreateFilmInput, root: string) => FilmDoc;
  validate: (project: ProjectRecord, root: string) => Issue[];
};
