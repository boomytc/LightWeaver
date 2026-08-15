import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { filmsRoot, loadFilmSpecs, renderJobs, requireLightuiRoot } from "./paths.mjs";

const specs = loadFilmSpecs();
const only = process.argv[2];
const jobs = renderJobs(specs, only);
if (!jobs.length) {
  console.error("unknown film id:", only);
  process.exit(1);
}

const remotion = path.join(filmsRoot, "node_modules/.bin/remotion");
const outDir = path.join(filmsRoot, "out");
fs.mkdirSync(outDir, { recursive: true });

function compressMp4(src, dest) {
  const tmp = `${dest}.tmp.mp4`;
  execFileSync(
    "ffmpeg",
    [
      "-y",
      "-i",
      src,
      "-vf",
      "scale=1280:720",
      "-c:v",
      "libx264",
      "-crf",
      "26",
      "-preset",
      "slow",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "64k",
      "-ac",
      "1",
      "-movflags",
      "+faststart",
      tmp,
    ],
    { stdio: "inherit" },
  );
  fs.renameSync(tmp, dest);
}

for (const job of jobs) {
  const wavDir = path.join(filmsRoot, "public/voice", job.locale, job.film);
  if (!fs.existsSync(wavDir)) {
    throw new Error(`missing voice for ${job.locale}/${job.film}; run: python3 scripts/tts.py`);
  }
  const raw = path.join(outDir, `raw-${job.file}`);
  const dest = path.join(outDir, job.file);
  console.log("render", job.id);
  execFileSync(
    remotion,
    [
      "render",
      job.id,
      raw,
      "--codec",
      "h264",
      "--crf",
      "26",
      "--jpeg-quality",
      "80",
      "--audio-bitrate",
      "128k",
      "--concurrency",
      "50%",
    ],
    { cwd: filmsRoot, stdio: "inherit" },
  );
  console.log("compress", job.file);
  compressMp4(raw, dest);
  fs.rmSync(raw, { force: true });
  if (job.publishDir) {
    const uiRoot = requireLightuiRoot();
    const published = path.join(uiRoot, job.publishDir, job.file);
    fs.mkdirSync(path.dirname(published), { recursive: true });
    fs.copyFileSync(dest, published);
    console.log("published", published);
  }
}
