import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findAsset, resolveAssetFile } from "../assets.ts";
import { lightuiRoot } from "../paths.ts";
import { err, filmLangs, filmStudySlug, type FilmDoc, type Issue, type ProjectRecord, warn } from "../schema.ts";
import type { CreateFilmInput, TaskModule } from "./types.ts";
import { jargonIn } from "./study-jargon.ts";

export const STUDY_ROLES = ["problem", "rule", "contrast"] as const;
export type StudyRole = (typeof STUDY_ROLES)[number];

export function isStudyRole(value: string): value is StudyRole {
  return (STUDY_ROLES as readonly string[]).includes(value);
}

const adaptersFile = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../scripts/lightui-lab-adapters.json");
export const LIGHTUI_LAB_ADAPTERS = Object.keys(
  JSON.parse(fs.readFileSync(adaptersFile, "utf8")) as Record<string, unknown>,
) as readonly string[];

export const studyExplainer: TaskModule = {
  id: "study-explainer",
  recipePack: "study-explainer",
  renderer: "remotion",
  surface: "cards",
  label: { zh: "讲解片", en: "Study explainer" },
  sceneKinds: ["title", "still", "close"],
  roles: STUDY_ROLES,
  frame: {
    pinnedKinds: ["title", "close"],
    expandableKinds: ["still"],
    insertBeforeKind: "close",
    firstKind: "title",
    lastKind: "close",
    minExpandable: 1,
    seedPlaceholderId: "hero",
  },
  cards: [
    { which: "title", localeKey: "titleCard", syncTitle: true },
    { which: "close", localeKey: "closeCard", forbid: ["kicker", "tags"] },
  ],
  createFilm,
  validate: validateStudyExplainer,
  isReadyToRender: everyStillPngExists,
  isComplete: (project, root) => project.film.capture?.kind === "lightui-lab" && everyStillPngExists(project, root),
};

function createFilm(input: CreateFilmInput, root: string): FilmDoc {
  const title = input.title ?? input.id;
  const source = input.source ?? "user";
  const brand = input.brand ?? "LightWeaver";
  const studySlug = input.studySlug;
  if (source === "first-party" && studySlug && studySlug !== input.id) {
    throw new Error("first-party 的 film.id 必须等于 study.slug");
  }
  const cards = readStudyCards(studySlug, title, root);
  const kicker = `${brand}  ·  Film`;
  const zhOutput = input.output ?? `${input.id}.mp4`;
  const enOutput = input.outputEn ?? `${input.id}.en.mp4`;

  const film: FilmDoc = {
    id: input.id,
    task: "study-explainer",
    brand,
    voices: {
      zh: "library:voice.prompt",
      en: "library:voice.prompt",
    },
    locales: {
      zh: {
        title: cards.zhTitle,
        output: zhOutput,
        titleCard: {
          kicker,
          headline: cards.zhTitle,
          lede: cards.zhLede,
          tags: ["名称", "场景", "规则"],
        },
        closeCard: { headline: "说清楚", lede: cards.zhClose },
      },
      en: {
        title: cards.enTitle,
        output: enOutput,
        titleCard: {
          kicker,
          headline: cards.enTitle,
          lede: cards.enLede,
          tags: ["Name", "Scene", "Rules"],
        },
        closeCard: { headline: "Say it this way", lede: cards.enClose },
      },
    },
    scenes: [
      { id: "title", kind: "title", lines: { zh: cards.zhTitle, en: cards.enTitle } },
      { id: "hero", kind: "still", lines: { zh: cards.zhTitle, en: cards.enTitle } },
      { id: "close", kind: "close", lines: { zh: "说清楚。", en: "Say it this way." } },
    ],
  };

  if (studySlug) {
    film.study = { slug: studySlug };
    film.publish = { dir: `studies/${studySlug}/references` };
    if ((LIGHTUI_LAB_ADAPTERS as readonly string[]).includes(studySlug)) {
      film.capture = { kind: "lightui-lab", slug: studySlug };
    } else {
      film.capture = { kind: "manual" };
    }
  } else {
    film.capture = { kind: "manual" };
  }

  return film;
}

function readStudyCards(slug: string | undefined, fallback: string, root: string) {
  const empty = {
    zhTitle: fallback,
    enTitle: fallback,
    zhLede: "",
    enLede: "",
    zhClose: "",
    enClose: "",
  };
  const uiRoot = lightuiRoot(root);
  if (!slug || !uiRoot) return empty;
  const studyFile = path.join(uiRoot, "studies", slug, "study.json");
  if (!fs.existsSync(studyFile)) return empty;
  try {
    const study = JSON.parse(fs.readFileSync(studyFile, "utf8")) as {
      title?: string;
      titleEn?: string;
      summary?: string;
      summaryEn?: string;
    };
    return {
      zhTitle: study.title || fallback,
      enTitle: study.titleEn || fallback,
      zhLede: study.summary ?? "",
      enLede: study.summaryEn ?? "",
      zhClose: "",
      enClose: "",
    };
  } catch {
    return empty;
  }
}

function validateStudyExplainer(project: ProjectRecord, root: string): Issue[] {
  const issues: Issue[] = [];
  const { film } = project;
  const scenes = film.scenes;
  const locales = filmLangs(film);
  const titles = scenes.filter((scene) => scene.kind === "title");
  const closes = scenes.filter((scene) => scene.kind === "close");
  const stills = scenes.filter((scene) => scene.kind === "still");

  for (const scene of scenes) {
    const base = `scenes.${scene.id}`;
    for (const locale of locales) {
      const line = scene.lines?.[locale]?.trim() ?? "";
      if (!line) issues.push(err(`${base}.lines.${locale}`, "缺旁白"));
    }
    if (studyExplainer.frame.expandableKinds.includes(scene.kind)) {
      if (!scene.still) {
        issues.push(err(`${base}.still`, "可展开场需要 still 资产引用"));
      } else if (!findAsset(project, scene.still, root)) {
        issues.push(err(`${base}.still`, `找不到静帧 ${scene.still}`));
      } else {
        for (const locale of locales) {
          const resolved = resolveAssetFile(project, scene.still, locale, root);
          if (!resolved || !fs.existsSync(resolved.absPath)) {
            issues.push(warn(`${base}.still.${locale}`, `静帧文件不存在：${scene.still}`));
          }
        }
      }
    }
    for (const locale of locales) {
      const lineRef = `asset:line.${scene.id}.${locale}`;
      const lineAsset = findAsset(project, lineRef, root);
      if (!lineAsset) {
        issues.push(warn(`${base}.line.${locale}`, "尚未合成旁白 wav"));
        continue;
      }
      const resolved = resolveAssetFile(project, lineRef, locale, root);
      if (!resolved || !fs.existsSync(resolved.absPath)) {
        issues.push(warn(`${base}.line.${locale}`, "旁白 wav 文件缺失"));
      }
    }
  }

  if (titles.length !== 1 || scenes[0]?.kind !== "title") {
    issues.push(err("scenes", "恰好一个 title，且必须在第一场"));
  }
  if (closes.length !== 1 || scenes.at(-1)?.kind !== "close") {
    issues.push(err("scenes", "恰好一个 close，且必须在最后一场"));
  }
  if (stills.length < 1) {
    issues.push(err("scenes", "至少一场 still"));
  }
  const firstLocale = filmLangs(film)[0] ?? "";
  if (!film.locales[firstLocale]?.titleCard?.headline) {
    issues.push(warn("scenes.title", "片头缺少 headline"));
  }

  const roles = scenes.map((scene) => scene.role).filter((role): role is NonNullable<typeof role> => Boolean(role));
  if (roles.length) {
    const hasProblem = scenes.some((scene) => scene.role === "problem");
    const hasContrast = scenes.some((scene) => scene.role === "contrast");
    const allStillContrast = stills.length > 0 && stills.every((scene) => scene.role === "contrast");
    if (!(hasProblem && hasContrast) && !allStillContrast) {
      issues.push(warn("scenes.role", "已写 role 时须覆盖 problem+contrast，或全部 still 为 contrast"));
    }
    for (const scene of scenes) {
      if (scene.role && !isStudyRole(scene.role)) {
        issues.push(err(`scenes.${scene.id}.role`, `未知 role：${scene.role}`));
      }
    }
  }

  if (project.source === "first-party") {
    const slug = filmStudySlug(film);
    if (!slug) issues.push(err("study.slug", "first-party 需要 study.slug"));
    else if (slug !== film.id) issues.push(err("study.slug", "film.id 必须等于 study.slug"));
    if (film.publish?.dir && slug && film.publish.dir !== `studies/${slug}/references`) {
      issues.push(warn("publish.dir", `建议 studies/${slug}/references`));
    }
    const uiRoot = lightuiRoot(root);
    if (slug && uiRoot) {
      const sourceMd = path.join(uiRoot, "studies", slug, "references", "SOURCE.md");
      if (fs.existsSync(sourceMd)) {
        const body = fs.readFileSync(sourceMd, "utf8");
        for (const locale of filmLangs(film)) {
          const copy = film.locales[locale];
          if (copy?.output && !body.includes(copy.output)) {
            issues.push(warn(`locales.${locale}.output`, `SOURCE.md 未点名 ${copy.output}`));
          }
        }
      }
    }
  }

  for (const scene of scenes) {
    for (const [locale, line] of Object.entries(scene.lines)) {
      for (const hit of jargonIn(line)) {
        issues.push(
          warn(`scenes.${scene.id}.lines.${locale}`, `口播忌术语「${hit.term}」：${hit.hint}`),
        );
      }
    }
  }
  for (const [locale, copy] of Object.entries(film.locales)) {
    const pointLists = [copy.titleCard?.points, copy.closeCard?.points];
    for (const [index, list] of pointLists.entries()) {
      const which = index === 0 ? "titleCard" : "closeCard";
      if (!list?.length) {
        issues.push(warn(`locales.${locale}.${which}.points`, "卡片正文用 points，lede 只留一句"));
      }
    }
    const texts = [
      copy.titleCard?.lede,
      copy.titleCard?.headline,
      copy.closeCard?.lede,
      copy.closeCard?.headline,
      ...(copy.titleCard?.points ?? []),
      ...(copy.closeCard?.points ?? []),
    ];
    for (const text of texts) {
      if (!text) continue;
      for (const hit of jargonIn(text)) {
        issues.push(warn(`locales.${locale}`, `卡片忌术语「${hit.term}」：${hit.hint}`));
      }
    }
  }

  return issues;
}

function everyStillPngExists(project: ProjectRecord, root: string): boolean {
  const locales = filmLangs(project.film);
  for (const scene of project.film.scenes) {
    if (!studyExplainer.frame.expandableKinds.includes(scene.kind)) continue;
    if (!scene.still) return false;
    for (const locale of locales) {
      const resolved = resolveAssetFile(project, scene.still, locale, root);
      if (!resolved || !fs.existsSync(resolved.absPath)) return false;
    }
  }
  return project.film.scenes.some((scene) => studyExplainer.frame.expandableKinds.includes(scene.kind));
}
