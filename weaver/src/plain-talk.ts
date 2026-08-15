export type JargonHit = {
  term: string;
  hint: string;
};

/** idea.md 可以写这些词；film.json 的 lines / 卡片要用听者的话。 */
const BANS: { term: string; re: RegExp; hint: string }[] = [
  { term: "叶子", re: /叶子/, hint: "改成「不能再往下点的那一级」" },
  { term: "leaf", re: /\bleaf\b/i, hint: "say “the last level you can pick”, not leaf" },
  { term: "提交模型", re: /提交模型/, hint: "改成「选完交出去什么、面板关不关」" },
  { term: "commit model", re: /commit model/i, hint: "say what is handed over, and whether the menu closes" },
];

export function jargonIn(text: string): JargonHit[] {
  const hits: JargonHit[] = [];
  for (const ban of BANS) {
    if (ban.re.test(text)) hits.push({ term: ban.term, hint: ban.hint });
  }
  return hits;
}
