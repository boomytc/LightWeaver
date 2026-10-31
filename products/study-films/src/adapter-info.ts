import fs from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

export function adapterInfo() {
  const pinned = process.env.LIGHTWEAVER_CARD_INFO;
  if (pinned && fs.existsSync(pinned))
    return JSON.parse(fs.readFileSync(pinned, "utf8")) as ReturnType<typeof describeAdapter>;
  return describeAdapter();
}

function describeAdapter() {
  const hash = createHash("sha256");
  for (const file of [
    "./Card.tsx",
    "./card-entry.tsx",
    "./render-card.ts",
    "./adapter-info.ts",
    "./components/Mark.tsx",
    "./lib/deck.ts",
    "./lib/theme.ts",
    "../package.json",
  ])
    hash.update(fs.readFileSync(new URL(file, import.meta.url)));
  let font = "system-default";
  try {
    const file = execFileSync(
      "fc-match",
      ["-f", "%{file}", "Noto Sans CJK SC"],
      { encoding: "utf8" },
    ).trim();
    const bytes = fs.readFileSync(file);
    hash.update(bytes);
    font = createHash("sha256").update(bytes).digest("hex");
  } catch {
    /* 平台字体由环境版本区分 */
  }
  let chrome = "bundled-chromium";
  const executable =
    process.env.LIGHTWEAVER_CHROME ||
    (process.env.LIGHTWEAVER_PACKAGED === "1"
      ? ""
      : "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome");
  try {
    chrome = execFileSync(executable, ["--version"], {
      encoding: "utf8",
      timeout: 5000,
    }).trim();
  } catch {
    /* Remotion 自带浏览器 */
  }
  hash.update(chrome);
  hash.update(process.version);
  return {
    version: "lightweaver-card-v2",
    fingerprint: hash.digest("hex"),
    chrome,
    font,
    remotion: "4.0.512",
  };
}
