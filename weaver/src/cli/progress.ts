import type { Application } from "../app/index.ts";
import { EventRecord, RunRecord, z } from "../contracts/index.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

const SAFE_EVENT_FIELDS: readonly string[] = [
  "key",
  "modelId",
  "engineId",
  "phase",
  "message",
  "file",
  "fileIndex",
  "completedFiles",
  "totalFiles",
  "received",
  "total",
  "state",
  "reused",
  "provider",
  "count",
  "target",
  "locale",
  "profile",
  "frames",
  "deliveryId",
  "startUs",
  "durationUs",
  "segments",
  "speakerLabels",
];

function safeValue(value: unknown): string | undefined {
  if (typeof value === "string") return value.slice(0, 180);
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  return undefined;
}

export function formatProgressEvent(
  event: z.infer<typeof EventRecord>,
): string {
  const data = event.data,
    fields = isRecord(data)
      ? SAFE_EVENT_FIELDS.flatMap((key) => {
          const value = safeValue(data[key]);
          return value === undefined ? [] : [`${key}=${value}`];
        })
      : [];
  if (isRecord(data) && isRecord(data.error)) {
    const code = safeValue(data.error.code),
      message = safeValue(data.error.message);
    if (code) fields.push(`error=${code}`);
    if (message) fields.push(`message=${message}`);
  }
  return [`[${event.seq}]`, event.type, ...fields].join(" ");
}

function writeLine(stderr: NodeJS.WritableStream, message: string): void {
  stderr.write(`${message}\n`);
}

export type WaitForRunInput = {
  readonly app: Application;
  readonly runId: string;
  readonly progress: boolean;
  readonly stderr?: NodeJS.WritableStream;
};

export async function waitForRun({
  app,
  runId,
  progress,
  stderr = process.stderr,
}: WaitForRunInput): Promise<z.infer<typeof RunRecord>> {
  let after = 0,
    cancelRequested = false,
    timer: NodeJS.Timeout | undefined;
  const seenStates = new Set<string>();
  const emit = () => {
    if (!progress) return;
    for (const event of app.jobs.events(runId, after)) {
      after = Math.max(after, event.seq);
      writeLine(stderr, formatProgressEvent(event));
    }
    const run = app.jobs.read(runId);
    if (!seenStates.has(run.state)) {
      seenStates.add(run.state);
      writeLine(stderr, `run ${run.kind} ${run.state}`);
    }
  };
  const interrupt = () => {
    if (cancelRequested) return;
    cancelRequested = true;
    try {
      app.jobs.cancel(runId);
      if (progress) writeLine(stderr, "已请求取消作业，等待现有节点清理");
    } catch (error) {
      if (progress)
        writeLine(
          stderr,
          `取消请求未提交: ${error instanceof Error ? error.message : String(error)}`,
        );
    }
  };
  process.once("SIGINT", interrupt);
  try {
    if (progress) {
      emit();
      timer = setInterval(() => {
        try {
          emit();
        } catch {
          if (timer) clearInterval(timer);
        }
      }, 250);
      timer.unref();
    }
    return await app.jobs.wait(runId);
  } finally {
    if (timer) clearInterval(timer);
    process.off("SIGINT", interrupt);
    if (progress) emit();
  }
}
