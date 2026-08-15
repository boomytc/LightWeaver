export type JargonHit = {
  term: string;
  hint: string;
};

/** idea.md 可以写实现词；film.json 的 lines / 卡片只用动作和后果。 */
const BANS: { term: string; re: RegExp; hint: string }[] = [
  { term: "叶子", re: /叶子/, hint: "改成「不能再往下点的那一级」" },
  { term: "leaf", re: /\bleaf\b/i, hint: "say “the last level you can pick”, not leaf" },
  { term: "提交模型", re: /提交模型/, hint: "改成「选完拿到什么、菜单关不关」" },
  { term: "commit model", re: /commit model/i, hint: "say what you get, and whether the menu closes" },
  { term: "安全三角", re: /安全三角/, hint: "讲动作：斜着走过去先别换菜单" },
  { term: "safe triangle", re: /safe triangle/i, hint: "say the action: going diagonally, keep the submenu" },
  { term: "走廊", re: /走廊/, hint: "改成「斜着走的那条路」，或直接讲动作" },
  { term: "corridor", re: /\bcorridor\b/i, hint: "say the path you are heading, not corridor" },
  { term: "上一帧", re: /上一帧/, hint: "不要讲判定怎么取样，讲「看你往哪边去」" },
  { term: "previous sample", re: /previous sample/i, hint: "say where you are heading, not the previous sample" },
  { term: "previous frame", re: /previous frame/i, hint: "say where you are heading, not the previous frame" },
  { term: "反向三角", re: /反向三角/, hint: "改成「保护到菜单左边就结束」" },
  { term: "reverse triangle", re: /reverse triangle/i, hint: "say the protection ends at the submenu’s left side" },
  { term: "左缘", re: /左缘/, hint: "改成「菜单左边」" },
  { term: "leading edge", re: /leading edge/i, hint: "say the left side of the submenu" },
  { term: "sticky", re: /\bsticky\b/i, hint: "说它跟着页面走、停在靠近顶部，不要念 CSS" },
  { term: "fixed", re: /\bfixed\b/i, hint: "说不要整块盖在内容上，不要念 CSS" },
  { term: "观察器", re: /观察器/, hint: "改成「先别跟着滚动来回改高亮」" },
  { term: "observer", re: /\bobserver\b/i, hint: "say do not let the highlight bounce after a click jump" },
  { term: "悬停", re: /悬停/, hint: "改成「鼠标移上去」或「经过」" },
  { term: "hover", re: /\bhover\b/i, hint: "say move onto / pass over, not hover" },
  { term: "occupancy", re: /\boccupancy\b/i, hint: "say whether it takes space" },
  { term: "基准线", re: /基准线/, hint: "改成「滚到中间那条才算选中」" },
  { term: "baseline", re: /\bbaseline\b/i, hint: "say the item in the middle is selected" },
  { term: "宽度为零", re: /宽度为零/, hint: "改成「平时不占地方」" },
  { term: "zero width", re: /zero width/i, hint: "say it stays out of the way until it slides in" },
  { term: "scrollspy", re: /\bscrollspy\b/i, hint: "say the matching item lights up as you scroll" },
  { term: "off-canvas", re: /off-?canvas/i, hint: "say hidden: out of the way, then slides in over the page" },
];

export function jargonIn(text: string): JargonHit[] {
  const hits: JargonHit[] = [];
  for (const ban of BANS) {
    if (ban.re.test(text)) hits.push({ term: ban.term, hint: ban.hint });
  }
  return hits;
}
