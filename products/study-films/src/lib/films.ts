import narrationJson from "../../scripts/narration.json";
import { FILM_SPECS } from "./catalog";
import type { CompId, FilmDef, FilmSpec, Locale, NarrationFile, SceneDef } from "./types";

const LOCALES: Locale[] = ["zh", "en"];
const narration = narrationJson as NarrationFile;

function stillDir(filmId: string, locale: Locale): string {
  return locale === "en" ? `stills/en/${filmId}` : `stills/${filmId}`;
}

function voiceDir(filmId: string, locale: Locale): string {
  return `voice/${locale}/${filmId}`;
}

function withCopy(base: SceneDef[], copy: NonNullable<FilmSpec["locales"][Locale]>): SceneDef[] {
  return base.map((scene) => {
    if (scene.kind === "title") return { ...scene, ...copy.titleCard };
    if (scene.kind === "close") return { ...scene, ...copy.closeCard };
    return scene;
  });
}

export function makeFilm(spec: FilmSpec, locale: Locale): FilmDef {
  const copy = spec.locales[locale];
  if (!copy) {
    throw new Error(`film ${spec.id} is missing locale ${locale}`);
  }
  return {
    filmId: spec.id,
    locale,
    brand: spec.brand,
    title: copy.title,
    output: copy.output,
    stillDir: stillDir(spec.id, locale),
    voiceDir: voiceDir(spec.id, locale),
    publishDir: spec.publish?.dir,
    scenes: withCopy(spec.scenes, copy),
  };
}

export function buildFilms(specs: FilmSpec[] = FILM_SPECS): Record<CompId, FilmDef> {
  const films = {} as Record<CompId, FilmDef>;
  for (const spec of specs) {
    for (const locale of LOCALES) {
      if (!spec.locales[locale]) continue;
      films[`${spec.id}-${locale}`] = makeFilm(spec, locale);
    }
  }
  return films;
}

export const FILMS = buildFilms();
export const COMP_IDS = Object.keys(FILMS) as CompId[];

export function lineOf(filmId: string, locale: Locale, sceneId: string): string {
  const lines = narration.films[filmId]?.[locale] ?? [];
  return lines.find((line) => line.id === sceneId)?.text ?? "";
}

export function catalogProblems(specs: FilmSpec[] = FILM_SPECS): string[] {
  const problems: string[] = [];
  const outputs = new Set<string>();
  for (const spec of specs) {
    const sceneIds = spec.scenes.map((scene) => scene.id);
    if (new Set(sceneIds).size !== sceneIds.length) {
      problems.push(`${spec.id}: duplicate scene id`);
    }
    for (const locale of LOCALES) {
      if (!spec.locales[locale]) continue;
      const output = spec.locales[locale]?.output ?? "";
      if (!output) problems.push(`${spec.id}-${locale}: missing output`);
      if (output && outputs.has(output)) problems.push(`duplicate output ${output}`);
      if (output) outputs.add(output);
      const lines = narration.films[spec.id]?.[locale] ?? [];
      for (const scene of spec.scenes) {
        if (!lines.some((line) => line.id === scene.id && line.text.trim())) {
          problems.push(`${spec.id}-${locale}: missing narration for ${scene.id}`);
        }
      }
    }
  }
  return problems;
}
