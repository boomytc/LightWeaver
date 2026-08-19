import { isImplementedTask, type TaskId } from "../schema.ts";
import { studyExplainer } from "./study-explainer.ts";
import type { TaskModule } from "./types.ts";

const TASKS: Record<TaskId, TaskModule> = {
  "study-explainer": studyExplainer,
};

export function listTasks(): TaskModule[] {
  return Object.values(TASKS);
}

export function tryGetTask(id?: string): TaskModule | undefined {
  if (!id) return undefined;
  if (!isImplementedTask(id)) return undefined;
  return TASKS[id];
}

export function getTask(id?: string): TaskModule {
  if (!id) {
    throw new Error(`未知任务类型：${id ?? "(missing)"}。已实现：${listTasks().map((item) => item.id).join(", ")}`);
  }
  const task = tryGetTask(id);
  if (!task) {
    throw new Error(`未知任务类型：${id}。已实现：${listTasks().map((item) => item.id).join(", ")}`);
  }
  return task;
}

/** 没传 task 且只实现了一种时用那一个；多种则失败。 */
export function resolveTaskId(id?: string): string {
  const trimmed = id?.trim();
  if (trimmed) return trimmed;
  const tasks = listTasks();
  if (tasks.length === 1) return tasks[0]!.id;
  throw new Error(`缺少任务类型。已实现：${tasks.map((item) => item.id).join(", ") || "（无）"}`);
}

export function resolveTask(id?: string): TaskModule {
  return getTask(resolveTaskId(id));
}

export function taskAllowsKind(taskId: string | undefined, kind: string): boolean {
  const task = tryGetTask(taskId);
  return task?.sceneKinds.includes(kind) ?? false;
}

export { LIGHTUI_LAB_ADAPTERS } from "./study-explainer.ts";
export type { TaskModule } from "./types.ts";
