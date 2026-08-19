import { ensureStillStub } from "./assets.ts";
import { saveFilm } from "./project.ts";
import {
  parseAssetRef,
  type CardCopy,
  type FilmDoc,
  type Locale,
  type LocaleCopy,
  type ProjectRecord,
  type SceneDef,
} from "./schema.ts";
import { getTask } from "./tasks/registry.ts";
import { filmTask } from "./schema.ts";
import type { TaskModule } from "./tasks/types.ts";

export type ScenePatch = {
  lines?: Record<string, string>;
  still?: string;
  fit?: "cover" | "contain";
  role?: string;
};

function filmOf(project: ProjectRecord): FilmDoc {
  return project.film;
}

function requireTask(project: ProjectRecord): TaskModule {
  return getTask(filmTask(project.film));
}

function requireScene(project: ProjectRecord, sceneId: string): { scene: SceneDef; index: number } {
  const index = project.film.scenes.findIndex((scene) => scene.id === sceneId);
  if (index < 0) throw new Error(`找不到场景 ${sceneId}`);
  return { scene: project.film.scenes[index]!, index };
}

export function addScene(
  project: ProjectRecord,
  input: { id: string; kind: string; still?: string; fit?: "cover" | "contain"; role?: string; after?: string },
): ProjectRecord {
  const task = requireTask(project);
  const { frame } = task;
  if (!frame.expandableKinds.includes(input.kind)) {
    throw new Error(
      `只能追加 ${frame.expandableKinds.join(" / ")} 场（${frame.pinnedKinds.join(" / ")} 由种子创建）`,
    );
  }
  if (!task.sceneKinds.includes(input.kind)) throw new Error(`任务不允许 kind：${input.kind}`);
  if (project.film.scenes.some((scene) => scene.id === input.id)) {
    throw new Error(`场景已存在：${input.id}`);
  }
  const scene: SceneDef = {
    id: input.id,
    kind: input.kind,
    still: input.still,
    fit: input.fit,
    role: input.role,
    lines: Object.fromEntries(Object.keys(project.film.locales).map((locale) => [locale, input.id])),
  };
  const next = [...project.film.scenes];
  const insertAt = frame.insertBeforeKind ? next.findIndex((item) => item.kind === frame.insertBeforeKind) : -1;
  let at = insertAt >= 0 ? insertAt : next.length;
  if (input.after) {
    const after = next.findIndex((item) => item.id === input.after);
    if (after < 0) throw new Error(`找不到 --after ${input.after}`);
    at = after + 1;
  }
  next.splice(at, 0, scene);
  if (input.still) ensureStillStub(project, input.still);
  saveFilm(project, { ...filmOf(project), scenes: next });
  return project;
}

export function removeScene(project: ProjectRecord, sceneId: string): ProjectRecord {
  const task = requireTask(project);
  const { scene } = requireScene(project, sceneId);
  if (task.frame.pinnedKinds.includes(scene.kind)) {
    throw new Error(`不能删除 ${scene.kind}`);
  }
  const expandableCount = project.film.scenes.filter((item) => task.frame.expandableKinds.includes(item.kind)).length;
  const min = task.frame.minExpandable ?? 0;
  if (task.frame.expandableKinds.includes(scene.kind) && expandableCount <= min) {
    throw new Error(`不能删光最后一场 ${scene.kind}`);
  }
  saveFilm(project, {
    ...filmOf(project),
    scenes: project.film.scenes.filter((item) => item.id !== sceneId),
  });
  return project;
}

export function moveScene(
  project: ProjectRecord,
  sceneId: string,
  where: { after?: string; before?: string; index?: number },
): ProjectRecord {
  const task = requireTask(project);
  const { scene, index } = requireScene(project, sceneId);
  if (task.frame.pinnedKinds.includes(scene.kind)) {
    throw new Error(`${scene.kind} 位置钉住，不能移动`);
  }
  const next = [...project.film.scenes];
  next.splice(index, 1);
  let at = next.length;
  if (where.after) {
    const after = next.findIndex((item) => item.id === where.after);
    if (after < 0) throw new Error(`找不到 --after ${where.after}`);
    at = after + 1;
  } else if (where.before) {
    const before = next.findIndex((item) => item.id === where.before);
    if (before < 0) throw new Error(`找不到 --before ${where.before}`);
    at = before;
  } else if (typeof where.index === "number") {
    at = where.index;
  }
  next.splice(at, 0, scene);
  const { firstKind, lastKind } = task.frame;
  if ((firstKind && next[0]?.kind !== firstKind) || (lastKind && next.at(-1)?.kind !== lastKind)) {
    const head = firstKind ? `${firstKind} 必须在首` : "";
    const tail = lastKind ? `${lastKind} 必须在末` : "";
    throw new Error(`调序后 ${[head, tail].filter(Boolean).join("、")}`);
  }
  saveFilm(project, { ...filmOf(project), scenes: next });
  return project;
}

export function patchScene(project: ProjectRecord, sceneId: string, patch: ScenePatch): ProjectRecord {
  const { scene, index } = requireScene(project, sceneId);
  if (patch.lines && (typeof patch.lines !== "object" || Array.isArray(patch.lines))) {
    throw new Error("lines 必须是对象");
  }
  const next: SceneDef = {
    ...scene,
    still: patch.still === undefined ? scene.still : patch.still,
    fit: patch.fit === undefined ? scene.fit : patch.fit,
    role: patch.role === undefined ? scene.role : patch.role,
    lines: patch.lines ? { ...scene.lines, ...patch.lines } : scene.lines,
  };
  if (patch.still) ensureStillStub(project, patch.still);
  const scenes = [...project.film.scenes];
  scenes[index] = next;
  saveFilm(project, { ...filmOf(project), scenes });
  return project;
}

export function setCard(
  project: ProjectRecord,
  locale: string,
  which: string,
  patch: { headline?: string; lede?: string; kicker?: string; tags?: string[]; points?: string[] },
): ProjectRecord {
  const task = requireTask(project);
  const slot = task.cards?.find((item) => item.which === which);
  if (!slot) {
    const allowed = task.cards?.map((item) => item.which).join(" / ");
    throw new Error(allowed ? `卡片槽只能是 ${allowed}` : "该任务没有卡片");
  }
  const copy = project.film.locales[locale];
  if (!copy) throw new Error(`没有 locale ${locale}`);
  for (const field of slot.forbid ?? []) {
    if (patch[field as keyof typeof patch] !== undefined) {
      throw new Error(`${which} 卡不能设 ${slot.forbid?.join(" / ")}`);
    }
  }
  const current = (copy[slot.localeKey] ?? {}) as CardCopy;
  const nextCard: CardCopy = { ...current };
  if (patch.headline !== undefined) nextCard.headline = patch.headline;
  if (patch.lede !== undefined) nextCard.lede = patch.lede;
  if (patch.kicker !== undefined) nextCard.kicker = patch.kicker;
  if (patch.tags !== undefined) nextCard.tags = patch.tags;
  if (patch.points !== undefined) {
    nextCard.points = patch.points.map((item) => item.trim()).filter(Boolean);
  }
  const nextCopy: LocaleCopy = {
    ...copy,
    [slot.localeKey]: nextCard,
    ...(slot.syncTitle && patch.headline !== undefined ? { title: patch.headline } : {}),
  };
  saveFilm(project, { ...filmOf(project), locales: { ...project.film.locales, [locale]: nextCopy } });
  return project;
}

export function setVoice(project: ProjectRecord, locale: string, ref: string): ProjectRecord {
  saveFilm(project, { ...filmOf(project), voices: { ...project.film.voices, [locale]: ref } });
  return project;
}

/** 一套音色给片子里的语言。要出哪几种语言用 setLangs，不要拆成两套声。 */
export function setVoicePack(project: ProjectRecord, ref: string): ProjectRecord {
  const voices = { ...project.film.voices };
  for (const locale of Object.keys(project.film.locales)) {
    voices[locale] = ref;
  }
  saveFilm(project, { ...filmOf(project), voices });
  return project;
}

export function setLangs(project: ProjectRecord, langs: string[]): ProjectRecord {
  const available = Object.keys(project.film.locales);
  const next = [...new Set(langs.map((item) => item.trim()).filter(Boolean))] as Locale[];
  if (!next.length) throw new Error("至少选一种要出的语言");
  for (const locale of next) {
    if (!available.includes(locale)) throw new Error(`片子没有语言 ${locale}`);
  }
  saveFilm(project, { ...filmOf(project), langs: next });
  return project;
}

export function setKit(project: ProjectRecord, refs: string[]): ProjectRecord {
  const kit = [...new Set(refs.map((item) => item.trim()).filter(Boolean))];
  for (const ref of kit) {
    const parsed = parseAssetRef(ref);
    if (!parsed || parsed.scope !== "library") {
      throw new Error(`kit 必须是 library: 引用：${ref}`);
    }
  }
  saveFilm(project, { ...filmOf(project), kit });
  return project;
}
