import fs from "node:fs";
import path from "node:path";
import { ensureStillStub, loadLibrary } from "./assets.ts";
import { libraryRoot, weaverRoot } from "./paths.ts";
import { saveFilm } from "./project.ts";
import {
  filmTask,
  methodExpandOf,
  type Asset,
  type MethodExpand,
  type MethodScene,
  type ProjectRecord,
  type SceneDef,
} from "./schema.ts";
import { getTask, tryGetTask } from "./tasks/registry.ts";
import { methodNameOf, recipeIdOf } from "./method.ts";

export { recipeIdOf };

const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type Recipe = {
  id: string;
  task: string;
  title: string;
  when: string;
  expand: MethodExpand;
  scenes?: MethodScene[];
  path?: string;
  body?: string;
};

export type RecipeSummary = Omit<Recipe, "body">;

export function recipePackName(task: string): string | undefined {
  return tryGetTask(task)?.recipePack;
}

export function methodAssetId(recipeId: string): string {
  const id = recipeIdOf(recipeId);
  return id ? `method.${id}` : "";
}

function catalogFilmMethod(ref: string, root: string): Asset | undefined {
  const wanted = recipeIdOf(ref);
  if (!wanted) return undefined;
  return loadLibrary(root).find((item) => item.kind === "method" && recipeIdOf(item.id) === wanted);
}

function recipeFromAsset(asset: Asset, root: string): Recipe {
  const id = recipeIdOf(asset.id);
  const rel = asset.file;
  const abs = rel ? path.join(libraryRoot(root), rel) : undefined;
  const hasFile = Boolean(abs && fs.existsSync(abs));
  return {
    id,
    task: asset.task ?? "",
    title: methodNameOf(asset),
    when: (asset.text ?? "").trim(),
    expand: methodExpandOf(asset),
    ...(asset.scenes ? { scenes: asset.scenes } : {}),
    ...(hasFile ? { path: abs, body: fs.readFileSync(abs!, "utf8") } : {}),
  };
}

/** list / show / apply 都只认 catalog。投影只是短文，不是规格。 */
export function formatRecipe(recipe: Recipe): string {
  const expand = recipe.expand === "list" ? "清单一项一场" : "固定场次";
  const scenes = (recipe.scenes ?? []).map((scene) =>
    scene.role ? `- ${scene.id}（${scene.role}）` : `- ${scene.id}`,
  );
  const lines = [recipe.title, recipe.when, `铺场：${expand}`, ...scenes];
  if (recipe.path) lines.push(`投影：${recipe.path}`);
  return lines.filter(Boolean).join("\n");
}

export function listRecipes(root = weaverRoot(), task?: string): Recipe[] {
  const wanted = task?.trim();
  const found = loadLibrary(root)
    .filter((item) => item.kind === "method")
    .filter((item) => (wanted ? item.task === wanted : true))
    .map((item) => recipeFromAsset(item, root));
  found.sort((a, b) => a.task.localeCompare(b.task) || a.id.localeCompare(b.id));
  return found;
}

export function loadRecipe(id: string, root = weaverRoot()): Recipe {
  const wanted = recipeIdOf(id);
  if (!ID_RE.test(wanted)) throw new Error(`非法 recipe id：${id}`);
  const catalog = catalogFilmMethod(wanted, root);
  if (!catalog) throw new Error(`找不到方法：${wanted}`);
  return recipeFromAsset(catalog, root);
}

export function showRecipe(id: string, root = weaverRoot()): Recipe {
  return loadRecipe(id, root);
}

export function summarizeRecipe(recipe: Recipe): RecipeSummary {
  const { body: _body, ...rest } = recipe;
  return rest;
}

export type ApplyRecipeOptions = {
  kinds?: string[];
  items?: string[];
};

function applyItems(options: ApplyRecipeOptions): string[] {
  const named = (options.items ?? []).map((item) => item.trim()).filter(Boolean);
  const raw = named.length ? named : (options.kinds ?? []);
  return [...new Set(raw.map((item) => item.trim()).filter(Boolean))];
}

type PlannedScene = {
  id: string;
  kind: string;
  still?: string;
  fit?: "cover" | "contain";
  role?: string;
};

function planListStills(items: string[], label: string, kind: string): PlannedScene[] {
  if (items.length === 0) throw new Error(`${label} 需要 --items（清单一项一场）`);
  return items.map((id) => ({
    id,
    kind,
    still: `asset:still.${id}`,
    fit: "contain",
  }));
}

function planFixedStills(
  scenes: MethodScene[],
  label: string,
  expandKind: string,
  allowRole: (role: string) => boolean,
): PlannedScene[] {
  if (scenes.length === 0) throw new Error(`${label} 固定场次至少写一场`);
  return scenes.map((row) => {
    let role: string | undefined;
    if (row.role) {
      if (!allowRole(row.role)) throw new Error(`未知 role：${row.role}`);
      role = row.role;
    }
    return {
      id: row.id,
      kind: row.kind ?? expandKind,
      still: `asset:still.${row.id}`,
      fit: row.fit ?? "contain",
      role,
    };
  });
}

function roleAllowed(task: ReturnType<typeof getTask>, role: string): boolean {
  if (task.roles?.length) return task.roles.includes(role);
  return true;
}

function sceneFromPlan(item: PlannedScene, locales: string[]): SceneDef {
  return {
    id: item.id,
    kind: item.kind,
    still: item.still,
    fit: item.fit,
    role: item.role,
    lines: Object.fromEntries(locales.map((locale) => [locale, item.id])),
  };
}

export function applyRecipe(
  project: ProjectRecord,
  recipeId: string,
  options: ApplyRecipeOptions = {},
  root = weaverRoot(),
): { project: ProjectRecord; skipped: string[] } {
  const task = getTask(filmTask(project.film));
  const expandKind = task.frame.expandableKinds[0] ?? "";
  const items = applyItems(options);
  const catalog = catalogFilmMethod(recipeId, root);
  if (!catalog) throw new Error(`找不到方法：${recipeIdOf(recipeId) || recipeId}`);
  if (catalog.task && catalog.task !== task.id) {
    throw new Error(`方法 ${methodNameOf(catalog)} 属于任务 ${catalog.task}，与片子任务 ${task.id} 不一致`);
  }
  const appliedId = recipeIdOf(recipeId);
  const planned =
    methodExpandOf(catalog) === "list"
      ? planListStills(items, methodNameOf(catalog), expandKind)
      : planFixedStills(catalog.scenes ?? [], methodNameOf(catalog), expandKind, (role) => roleAllowed(task, role));

  for (const item of planned) {
    if (!task.sceneKinds.includes(item.kind)) {
      throw new Error(`未知场景 kind：${item.kind}（只允许 ${task.sceneKinds.join(" / ")}）`);
    }
    if (!task.frame.expandableKinds.includes(item.kind)) {
      throw new Error(
        `recipe apply 只展开 ${task.frame.expandableKinds.join(" / ")} 场（${task.frame.pinnedKinds.join(" / ")} 由种子创建）`,
      );
    }
  }

  const { frame } = task;
  const locales = Object.keys(project.film.locales);
  const current = project.film.scenes;
  const expandable = current.filter((scene) => frame.expandableKinds.includes(scene.kind));
  const skipped: string[] = [];
  const nextExpandable: SceneDef[] = [...expandable];
  for (const item of planned) {
    if (nextExpandable.some((scene) => scene.id === item.id)) {
      skipped.push(item.id);
      continue;
    }
    nextExpandable.push(sceneFromPlan(item, locales));
  }
  const placeholderId = frame.seedPlaceholderId;
  const min = frame.minExpandable ?? 1;
  const withoutPlaceholder =
    placeholderId && nextExpandable.some((scene) => scene.id === placeholderId) && nextExpandable.length > min
      ? nextExpandable.filter((scene) => scene.id !== placeholderId)
      : nextExpandable;

  const first = frame.firstKind ? current.filter((scene) => scene.kind === frame.firstKind) : [];
  const last = frame.lastKind ? current.filter((scene) => scene.kind === frame.lastKind) : [];
  const otherPinned = current.filter(
    (scene) =>
      frame.pinnedKinds.includes(scene.kind) && scene.kind !== frame.firstKind && scene.kind !== frame.lastKind,
  );
  const scenes = [...first, ...otherPinned, ...withoutPlaceholder, ...last];

  saveFilm(project, { ...project.film, scenes, recipe: appliedId });
  for (const scene of scenes) {
    if (scene.still) ensureStillStub(project, scene.still);
  }
  return { project, skipped };
}

export function assertFilmMethod(ref: string, root = weaverRoot()): void {
  const id = recipeIdOf(ref);
  if (!id) throw new Error("缺少方法");
  if (!catalogFilmMethod(id, root)) throw new Error(`找不到方法：${id}`);
}

export function setFilmRecipe(project: ProjectRecord, recipeId: string, root = weaverRoot()): ProjectRecord {
  const id = recipeIdOf(recipeId);
  if (id) assertFilmMethod(id, root);
  saveFilm(project, { ...project.film, recipe: id || undefined });
  return project;
}
