import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type JobType = "tts" | "render";
export type JobStatus = "running" | "ok" | "error";

export type Job = {
  id: string;
  type: JobType;
  projectId: string;
  locale?: string;
  status: JobStatus;
  log: string;
  error?: string;
  startedAt: number;
  finishedAt?: number;
};

const jobs = new Map<string, Job>();
const here = path.dirname(fileURLToPath(import.meta.url));
const weaverBin = path.resolve(here, "../../../weaver/bin/weaver.mjs");

export function listJobs(): Job[] {
  return [...jobs.values()].sort((a, b) => b.startedAt - a.startedAt);
}

export function getJob(id: string): Job | undefined {
  return jobs.get(id);
}

export function startJob(type: JobType, projectId: string, locale?: string): Job {
  const id = `${type}-${projectId}-${Date.now()}`;
  const job: Job = { id, type, projectId, locale, status: "running", log: "", startedAt: Date.now() };
  jobs.set(id, job);
  const args = [type, "--project", projectId, "--json"];
  if (locale) args.push("--locale", locale);
  const child = spawn(process.execPath, [weaverBin, ...args], { stdio: ["ignore", "pipe", "pipe"] });
  const append = (chunk: Buffer) => {
    job.log += chunk.toString("utf8");
    if (job.log.length > 80_000) job.log = job.log.slice(-60_000);
  };
  child.stdout.on("data", append);
  child.stderr.on("data", append);
  child.on("exit", (code) => {
    job.finishedAt = Date.now();
    if (code === 0) job.status = "ok";
    else {
      job.status = "error";
      job.error = `退出码 ${code}`;
    }
  });
  return job;
}
