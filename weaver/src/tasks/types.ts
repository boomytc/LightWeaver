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
  label: { zh: string; en: string };
  sceneKinds: readonly string[];
  createFilm: (input: CreateFilmInput, root: string) => FilmDoc;
  validate: (project: ProjectRecord, root: string) => Issue[];
};
