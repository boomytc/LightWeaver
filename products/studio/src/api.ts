import type { Asset, FilmDoc, Job, ProjectDetail, ProjectSummary } from "./types";

async function parse<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((data as { error?: string }).error || `HTTP ${response.status}`);
  }
  return data as T;
}

export const api = {
  projects: () => fetch("/api/projects").then((res) => parse<ProjectSummary[]>(res)),
  project: (id: string) => fetch(`/api/projects/${encodeURIComponent(id)}`).then((res) => parse<ProjectDetail>(res)),
  createProject: (id: string, title: string) =>
    fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, title }),
    }).then((res) => parse<ProjectDetail>(res)),
  saveFilm: (id: string, film: FilmDoc) =>
    fetch(`/api/projects/${encodeURIComponent(id)}/film`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(film),
    }).then((res) => parse<{ film: FilmDoc; issues: ProjectDetail["issues"] }>(res)),
  library: () => fetch("/api/library").then((res) => parse<Asset[]>(res)),
  validate: (id: string) =>
    fetch(`/api/projects/${encodeURIComponent(id)}/validate`, { method: "POST" }).then((res) =>
      parse<{ issues: ProjectDetail["issues"] }>(res),
    ),
  startJob: (type: Job["type"], projectId: string, locale?: string) =>
    fetch("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, projectId, locale }),
    }).then((res) => parse<Job>(res)),
  job: (id: string) => fetch(`/api/jobs/${encodeURIComponent(id)}`).then((res) => parse<Job>(res)),
  uploadLibrary: (form: FormData) =>
    fetch("/api/library/assets", { method: "POST", body: form }).then((res) => parse<Asset>(res)),
  uploadProject: (id: string, form: FormData) =>
    fetch(`/api/projects/${encodeURIComponent(id)}/assets`, { method: "POST", body: form }).then((res) =>
      parse<Asset>(res),
    ),
};

export function libraryMedia(file: string): string {
  return `/api/media/library/${file}`;
}

export function projectMedia(projectId: string, file: string): string {
  return `/api/media/project/${encodeURIComponent(projectId)}/${file}`;
}
