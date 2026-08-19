import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { weaverRoot, weaverScriptsRoot } from "./paths.ts";
import { loadProject } from "./project.ts";
import { findAsset, lineAssetId, lineRelPath, resolveVoicePrompt, upsertAsset, voiceHifiRef } from "./assets.ts";
import { filmLangs, type Locale } from "./schema.ts";

export type TtsOptions = {
  projectId: string;
  locale?: Locale;
  scene?: string;
  root?: string;
  onLog?: (line: string) => void;
};

export type TtsResult = {
  projectId: string;
  wrote: { locale: string; scene: string; file: string; seconds: number }[];
};

export function parseTtsResult(output: string): { wrote?: { scene: string; file: string; seconds: number }[] } {
  const lines = output.split(/\r?\n/).map((row) => row.trim());
  let line = "";
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i]?.startsWith("{")) {
      line = lines[i] ?? "";
      break;
    }
  }
  if (!line) throw new Error(`tts 没有 JSON 输出：${output.slice(-400)}`);
  try {
    return JSON.parse(line) as { wrote?: { scene: string; file: string; seconds: number }[] };
  } catch {
    throw new Error(`tts 输出无法解析：${line.slice(0, 240)}`);
  }
}

export function runTts(options: TtsOptions): TtsResult {
  const root = options.root ?? weaverRoot();
  const project = loadProject(options.projectId, root);
  const locales = options.locale ? [options.locale] : filmLangs(project.film);
  const scenes = options.scene
    ? project.film.scenes.filter((scene) => scene.id === options.scene)
    : project.film.scenes;
  if (!scenes.length) throw new Error(`没有可合成的场景：${options.scene ?? "(all)"}`);
  if (!locales.length) throw new Error(`项目 ${project.id} 没有要出的语言`);

  const wrote: TtsResult["wrote"] = [];
  const python = path.join(weaverScriptsRoot(), "tts.py");
  if (!fs.existsSync(python)) throw new Error(`找不到 ${python}`);

  for (const locale of locales) {
    const voiceRef = project.film.voices[locale] ?? project.film.voices[Object.keys(project.film.voices)[0] ?? ""];
    if (!voiceRef) throw new Error(`项目 ${project.id} 未指定音色`);
    const voice = resolveVoicePrompt(project, voiceRef, locale, root);
    const voiceAsset = findAsset(project, voiceRef, root);
    const hifi = voiceHifiRef(voiceAsset);
    if (!voice || !hifi) {
      throw new Error(`音色 ${voiceRef} 还没有克隆源 wav。上传一支，或用设计指令铸完再收。`);
    }
    if (!hifi.said) {
      throw new Error(`音色 ${voiceRef} 缺文本，Hi-Fi 无法保证一致。`);
    }
    const items = scenes
      .map((scene) => ({
        id: scene.id,
        text: scene.lines[locale] ?? "",
        dest: lineRelPath(scene.id, locale),
      }))
      .filter((item) => item.text.trim());
    if (!items.length) throw new Error(`项目 ${project.id} 没有 ${locale} 旁白`);
    const job = {
      kind: "lines",
      mode: "hifi",
      projectRoot: project.root,
      locale,
      refAudio: voice.absPath,
      refText: hifi.said,
      configDirs: [root],
      items,
    };
    const jobFile = path.join(os.tmpdir(), `weaver-tts-${project.id}-${locale}-${process.pid}.json`);
    fs.writeFileSync(jobFile, `${JSON.stringify(job, null, 2)}\n`);
    try {
      const output = execFileSync("python3", [python, "--job", jobFile], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        maxBuffer: 16 * 1024 * 1024,
      });
      options.onLog?.(output);
      const result = parseTtsResult(output);
      for (const item of result.wrote ?? []) {
        upsertAsset(project, {
          id: lineAssetId(item.scene, locale),
          kind: "line",
          locale,
          scene: item.scene,
          file: item.file,
        });
        wrote.push({ locale, scene: item.scene, file: item.file, seconds: item.seconds });
      }
    } catch (error) {
      const err = error as { stderr?: string; stdout?: string; message: string };
      throw new Error([err.stderr, err.stdout, err.message].filter(Boolean).join("\n"));
    } finally {
      fs.rmSync(jobFile, { force: true });
    }
  }
  return { projectId: project.id, wrote };
}


