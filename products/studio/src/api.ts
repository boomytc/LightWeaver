import type { Asset, Job, ProjectDetail, ProjectSummary, RecipeCard } from "./types";

async function parse<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((data as { error?: string }).error || `HTTP ${response.status}`);
  }
  return data as T;
}

export type ModelbestStatus = {
  configured: boolean;
  hint?: string;
  source?: "env" | "file";
  probe?: { ok: boolean; message: string };
};

export type AsrStatus = {
  ready: boolean;
  hint?: string;
};

export type StagedVoice = {
  rel: string;
  dest: string;
  seconds: number;
  text: string;
  language: string;
  asr: boolean;
  error?: string;
};

export const api = {
  modelbest: () => fetch("/api/settings/modelbest").then((res) => parse<ModelbestStatus>(res)),
  asr: () => fetch("/api/settings/asr").then((res) => parse<AsrStatus>(res)),
  probeModelbest: () =>
    fetch("/api/settings/modelbest/probe", { method: "POST" }).then((res) =>
      parse<{ ok: boolean; message: string }>(res),
    ),
  tasks: () => fetch("/api/tasks").then((res) => parse<{ id: string; label: { zh: string; en: string } }[]>(res)),
  projects: () => fetch("/api/projects").then((res) => parse<ProjectSummary[]>(res)),
  project: (id: string) => fetch(`/api/projects/${encodeURIComponent(id)}`).then((res) => parse<ProjectDetail>(res)),
  createProject: (id: string, title: string) =>
    fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, title, task: "study-explainer" }),
    }).then((res) => parse<ProjectDetail>(res)),
  addScene: (id: string, body: { id: string; kind?: string; still?: string; fit?: string; role?: string }) =>
    fetch(`/api/projects/${encodeURIComponent(id)}/scenes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then((res) => parse<ProjectDetail>(res)),
  removeScene: (id: string, sceneId: string) =>
    fetch(`/api/projects/${encodeURIComponent(id)}/scenes/${encodeURIComponent(sceneId)}`, { method: "DELETE" }).then(
      (res) => parse<ProjectDetail>(res),
    ),
  moveScene: (id: string, sceneId: string, after?: string) =>
    fetch(`/api/projects/${encodeURIComponent(id)}/scenes/${encodeURIComponent(sceneId)}/move`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ after }),
    }).then((res) => parse<ProjectDetail>(res)),
  patchScene: (id: string, sceneId: string, body: Record<string, unknown>) =>
    fetch(`/api/projects/${encodeURIComponent(id)}/scenes/${encodeURIComponent(sceneId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then((res) => parse<ProjectDetail>(res)),
  setCard: (id: string, body: Record<string, unknown>) =>
    fetch(`/api/projects/${encodeURIComponent(id)}/cards`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then((res) => parse<ProjectDetail>(res)),
  setVoicePack: (id: string, ref: string) =>
    fetch(`/api/projects/${encodeURIComponent(id)}/voices`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ref }),
    }).then((res) => parse<ProjectDetail>(res)),
  setLangs: (id: string, langs: string[]) =>
    fetch(`/api/projects/${encodeURIComponent(id)}/langs`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ langs }),
    }).then((res) => parse<ProjectDetail>(res)),
  setKit: (id: string, refs: string[]) =>
    fetch(`/api/projects/${encodeURIComponent(id)}/kit`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refs }),
    }).then((res) => parse<ProjectDetail>(res)),
  setRecipe: (id: string, recipe: string) =>
    fetch(`/api/projects/${encodeURIComponent(id)}/recipe`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipe }),
    }).then((res) => parse<ProjectDetail>(res)),
  recipes: () => fetch("/api/recipes").then((res) => parse<RecipeCard[]>(res)),
  patchLibrary: (
    id: string,
    body: {
      label?: string;
      text?: string;
      style?: string;
      locale?: string;
      texts?: Record<string, string>;
      styles?: Record<string, string>;
    },
  ) =>
    fetch(`/api/library/assets/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then((res) => parse<Asset>(res)),
  publish: (id: string, locale?: string) =>
    fetch(`/api/projects/${encodeURIComponent(id)}/publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locale }),
    }).then((res) => parse<unknown>(res)),
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
  createVoicePack: (body: { id: string; label?: string; style?: string }) =>
    fetch("/api/voices/pack", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then((res) => parse<Asset>(res)),
  stageVoice: (form: FormData) =>
    fetch("/api/voices/stage", { method: "POST", body: form }).then((res) => parse<StagedVoice>(res)),
  asrVoice: (source: { kind: "candidate"; rel: string } | { kind: "project"; projectId: string; rel: string }) =>
    fetch("/api/voices/asr", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source }),
    }).then((res) => parse<{ text: string; language: string; seconds: number }>(res)),
  mintVoice: (body: {
    id?: string;
    text: string;
    style?: string;
    denoise?: boolean;
    doNormalize?: boolean;
    cfgValue?: number;
  }) =>
    fetch("/api/voices/mint", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then((res) =>
      parse<{ rel: string; dest: string; seconds: number; text: string; style: string }>(res),
    ),
  keepVoice: (body: {
    id?: string;
    origin?: "instruct" | "upload";
    label?: string;
    said?: string;
    style?: string;
    source: { kind: "candidate"; rel: string } | { kind: "project"; projectId: string; rel: string };
  }) =>
    fetch("/api/voices/keep", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then((res) => parse<Asset>(res)),
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

export function candidateMedia(file: string): string {
  return `/api/media/candidate/${encodeURIComponent(file)}`;
}
