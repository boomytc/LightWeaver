import fs from "node:fs";
import path from "node:path";
import type { DesktopPreferences } from "./protocol";

const fileName = "preferences.json";

export function readPreferences(dir: string): DesktopPreferences {
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(dir, fileName), "utf8")) as DesktopPreferences;
    if (parsed.theme !== "light" && parsed.theme !== "dark" && parsed.theme !== "system")
      return { theme: "system" };
    return parsed;
  } catch {
    return { theme: "system" };
  }
}

export function writePreferences(dir: string, value: DesktopPreferences): DesktopPreferences {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, fileName);
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(value), { mode: 0o600 });
  fs.renameSync(temp, file);
  return value;
}
