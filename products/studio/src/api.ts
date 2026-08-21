import type { Asset, ProjectDetail, ProjectSummary } from "./types";

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
  tasks: () =>
    fetch("/api/tasks").then((res) =>
      parse<{ id: string; label: { zh: string; en: string }; roles: string[]; renderer?: string; surface?: string }[]>(res),
    ),
  projects: () => fetch("/api/projects").then((res) => parse<ProjectSummary[]>(res)),
  project: (id: string) => fetch(`/api/projects/${encodeURIComponent(id)}`).then((res) => parse<ProjectDetail>(res)),
  createMethod: (body: {
    label: string;
    text: string;
    expand: "fixed" | "list";
    scenes?: { id: string; role?: string }[];
    task?: string;
  }) =>
    fetch("/api/library/methods", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then((res) => parse<Asset>(res)),
  patchLibrary: (
    id: string,
    body: {
      label?: string;
      text?: string;
      style?: string;
      locale?: string;
      texts?: Record<string, string>;
      styles?: Record<string, string>;
      expand?: "fixed" | "list";
      scenes?: { id: string; role?: string }[];
    },
  ) =>
    fetch(`/api/library/assets/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then((res) => parse<Asset>(res)),
  removeLibrary: (id: string) =>
    fetch(`/api/library/assets/${encodeURIComponent(id)}`, { method: "DELETE" }).then((res) =>
      parse<{ ok: boolean; id: string; label: string }>(res),
    ),
  library: () => fetch("/api/library").then((res) => parse<Asset[]>(res)),
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
