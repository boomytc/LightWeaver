import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { filmsProductRoot, lightuiRoot, weaverRoot } from "./paths.ts";
import { loadProject } from "./project.ts";
import { outputRelPath, upsertAsset } from "./assets.ts";
import { syncRemotion } from "./sync.ts";
import type { Locale } from "./schema.ts";

export type RenderOptions = {
  projectId: string;
  locale?: Locale;
  root?: string;
  onLog?: (line: string) => void;
};

export type RenderResult = {
  projectId: string;
  files: { locale: string; dest: string; published?: string }[];
};

export function runRender(options: RenderOptions): RenderResult {
  const root = options.root ?? weaverRoot();
  const project = loadProject(options.projectId, root);
  syncRemotion(root);

  const filmsRoot = filmsProductRoot(root);
  const remotion = path.join(filmsRoot, "node_modules/.bin/remotion");
  if (!fs.existsSync(remotion)) {
    throw new Error("找不到 remotion。先在仓库根执行 npm install。");
  }
  const outDir = path.join(filmsRoot, "out");
  fs.mkdirSync(outDir, { recursive: true });

  const locales = options.locale ? [options.locale] : Object.keys(project.film.locales);
  const files: RenderResult["files"] = [];

  for (const locale of locales) {
    const copy = project.film.locales[locale];
    if (!copy) throw new Error(`项目 ${project.id} 没有 locale ${locale}`);
    const missingLines = project.film.scenes.filter((scene) => {
      const wav = path.join(project.root, "assets/lines", locale, `${scene.id}.wav`);
      return !fs.existsSync(wav);
    });
    if (missingLines.length) {
      throw new Error(
        `缺少旁白 wav（${locale}）：${missingLines.map((scene) => scene.id).join(", ")}。先运行 weaver tts --project ${project.id}`,
      );
    }
    const compId = `${project.id}-${locale}`;
    const raw = path.join(outDir, `raw-${copy.output}`);
    const dest = path.join(outDir, copy.output);
    options.onLog?.(`render ${compId}`);
    execFileSync(
      remotion,
      [
        "render",
        compId,
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
    options.onLog?.(`compress ${copy.output}`);
    compressMp4(raw, dest);
    fs.rmSync(raw, { force: true });

    const projectOut = path.join(project.root, outputRelPath(copy.output));
    fs.mkdirSync(path.dirname(projectOut), { recursive: true });
    fs.copyFileSync(dest, projectOut);
    upsertAsset(project, {
      id: `output.${locale}`,
      kind: "output",
      locale,
      file: outputRelPath(copy.output),
    });

    let published: string | undefined;
    if (project.film.publish?.dir) {
      const uiRoot = process.env.LIGHTUI_ROOT ? path.resolve(process.env.LIGHTUI_ROOT) : lightuiRoot(root);
      if (!fs.existsSync(uiRoot)) {
        throw new Error(`LightUI 不在 ${uiRoot}。设置 LIGHTUI_ROOT 后再发布。`);
      }
      published = path.join(uiRoot, project.film.publish.dir, copy.output);
      fs.mkdirSync(path.dirname(published), { recursive: true });
      fs.copyFileSync(dest, published);
      options.onLog?.(`published ${published}`);
    }
    files.push({ locale, dest: projectOut, published });
  }

  return { projectId: project.id, files };
}

function compressMp4(src: string, dest: string): void {
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
