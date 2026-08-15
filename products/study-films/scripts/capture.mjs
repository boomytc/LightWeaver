import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { filmsRoot, labUrl, requireLightuiRoot } from "./paths.mjs";

function projectStill(study, name, locale) {
  const loc = locale === "en" ? "en" : "zh";
  return path.join(filmsRoot, "projects", study, "assets", "stills", loc, name);
}

const LAB = labUrl();
const DESKTOP = { width: 1440, height: 1100 };
const MOBILE = { width: 390, height: 844 };

const UI = {
  zh: {
    intentHeading: /根据鼠标移动方向/,
    dropdownHeading: /看起来都是往下展开/,
    reset: "重置",
    orderStatus: "订单状态",
    skills: "你的技能",
    reviewer: "评审成员",
    region: "所在地区",
    morePublish: "更多发布选项",
  },
  en: {
    intentHeading: /Guess from the pointer path/,
    dropdownHeading: /They all open downward/,
    reset: "Reset",
    orderStatus: "Order status",
    skills: "Your skills",
    reviewer: "Reviewer",
    region: "Region",
    morePublish: "More publish options",
  },
};

function dests(study, name, locale) {
  const still = projectStill(study, name, locale);
  if (locale === "en") return [still];
  const uiRoot = requireLightuiRoot();
  return [path.join(uiRoot, "studies", study, "references", name), still];
}

function writeAll(paths, buffer) {
  for (const file of paths) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, buffer);
    console.log("  wrote", file);
  }
}

async function ready(page) {
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(200);
}

async function openLab(browser, viewport, url, locale) {
  const page = await browser.newPage({
    viewport,
    deviceScaleFactor: 2,
    reducedMotion: "reduce",
  });
  await page.addInitScript((nextLocale) => {
    localStorage.setItem("lightui-theme", "light");
    localStorage.setItem("lightui-locale", nextLocale);
  }, locale);
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.addStyleTag({
    content: `
      * { caret-color: transparent !important; }
      *::-webkit-scrollbar { width: 0 !important; height: 0 !important; }
    `,
  });
  await ready(page);
  return page;
}

async function screenshotPage(page, study, name, locale, { fullPage = false } = {}) {
  const buffer = await page.screenshot({ type: "png", fullPage, animations: "disabled" });
  writeAll(dests(study, name, locale), buffer);
}

async function unionBox(page, selectors) {
  let left = Infinity;
  let top = Infinity;
  let right = 0;
  let bottom = 0;
  for (const selector of selectors) {
    const loc = page.locator(selector).first();
    if ((await loc.count()) === 0) continue;
    const box = await loc.boundingBox();
    if (!box) continue;
    left = Math.min(left, box.x);
    top = Math.min(top, box.y);
    right = Math.max(right, box.x + box.width);
    bottom = Math.max(bottom, box.y + box.height);
  }
  if (!Number.isFinite(left)) return null;
  return { left, top, right, bottom };
}

async function screenshotClip(page, study, name, locale, selectors, pad = 16) {
  const viewport = page.viewportSize();
  const box = await unionBox(page, selectors);
  if (!box) {
    await screenshotPage(page, study, name, locale);
    return;
  }
  const clip = {
    x: Math.max(0, Math.floor(box.left - pad)),
    y: Math.max(0, Math.floor(box.top - pad)),
    width: Math.ceil(box.right - box.left + pad * 2),
    height: Math.ceil(box.bottom - box.top + pad * 2),
  };
  if (viewport) {
    clip.width = Math.min(clip.width, viewport.width - clip.x);
    clip.height = Math.min(clip.height, viewport.height - clip.y);
  }
  const buffer = await page.screenshot({ type: "png", clip, animations: "disabled" });
  writeAll(dests(study, name, locale), buffer);
}

async function pinFixture(page) {
  const fixture = page.locator("[data-film='fixture']");
  await fixture.waitFor({ state: "visible" });
  await page.evaluate(() => {
    const el = document.querySelector("[data-film='fixture']");
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY;
    window.scrollTo(0, Math.max(0, top - 24));
  });
  await page.waitForTimeout(120);
}

async function screenshotFixture(page, study, name, locale, extra = []) {
  await pinFixture(page);
  await screenshotClip(page, study, name, locale, ["[data-film='fixture']", ...extra], 16);
}

async function nodeBox(page, id) {
  const loc = page.locator(`[data-node="${id}"]`);
  await loc.waitFor({ state: "visible", timeout: 8000 });
  const box = await loc.boundingBox();
  if (!box) throw new Error(`no box for ${id}`);
  return { loc, box };
}

async function moveToNode(page, id, { steps = 16, x = 0.42 } = {}) {
  const { box } = await nodeBox(page, id);
  await page.mouse.move(box.x + box.width * x, box.y + box.height / 2, { steps });
  await page.waitForTimeout(80);
}

async function slide(page, fromId, toId, { steps = 28, fromX = 0.55, toX = 0.55 } = {}) {
  const from = await nodeBox(page, fromId);
  const to = await nodeBox(page, toId);
  await page.mouse.move(from.box.x + from.box.width * fromX, from.box.y + from.box.height / 2);
  await page.mouse.move(to.box.x + to.box.width * toX, to.box.y + to.box.height / 2, { steps });
  await page.waitForTimeout(120);
}

async function captureIntent(browser, locale) {
  const study = "intent-cascade";
  const ui = UI[locale];
  console.log(`\nintent-cascade ${locale}`);
  const page = await openLab(browser, DESKTOP, `${LAB}/s/intent-cascade`, locale);
  await page.getByRole("heading", { name: ui.intentHeading }).waitFor();
  await screenshotPage(page, study, "desktop-full.png", locale, { fullPage: true });

  const play = page.locator('[data-film="play"]');
  await play.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, -72));
  await page.waitForTimeout(200);

  await moveToNode(page, "status", { x: 0.35 });
  await slide(page, "status", "status-cancel", { fromX: 0.72, toX: 0.45, steps: 32 });
  await screenshotClip(page, study, "diagonal-to-cancel.png", locale, ['[data-film="play"]'], 12);

  await page.getByRole("button", { name: ui.reset }).click();
  await page.waitForTimeout(250);
  await moveToNode(page, "status", { x: 0.4 });
  await slide(page, "status", "project", { fromX: 0.4, toX: 0.4, steps: 18 });
  await page.waitForTimeout(160);
  await screenshotClip(page, study, "vertical-to-project.png", locale, ['[data-film="play"]'], 12);

  await page.getByRole("button", { name: ui.reset }).click();
  await page.waitForTimeout(250);
  await moveToNode(page, "project", { x: 0.45 });
  await page.waitForTimeout(200);
  await moveToNode(page, "proj-tags", { x: 0.45 });
  await page.waitForTimeout(200);
  await slide(page, "proj-tags", "ptag-urgent", { fromX: 0.7, toX: 0.45, steps: 24 });
  await screenshotClip(page, study, "third-level.png", locale, ['[data-film="play"]'], 12);
  await page.close();

  const mobile = await openLab(browser, MOBILE, `${LAB}/s/intent-cascade`, locale);
  await mobile.getByRole("heading", { name: ui.intentHeading }).waitFor();
  await screenshotPage(mobile, study, "mobile.png", locale, { fullPage: true });
  await mobile.close();
}

async function pickKind(page, id) {
  await page.locator(`[data-kind="${id}"]`).click();
  await page.waitForTimeout(180);
  await pinFixture(page);
}

async function openTrigger(page, name) {
  await page.getByRole("button", { name }).click();
  await page.locator("[data-film='popover']").waitFor({ state: "visible", timeout: 4000 });
  await page.waitForTimeout(120);
}

async function captureDropdown(browser, locale) {
  const study = "dropdown-taxonomy";
  const ui = UI[locale];
  console.log(`\ndropdown-taxonomy ${locale}`);
  const page = await openLab(browser, DESKTOP, `${LAB}/s/dropdown-taxonomy`, locale);
  await page.getByRole("heading", { name: ui.dropdownHeading }).waitFor();

  await pickKind(page, "select");
  await screenshotFixture(page, study, "comp-01.png", locale);
  await openTrigger(page, ui.orderStatus);
  await screenshotFixture(page, study, "select-open.png", locale, ["[data-film='popover']"]);
  await page.keyboard.press("Escape");

  await pickKind(page, "multi");
  await openTrigger(page, ui.skills);
  await screenshotFixture(page, study, "comp-02.png", locale, ["[data-film='popover']"]);
  await page.keyboard.press("Escape");

  await pickKind(page, "grouped");
  await openTrigger(page, ui.reviewer);
  await screenshotFixture(page, study, "comp-03.png", locale, ["[data-film='popover']"]);
  await page.keyboard.press("Escape");

  await pickKind(page, "cascader");
  await openTrigger(page, ui.region);
  await page.locator('[data-region="zj"]').click();
  await page.waitForTimeout(120);
  await page.locator('[data-region="hz"]').click();
  await page.waitForTimeout(160);
  await screenshotFixture(page, study, "comp-04.png", locale, ["[data-film='popover']"]);
  await page.keyboard.press("Escape");

  await pickKind(page, "split");
  await openTrigger(page, ui.morePublish);
  await screenshotFixture(page, study, "comp-05.png", locale, ["[data-film='popover']"]);
  await page.keyboard.press("Escape");

  await pickKind(page, "mega");
  await page.waitForTimeout(160);
  await screenshotFixture(page, study, "comp-06.png", locale);

  await pickKind(page, "date");
  await page.waitForTimeout(200);
  await screenshotFixture(page, study, "comp-07.png", locale, ["[data-film='popover']"]);
  await screenshotFixture(page, study, "date-cal.png", locale, ["[data-film='popover']"]);
  await page.close();

  const mobile = await openLab(browser, MOBILE, `${LAB}/s/dropdown-taxonomy`, locale);
  await mobile.getByRole("heading", { name: ui.dropdownHeading }).waitFor();
  await screenshotPage(mobile, study, "mobile.png", locale, { fullPage: true });
  await mobile.close();
}

const ADAPTERS = {
  "intent-cascade": captureIntent,
  "dropdown-taxonomy": captureDropdown,
};

const locales = process.argv.includes("--en") && !process.argv.includes("--zh")
  ? ["en"]
  : process.argv.includes("--zh") && !process.argv.includes("--en")
    ? ["zh"]
    : ["zh", "en"];

const projectFlag = process.argv.indexOf("--project");
const only = projectFlag >= 0 ? process.argv[projectFlag + 1] : undefined;
const jobs = only ? [only] : Object.keys(ADAPTERS);
if (only && !ADAPTERS[only]) {
  console.error(`没有 lab adapter：${only}`);
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
      await ADAPTERS[id](browser, locale);
    }
  }
  console.log("\ncapture done");
} finally {
  await browser.close();
}
