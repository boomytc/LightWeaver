export function langLabel(locale: string): string {
  if (locale === "zh") return "中文";
  if (locale === "en") return "英文";
  return locale;
}

export function filmLangs(film: { locales: Record<string, unknown>; langs?: string[] }): string[] {
  const all = Object.keys(film.locales);
  const picked = [...new Set((film.langs ?? []).filter((item) => all.includes(item)))];
  return picked.length ? picked : all;
}
