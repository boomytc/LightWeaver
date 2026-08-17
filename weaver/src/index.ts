export * from "./schema.ts";
export * from "./paths.ts";
export * from "./config.ts";
export * from "./io.ts";
export * from "./project.ts";
export * from "./project-paths.ts";
export * from "./recipes.ts";
export * from "./library-method.ts";
export * from "./assets.ts";
export * from "./validate.ts";
export * from "./sync.ts";
export * from "./tts.ts";
export * from "./asr.ts";
export * from "./voice-mint.ts";
export * from "./render.ts";
export * from "./scenes.ts";
export * from "./capture.ts";
export {
  getTask,
  tryGetTask,
  listTasks,
  taskAllowsKind,
  LIGHTUI_LAB_ADAPTERS,
} from "./tasks/registry.ts";
export type { TaskModule } from "./tasks/types.ts";
