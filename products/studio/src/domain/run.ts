import { z, RunRecord } from "@lightweaver/weaver/contracts";

export const RunDetail = z.object({
  run: RunRecord,
  nodes: z.array(
    z.object({
      key: z.string(),
      state: z.string(),
      attempts: z.number(),
      result: z.unknown(),
      error: z.unknown().optional(),
    }),
  ),
});

export type RunStateValue = z.infer<typeof RunRecord>["state"];

export const ACTIVE_RUN_STATES: ReadonlySet<string> = new Set<RunStateValue>([
  "queued",
  "running",
  "cancelling",
]);

export const RESUMABLE_RUN_STATES: ReadonlySet<RunStateValue> = new Set([
  "failed",
  "partial",
  "cancelled",
  "interrupted",
]);

export function isActiveRun(state: string) {
  return ACTIVE_RUN_STATES.has(state);
}
