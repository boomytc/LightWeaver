import fs from "node:fs";
import path from "node:path";
import { lightuiRoot } from "../paths.ts";
import {
  err,
  filmStudySlug,
  isStudyRole,
  type FilmDoc,
  type Issue,
  type ProjectRecord,
  warn,
} from "../schema.ts";
import type { CreateFilmInput, TaskModule } from "./types.ts";
import { jargonIn } from "../plain-talk.ts";

export const LIGHTUI_LAB_ADAPTERS = ["intent-cascade", "dropdown-taxonomy"] as const;

export const studyExplainer: TaskModule = {
  id: "study-explainer",
  label: { zh: "Study 讲解片", en: "Study explainer" },
  sceneKinds: ["title", "still", "close"],
  createFilm,
  validate: validateStudyExplainer,
};

function createFilm(input: CreateFilmInput, root: string): FilmDoc {
  const title = input.title ?? input.id;
  const source = input.source ?? "user";
  const brand = input.brand ?? (source === "first-party" ? "LightUI" : "LightWeaver");
  const studySlug = input.studySlug;
  if (source === "first-party" && studySlug && studySlug !== input.id) {
    throw new Error("first-party 的 film.id 必须等于 study.slug");
  }
  const cards = readStudyCards(studySlug, title, root);
  const kicker = source === "first-party" ? "LightUI  ·  Study" : `${brand}  ·  Film`;
  const zhOutput = input.output ?? `${input.id}.mp4`;
  const enOutput = input.outputEn ?? `${input.id}.en.mp4`;

  const film: FilmDoc = {
    id: input.id,
    task: "study-explainer",
    brand,
    voices: {
      zh: "library:voice.prompt-zh",
      en: "library:voice.prompt-en",
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
  if (!slug) return empty;
  const studyFile = path.join(lightuiRoot(root), "studies", slug, "study.json");
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
  const titles = scenes.filter((scene) => scene.kind === "title");
  const closes = scenes.filter((scene) => scene.kind === "close");
  const stills = scenes.filter((scene) => scene.kind === "still");

  if (titles.length !== 1 || scenes[0]?.kind !== "title") {
    issues.push(err("scenes", "恰好一个 title，且必须在第一场"));
  }
  if (closes.length !== 1 || scenes.at(-1)?.kind !== "close") {
    issues.push(err("scenes", "恰好一个 close，且必须在最后一场"));
  }
  if (stills.length < 1) {
    issues.push(err("scenes", "至少一场 still"));
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
    if (slug) {
      const sourceMd = path.join(lightuiRoot(root), "studies", slug, "references", "SOURCE.md");
      if (fs.existsSync(sourceMd)) {
        const body = fs.readFileSync(sourceMd, "utf8");
        for (const [locale, copy] of Object.entries(film.locales)) {
          if (copy.output && !body.includes(copy.output)) {
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
    for (const text of [copy.titleCard.lede, copy.titleCard.headline, copy.closeCard.lede, copy.closeCard.headline]) {
      if (!text) continue;
      for (const hit of jargonIn(text)) {
        issues.push(warn(`locales.${locale}`, `卡片忌术语「${hit.term}」：${hit.hint}`));
      }
    }
  }

  return issues;
}
