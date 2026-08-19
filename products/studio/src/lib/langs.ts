export { filmLangs } from "@lightweaver/weaver/schema";

export function langLabel(locale: string): string {
  if (locale === "zh") return "中文";
  if (locale === "en") return "英文";
  return locale;
}
