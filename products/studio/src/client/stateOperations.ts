import type { LayoutPreference, ThemePreference } from "../desktop";

export type ClientDraft = {
  projectId: string;
  base: string;
  document?: unknown;
  creativePlanDraft?: unknown;
  updatedAt: string;
};

export type ClientBody = {
  theme: ThemePreference;
  recentProjectIds: string[];
  layout: LayoutPreference;
  drafts: ClientDraft[];
};

export type ClientOperation =
  | { kind: "theme"; value: ThemePreference }
  | { kind: "layout"; value: LayoutPreference }
  | { kind: "remember-project"; projectId: string }
  | { kind: "upsert-draft"; draft: ClientDraft }
  | { kind: "clear-draft"; projectId: string; throughUpdatedAt?: string };

export function compareUpdatedAt(left: string, right: string) {
  const leftTime = Date.parse(left);
  const rightTime = Date.parse(right);
  if (Number.isFinite(leftTime) && Number.isFinite(rightTime)) return leftTime - rightTime;
  return left.localeCompare(right);
}

function applyOperation(body: ClientBody, operation: ClientOperation): ClientBody {
  if (operation.kind === "theme") return { ...body, theme: operation.value };
  if (operation.kind === "layout") return { ...body, layout: operation.value };
  if (operation.kind === "remember-project") {
    return {
      ...body,
      recentProjectIds: [
        operation.projectId,
        ...body.recentProjectIds.filter((id) => id !== operation.projectId),
      ].slice(0, 12),
    };
  }
  if (operation.kind === "upsert-draft") {
    const existing = body.drafts.find((item) => item.projectId === operation.draft.projectId);
    if (existing && compareUpdatedAt(existing.updatedAt, operation.draft.updatedAt) > 0) return body;
    return {
      ...body,
      drafts: [
        operation.draft,
        ...body.drafts.filter((item) => item.projectId !== operation.draft.projectId),
      ],
    };
  }
  return {
    ...body,
    drafts: body.drafts.filter(
      (item) =>
        item.projectId !== operation.projectId ||
        (operation.throughUpdatedAt !== undefined &&
          compareUpdatedAt(item.updatedAt, operation.throughUpdatedAt) > 0),
    ),
  };
}

export function applyClientOperations(body: ClientBody, operations: ClientOperation[]) {
  return operations.reduce(applyOperation, body);
}

export function mergeClientDrafts(server: ClientDraft[], native: ClientDraft[]) {
  const byProject = new Map<string, ClientDraft>();
  for (const draft of [...server, ...native]) {
    const existing = byProject.get(draft.projectId);
    if (!existing || compareUpdatedAt(draft.updatedAt, existing.updatedAt) >= 0)
      byProject.set(draft.projectId, draft);
  }
  return [...byProject.values()].sort((left, right) =>
    compareUpdatedAt(right.updatedAt, left.updatedAt),
  );
}
