import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { firstPartyRoot, labUrl } from "./paths.mjs";

/** 与 LightUI `scripts/capture-stage.py` / 各 study SOURCE.md 同名同态。只写 LightWeaver。 */
const SHOTS = {
  "intent-cascade": [
    ["status", "open", "status.png"],
    ["diagonal", "open", "diagonal.png"],
    ["project", "open", "project.png"],
    ["third", "open", "third.png"],
  ],
  "dropdown-taxonomy": [
    ["select", "open", "select-open.png"],
    ["multi", "open", "multi-open.png"],
    ["grouped", "open", "grouped-open.png"],
    ["cascader", "open", "cascader-open.png"],
    ["split", "open", "split-open.png"],
    ["mega", "open", "mega-open.png"],
    ["date", "open", "date-open.png"],
  ],
  "nav-taxonomy": [
    ["floating", "closed", "floating.png"],
    ["sidebar", "closed", "sidebar.png"],
    ["breadcrumb", "closed", "breadcrumb.png"],
    ["dropdown", "open", "dropdown-open.png"],
    ["mega", "open", "mega-open.png"],
    ["drawer", "open", "drawer-open.png"],
    ["overlay", "open", "overlay-open.png"],
    ["scrollspy", "closed", "scrollspy.png"],
    ["shrink", "closed", "shrink.png"],
  ],
  "sidebar-taxonomy": [
    ["floating", "closed", "floating.png"],
    ["wheel", "closed", "wheel.png"],
    ["multilevel", "closed", "multilevel.png"],
    ["collapsible", "closed", "collapsible.png"],
    ["offcanvas", "open", "offcanvas-open.png"],
  ],
};

const LAB = labUrl();

function stillPath(study, locale, name) {
  return path.join(firstPartyRoot(), study, "assets", "stills", locale, name);
}

async function clipOf(page) {
  const boxes = [];
  for (const sel of ["[data-stage=fixture]", "[data-stage=popover]", "[data-film=fixture]", "[data-film=popover]"]) {
    for (const el of await page.locator(sel).all()) {
      const box = await el.boundingBox();
      if (box && box.width > 1 && box.height > 1) boxes.push(box);
    }
  }
  if (!boxes.length) return null;
  const pad = 20;
  const vp = page.viewportSize() ?? { width: 1440, height: 1100 };
  const left = Math.max(0, Math.min(...boxes.map((b) => b.x)) - pad);
  const top = Math.max(0, Math.min(...boxes.map((b) => b.y)) - pad);
  const right = Math.min(vp.width, Math.max(...boxes.map((b) => b.x + b.width)) + pad);
  const bottom = Math.min(vp.height, Math.max(...boxes.map((b) => b.y + b.height)) + pad);
  return { x: left, y: top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) };
}

async function captureStudy(browser, study, locale) {
  const shots = SHOTS[study];
  console.log(`\n${study} ${locale}`);
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1100 },
    deviceScaleFactor: 2,
    reducedMotion: "reduce",
  });
  await page.addInitScript((next) => {
    localStorage.setItem("lightui-theme", "light");
    localStorage.setItem("lightui-locale", next);
    document.documentElement.lang = next === "en" ? "en" : "zh-CN";
    document.documentElement.classList.remove("dark");
  }, locale);
  await page.addStyleTag({
    content: `* { caret-color: transparent !important; } *::-webkit-scrollbar { width: 0 !important; height: 0 !important; }`,
  });

  for (const [kind, state, name] of shots) {
    const url = `${LAB}/s/${study}/stage?kind=${kind}&state=${state}`;
    await page.goto(url, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(280);
    const fixture = page.locator("[data-stage=fixture], [data-film=fixture]").first();
    await fixture.waitFor({ state: "visible", timeout: 8000 });
    if (kind === "shrink") {
      const scroller = fixture.locator(".overflow-y-auto").first();
      if (await scroller.count()) {
        await scroller.evaluate((el) => {
          el.scrollTop = 48;
        });
        await page.waitForTimeout(200);
      }
    }
    const dest = stillPath(study, locale, name);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const clip = await clipOf(page);
    await page.screenshot({ path: dest, type: "png", clip: clip ?? undefined, animations: "disabled" });
    console.log("  wrote", dest);
  }
  await page.close();
}

const locales = process.argv.includes("--en") && !process.argv.includes("--zh")
  ? ["en"]
  : process.argv.includes("--zh") && !process.argv.includes("--en")
    ? ["zh"]
    : ["zh", "en"];

const projectFlag = process.argv.indexOf("--project");
const only = projectFlag >= 0 ? process.argv[projectFlag + 1] : undefined;
const jobs = only ? [only] : Object.keys(SHOTS);
if (only && !SHOTS[only]) {
  console.error(`没有 stage 清单：${only}`);
  process.exit(2);
}

const browser = await chromium.launch({ headless: true });
try {
  const probe = await fetch(LAB, { signal: AbortSignal.timeout(3000) }).catch(() => null);
  if (!probe?.ok) {
    throw new Error(`Lab is not reachable at ${LAB}. Start LightUI with: make dev`);
  }
  for (const locale of locales) {
    for (const id of jobs) {
      await captureStudy(browser, id, locale);
    }
  }
  console.log("\ncapture done");
} finally {
  await browser.close();
}
