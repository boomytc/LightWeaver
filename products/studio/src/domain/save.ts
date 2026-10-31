export type SaveFate = "ignore" | "accept" | "keep-local";

export function saveFate(input: {
  requestProjectId: string;
  currentProjectId: string;
  requestGeneration: number;
  currentGeneration: number;
  requestDraftSeq: number;
  currentDraftSeq: number;
}): SaveFate {
  if (
    input.requestProjectId !== input.currentProjectId ||
    input.requestGeneration !== input.currentGeneration
  )
    return "ignore";
  return input.requestDraftSeq === input.currentDraftSeq ? "accept" : "keep-local";
}
