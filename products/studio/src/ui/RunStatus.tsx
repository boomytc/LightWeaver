import { runLabel } from "../domain/format";
import { isActiveRun, RESUMABLE_RUN_STATES } from "../domain/run";
import { Badge } from "./Badge";

export function RunStatus({ state, dot = false }: { state: string; dot?: boolean }) {
  const tone = isActiveRun(state)
    ? "accent"
    : state === "succeeded"
      ? "ok"
      : RESUMABLE_RUN_STATES.has(state as never)
        ? "warn"
        : "neutral";
  return <Badge tone={tone} dot={dot} pulse={isActiveRun(state)}>{runLabel(state)}</Badge>;
}
