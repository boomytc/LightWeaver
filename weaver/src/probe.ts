import { execFileSync, spawnSync } from "node:child_process";

export type SpeechRange = { start: number; end: number };

export function requireBin(name: string, why?: string): void {
  try {
    execFileSync(name, ["-version"], { stdio: "ignore" });
  } catch {
    throw new Error(`找不到 ${name}。${why ?? `需要本机安装 ${name}。`}`);
  }
}

export function probeDuration(file: string): number {
  const out = execFileSync(
    "ffprobe",
    ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", file],
    { encoding: "utf8" },
  );
  const n = Number(out.trim());
  if (!Number.isFinite(n) || n <= 0) throw new Error(`读不到时长：${file}`);
  return n;
}

export function hasAudioStream(file: string): boolean {
  try {
    const out = execFileSync(
      "ffprobe",
      ["-v", "error", "-select_streams", "a", "-show_entries", "stream=index", "-of", "csv=p=0", file],
      { encoding: "utf8" },
    );
    return out.trim().length > 0;
  } catch {
    return false;
  }
}

export function ffmpegLog(args: string[]): string {
  const result = spawnSync("ffmpeg", args, { encoding: "utf8" });
  return `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
}

/** 把 silencedetect 日志收成语音岛；没有静音就整段当语音。 */
export function parseSilenceLog(output: string, duration: number): SpeechRange[] {
  const total = Math.max(0, duration);
  const silences: SpeechRange[] = [];
  let pendingStart: number | null = null;
  for (const line of output.split(/\r?\n/)) {
    const start = /silence_start:\s*([0-9]+(?:\.[0-9]+)?)/.exec(line);
    if (start) {
      pendingStart = Number(start[1]);
      continue;
    }
    const end = /silence_end:\s*([0-9]+(?:\.[0-9]+)?)/.exec(line);
    if (end) {
      const stop = Number(end[1]);
      const begin = pendingStart ?? 0;
      if (stop > begin) silences.push({ start: begin, end: stop });
      pendingStart = null;
    }
  }
  if (pendingStart != null && total > pendingStart) {
    silences.push({ start: pendingStart, end: total });
  }
  const speech: SpeechRange[] = [];
  let cursor = 0;
  for (const gap of silences.sort((a, b) => a.start - b.start)) {
    const from = Math.max(0, gap.start);
    if (from > cursor) speech.push({ start: cursor, end: Math.min(from, total) });
    cursor = Math.max(cursor, gap.end);
  }
  if (cursor < total) speech.push({ start: cursor, end: total });
  const islands = speech.filter((item) => item.end - item.start > 0.05);
  return islands.length ? islands : total > 0 ? [{ start: 0, end: total }] : [];
}

export function speechRanges(file: string, duration?: number): SpeechRange[] {
  const total = duration && duration > 0 ? duration : probeDuration(file);
  try {
    requireBin("ffmpeg");
    const log = ffmpegLog([
      "-hide_banner",
      "-nostats",
      "-i",
      file,
      "-af",
      "silencedetect=noise=-30dB:d=0.3",
      "-f",
      "null",
      "-",
    ]);
    return parseSilenceLog(log, total);
  } catch {
    return total > 0 ? [{ start: 0, end: total }] : [];
  }
}
