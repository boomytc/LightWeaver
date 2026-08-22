import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { DESCRIBE_SETTINGS } from "./describe-settings.ts";
import { requireBin } from "./probe.ts";

export function jpegRel(videoId: string, t: number): string {
  return path.posix.join("assets/describe/frames", videoId, `${String(Math.round(t * 1000)).padStart(6, "0")}.jpg`);
}

export function extractJpeg(
  file: string,
  t: number,
  dest: string,
  width = DESCRIBE_SETTINGS.jpegWidth,
): string {
  if (fs.existsSync(dest) && fs.statSync(dest).size > 0) return dest;
  requireBin("ffmpeg", "抽描述帧需要本机安装 ffmpeg。");
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  try {
    execFileSync(
      "ffmpeg",
      ["-hide_banner", "-loglevel", "error", "-y", "-ss", String(t), "-i", file, "-frames:v", "1", "-vf", `scale=${width}:-2`, dest],
      { stdio: "ignore" },
    );
  } catch (error) {
    const err = error as { stderr?: string; message: string };
    throw new Error(`抽描述帧失败：${err.stderr || err.message}`);
  }
  if (!fs.existsSync(dest) || fs.statSync(dest).size === 0) throw new Error(`抽描述帧为空：${file} @ ${t}`);
  return dest;
}
