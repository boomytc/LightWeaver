import { upsertAsset } from "./assets.ts";
import { saveFilm } from "./project.ts";
import { parseAssetRef, type FilmDoc, type ProjectRecord, type SceneDef, type StudyRole } from "./schema.ts";
import { getTask } from "./tasks/registry.ts";
import { filmTask } from "./schema.ts";

export type ScenePatch = {
  lines?: Record<string, string>;
  still?: string;
  fit?: "cover" | "contain";
  role?: StudyRole;
};

function filmOf(project: ProjectRecord): FilmDoc {
  return project.film;
}

function requireScene(project: ProjectRecord, sceneId: string): { scene: SceneDef; index: number } {
  const index = project.film.scenes.findIndex((scene) => scene.id === sceneId);
  if (index < 0) throw new Error(`找不到场景 ${sceneId}`);
  return { scene: project.film.scenes[index]!, index };
}

function ensureStillStub(project: ProjectRecord, stillRef: string): void {
  const parsed = parseAssetRef(stillRef);
  if (!parsed || parsed.scope !== "asset") return;
  if (project.assets.some((asset) => asset.id === parsed.id)) return;
  const fileId = parsed.id.replace(/^still\./, "");
  upsertAsset(project, {
    id: parsed.id,
    kind: "still",
    files: {
      zh: `assets/stills/zh/${fileId}.png`,
      en: `assets/stills/en/${fileId}.png`,
    },
    label: fileId,
  });
}

export function addScene(
  project: ProjectRecord,
  input: { id: string; kind: string; still?: string; fit?: "cover" | "contain"; role?: StudyRole; after?: string },
): ProjectRecord {
  const task = getTask(filmTask(project.film));
  if (input.kind !== "still") throw new Error("只能追加 still 场（title/close 由种子创建）");
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
  const closeIndex = next.findIndex((item) => item.kind === "close");
  let at = closeIndex >= 0 ? closeIndex : next.length;
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
  const { scene } = requireScene(project, sceneId);
  if (scene.kind === "title" || scene.kind === "close") {
    throw new Error("不能删除 title / close");
  }
  const stillCount = project.film.scenes.filter((item) => item.kind === "still").length;
  if (scene.kind === "still" && stillCount <= 1) {
    throw new Error("不能删光最后一场 still");
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
  const { scene, index } = requireScene(project, sceneId);
  if (scene.kind === "title" || scene.kind === "close") {
    throw new Error("title / close 位置钉住，不能移动");
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
  if (next[0]?.kind !== "title" || next.at(-1)?.kind !== "close") {
    throw new Error("调序后 title 必须在首、close 必须在末");
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
  which: "title" | "close",
  patch: { headline?: string; lede?: string; kicker?: string; tags?: string[] },
): ProjectRecord {
  const copy = project.film.locales[locale];
  if (!copy) throw new Error(`没有 locale ${locale}`);
  if (which === "close" && (patch.kicker !== undefined || patch.tags !== undefined)) {
    throw new Error("close 卡不能设 kicker / tags");
  }
  const locales = { ...project.film.locales };
  if (which === "title") {
    locales[locale] = {
      ...copy,
      title: patch.headline ?? copy.title,
      titleCard: { ...copy.titleCard, ...patch },
    };
  } else {
    locales[locale] = {
      ...copy,
      closeCard: { ...copy.closeCard, headline: patch.headline ?? copy.closeCard.headline, lede: patch.lede ?? copy.closeCard.lede },
    };
  }
  saveFilm(project, { ...filmOf(project), locales });
  return project;
}

export function setVoice(project: ProjectRecord, locale: string, ref: string): ProjectRecord {
  saveFilm(project, { ...filmOf(project), voices: { ...project.film.voices, [locale]: ref } });
  return project;
}
