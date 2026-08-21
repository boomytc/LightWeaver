import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { outputRelPath, resolveAssetFile, upsertAsset } from "./assets.ts";
import { loadProject } from "./project.ts";
import { hasAudioStream, probeDuration, requireBin } from "./probe.ts";
import { filmLangs, type Locale, type OstMode, type ProjectRecord, type SceneDef } from "./schema.ts";
import { isRenderable } from "./validate.ts";
import { weaverRoot } from "./paths.ts";

const ORIGINAL_VOLUME = 1.2;
const VOICE_VOLUME = 1.0;

export type ComposeOptions = {
  projectId: string;
  locale?: Locale;
  root?: string;
  onLog?: (line: string) => void;
};

export type ComposeResult = {
  projectId: string;
  files: { locale: string; dest: string }[];
};

export function runCompose(options: ComposeOptions): ComposeResult {
  const root = options.root ?? weaverRoot();
  const project = loadProject(options.projectId, root);
  if (!isRenderable(project, root)) {
    throw new Error(`还不能合成：${project.id}。源视频或旁白 wav 未齐`);
  }
  requireBin("ffmpeg", "合成原片需要本机安装 ffmpeg。");
  requireBin("ffprobe", "合成原片需要本机安装 ffprobe。");

  const locales = options.locale ? [options.locale] : filmLangs(project.film);
  const files: ComposeResult["files"] = [];
  for (const locale of locales) {
    const dest = composeLocale(project, locale, root, options.onLog);
    files.push({ locale, dest });
  }
  return { projectId: project.id, files };
}

function composeLocale(
  project: ProjectRecord,
  locale: Locale,
  root: string,
  onLog?: (line: string) => void,
): string {
  const copy = project.film.locales[locale];
  if (!copy) throw new Error(`项目 ${project.id} 没有 locale ${locale}`);
  if (copy.output.includes("/") || copy.output.includes("..")) {
    throw new Error(`非法 output 文件名：${copy.output}`);
  }

  const clipsDir = path.join(project.root, "assets/clips", locale);
  fs.mkdirSync(clipsDir, { recursive: true });
  const segments: string[] = [];
  for (const scene of project.film.scenes) {
    if (scene.kind !== "clip") continue;
    const dest = path.join(clipsDir, `${scene.id}.mp4`);
    cutScene(project, scene, locale, dest, root, onLog);
    segments.push(dest);
  }
  if (!segments.length) throw new Error(`项目 ${project.id} 没有 clip 场`);

  const outRel = outputRelPath(copy.output);
  const outAbs = path.join(project.root, outRel);
  fs.mkdirSync(path.dirname(outAbs), { recursive: true });
  concatSegments(segments, outAbs, onLog);
  upsertAsset(project, { id: `output.${locale}`, kind: "output", locale, file: outRel });
  return outAbs;
}

function cutScene(
  project: ProjectRecord,
  scene: SceneDef,
  locale: Locale,
  dest: string,
  root: string,
  onLog?: (line: string) => void,
): void {
  const ost: OstMode = scene.ost ?? "narration";
  if (typeof scene.in !== "number") throw new Error(`场景 ${scene.id} 缺 in`);
  const source = scene.source ? resolveAssetFile(project, scene.source, locale, root) : null;
  if (!source || !fs.existsSync(source.absPath)) {
    throw new Error(`找不到源视频 ${scene.source ?? ""}`);
  }
  const start = scene.in;
  let duration: number;
  let wav: string | undefined;
  if (ost === "original") {
    if (typeof scene.out !== "number") throw new Error(`场景 ${scene.id} 缺 out`);
    duration = scene.out - scene.in;
  } else {
    wav = path.join(project.root, "assets/lines", locale, `${scene.id}.wav`);
    if (!fs.existsSync(wav)) throw new Error(`缺少旁白 wav：${wav}`);
    duration = probeDuration(wav);
  }
  if (!(duration > 0)) throw new Error(`场景 ${scene.id} 时长无效`);

  const args = clipArgs({
    source: source.absPath,
    start,
    duration,
    dest,
    ost,
    wav,
    hasAudio: hasAudioStream(source.absPath),
  });
  onLog?.(`cut ${scene.id} ${ost}`);
  runFfmpeg(args);
}

export function clipArgs(input: {
  source: string;
  start: number;
  duration: number;
  dest: string;
  ost: OstMode;
  wav?: string;
  hasAudio: boolean;
}): string[] {
  const base = ["-y", "-ss", fmt(input.start), "-t", fmt(input.duration), "-i", input.source];
  const encode = ["-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "23", "-preset", "veryfast"];
  if (input.ost === "original") {
    if (input.hasAudio) return [...base, ...encode, "-c:a", "aac", "-ac", "2", "-ar", "44100", input.dest];
    return [...base, ...encode, "-an", input.dest];
  }
  if (!input.wav) throw new Error("解说场需要旁白 wav");
  const withWav = [...base, "-i", input.wav];
  if (input.ost === "narration" || !input.hasAudio) {
    return [
      ...withWav,
      "-map",
      "0:v:0",
      "-map",
      "1:a:0",
      ...encode,
      "-c:a",
      "aac",
      "-ac",
      "2",
      "-ar",
      "44100",
      "-shortest",
      input.dest,
    ];
  }
  return [
    ...withWav,
    "-filter_complex",
    `[0:a]volume=${ORIGINAL_VOLUME}[a0];[1:a]volume=${VOICE_VOLUME}[a1];[a0][a1]amix=inputs=2:duration=first:dropout_transition=0[a]`,
    "-map",
    "0:v:0",
    "-map",
    "[a]",
    ...encode,
    "-c:a",
    "aac",
    "-ac",
    "2",
    "-ar",
    "44100",
    input.dest,
  ];
}

function concatSegments(segments: string[], dest: string, onLog?: (line: string) => void): void {
  const list = path.join(path.dirname(segments[0]!), "concat.txt");
  const body = segments.map((file) => `file '${file.replaceAll("'", "'\\''")}'`).join("\n");
  fs.writeFileSync(list, `${body}\n`);
  onLog?.("concat");
  try {
    runFfmpeg(["-y", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", dest]);
  } catch {
    runFfmpeg([
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      list,
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      dest,
    ]);
  }
}

function runFfmpeg(args: string[]): void {
  try {
    execFileSync("ffmpeg", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (error) {
    const err = error as { stderr?: string; stdout?: string; message: string };
    throw new Error(["ffmpeg 失败", err.stderr, err.stdout, err.message].filter(Boolean).join("\n"));
  }
}

function fmt(value: number): string {
  return value.toFixed(3);
}
