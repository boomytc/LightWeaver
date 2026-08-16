import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { filmsProductRoot, firstPartyRoot, libraryRoot, userRoot, voiceCandidateRoot, weaverRoot } from "./paths.ts";
import { loadLibrary, upsertLibraryAsset, voicePrimaryKey } from "./assets.ts";
import { loadProject } from "./project.ts";
import { parseTtsResult } from "./tts.ts";
import type { Asset, Locale } from "./schema.ts";

const ID_RE = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;

export type VoiceMintOptions = {
  text: string;
  style?: string;
  refAudio?: string;
  destName?: string;
  denoise?: boolean;
  doNormalize?: boolean;
  cfgValue?: number;
  root?: string;
};

export type VoiceMintResult = {
  rel: string;
  dest: string;
  seconds: number;
  text: string;
  style: string;
};

export type KeepLibraryVoiceInput = {
  id: string;
  locale?: Locale;
  sourceAbs: string;
  label?: string;
  said?: string;
  style?: string;
};

export function voiceKeepRel(id: string, locale: string, current?: string): string {
  if (current) return current;
  if (locale === "main") return path.posix.join("voices", `${id}.wav`);
  return path.posix.join("voices", `${id}-${locale}.wav`);
}

export function runVoiceMint(options: VoiceMintOptions): VoiceMintResult {
  const root = options.root ?? weaverRoot();
  const text = options.text.trim();
  if (!text) throw new Error("铸试听需要一句稿");
  const python = path.join(filmsProductRoot(root), "scripts/tts.py");
  if (!fs.existsSync(python)) throw new Error(`找不到 ${python}`);
  const folder = voiceCandidateRoot(root);
  fs.mkdirSync(folder, { recursive: true });
  const rel = (options.destName ?? `mint-${Date.now()}-${process.pid}.wav`).replace(/[^a-z0-9._-]+/gi, "-");
  const dest = path.join(folder, rel);
  if (options.refAudio) assertReadableSource(options.refAudio, root);
  const jobFile = path.join(folder, `${rel}.job.json`);
  fs.writeFileSync(
    jobFile,
    `${JSON.stringify(
      {
        kind: "mint",
        dest,
        text,
        style: options.style ?? "",
        refAudio: options.refAudio ?? "",
        denoise: options.denoise,
        do_normalize: options.doNormalize ?? true,
        cfg_value: options.cfgValue,
        configDirs: [root, filmsProductRoot(root)],
      },
      null,
      2,
    )}\n`,
  );
  try {
    const output = execFileSync("python3", [python, "--job", jobFile], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 16 * 1024 * 1024,
    });
    const parsed = parseTtsResult(output);
    const seconds = parsed.wrote?.[0]?.seconds ?? 0;
    if (!fs.existsSync(dest)) throw new Error(`铸试听没有写出 ${dest}`);
    return { rel, dest, seconds, text, style: options.style ?? "" };
  } catch (error) {
    const err = error as { stderr?: string; stdout?: string; message: string };
    throw new Error([err.stderr, err.stdout, err.message].filter(Boolean).join("\n"));
  } finally {
    fs.rmSync(jobFile, { force: true });
  }
}

export function keepLibraryVoice(input: KeepLibraryVoiceInput, root = weaverRoot()): Asset {
  if (!ID_RE.test(input.id)) throw new Error("资产 id 必须是 dotted/kebab 小写");
  assertReadableSource(input.sourceAbs, root);
  const assets = loadLibrary(root);
  const current = assets.find((item) => item.id === input.id);
  if (current && current.kind !== "voice") throw new Error(`${input.id} 不是音色`);
  const slot = input.locale?.trim() || voicePrimaryKey(current);
  const currentRel = current?.files?.[slot] ?? (slot === voicePrimaryKey(current) ? current?.file : undefined);
  const rel = voiceKeepRel(input.id, slot, currentRel);
  const dest = path.join(libraryRoot(root), rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  if (path.resolve(input.sourceAbs) !== path.resolve(dest)) {
    fs.copyFileSync(input.sourceAbs, dest);
  }
  const texts = { ...(current?.texts ?? {}) };
  if (input.said !== undefined) texts[slot] = input.said;
  const files = { ...(current?.files ?? {}) };
  if (slot === "main" && !Object.keys(files).length) {
    const next: Asset = {
      id: input.id,
      kind: "voice",
      label: input.label ?? current?.label ?? input.id,
      file: rel,
      text: input.said ?? current?.text,
      texts,
      style: input.style ?? current?.style,
      styles: current?.styles,
    };
    return upsertLibraryAsset(next, root);
  }
  files[slot] = rel;
  const next: Asset = {
    id: input.id,
    kind: "voice",
    label: input.label ?? current?.label ?? input.id,
    files,
    texts,
    style: input.style ?? current?.style,
    styles: current?.styles,
  };
  return upsertLibraryAsset(next, root);
}

export function resolveKeepSource(
  source:
    | { kind: "candidate"; rel: string }
    | { kind: "project"; projectId: string; rel: string },
  root = weaverRoot(),
): string {
  if (source.kind === "candidate") {
    const dest = path.resolve(voiceCandidateRoot(root), path.basename(source.rel));
    assertReadableSource(dest, root);
    return dest;
  }
  const project = loadProject(source.projectId, root);
  const dest = path.resolve(project.root, source.rel);
  assertReadableSource(dest, root);
  return dest;
}

function assertReadableSource(absPath: string, root: string): void {
  const resolved = path.resolve(absPath);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    throw new Error(`找不到音频 ${absPath}`);
  }
  const allowed = [voiceCandidateRoot(root), libraryRoot(root), firstPartyRoot(root), userRoot(root)];
  if (!allowed.some((dir) => resolved === dir || resolved.startsWith(`${dir}${path.sep}`))) {
    throw new Error("只能收下库内、片子或试听目录里的 wav");
  }
}
