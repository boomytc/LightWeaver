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
  const key = id ?? "study-explainer";
  if (!isImplementedTask(key)) return undefined;
  return TASKS[key];
}

export function getTask(id?: string): TaskModule {
  const task = tryGetTask(id);
  if (!task) {
    throw new Error(`未知任务类型：${id}。已实现：${listTasks().map((item) => item.id).join(", ")}`);
  }
  return task;
}

export function taskAllowsKind(taskId: string | undefined, kind: string): boolean {
  const task = tryGetTask(taskId);
  const kinds = task?.sceneKinds ?? ["title", "still", "close"];
  return kinds.includes(kind);
}

export { LIGHTUI_LAB_ADAPTERS } from "./study-explainer.ts";
export type { TaskModule } from "./types.ts";
