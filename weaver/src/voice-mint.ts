import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { filmsProductRoot, firstPartyRoot, libraryRoot, userRoot, voiceCandidateRoot, weaverRoot } from "./paths.ts";
import { loadLibrary, upsertLibraryAsset, VOICE_CLONE_KEY, voiceParts } from "./assets.ts";
import { loadProject } from "./project.ts";
import { parseTtsResult } from "./tts.ts";
import type { Asset } from "./schema.ts";

const ID_RE = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;

export type VoiceMintOptions = {
  text: string;
  style?: string;
  refAudio?: string;
  destName?: string;
  refText?: string;
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

export type VoiceKeepAs = "preview" | "clone";

export type KeepLibraryVoiceInput = {
  id: string;
  sourceAbs: string;
  as?: VoiceKeepAs;
  label?: string;
  said?: string;
  style?: string;
};

export function voiceKeepRel(id: string, as: VoiceKeepAs, current?: string): string {
  if (current) return current;
  const name = as === "clone" ? `${id}.clone.wav` : `${id}.wav`;
  return path.posix.join("voices", name);
}

export function upsertVoicePack(
  input: { id: string; label?: string; style?: string },
  root = weaverRoot(),
): Asset {
  if (!ID_RE.test(input.id)) throw new Error("资产 id 必须是 dotted/kebab 小写");
  const current = loadLibrary(root).find((item) => item.id === input.id);
  if (current && current.kind !== "voice") throw new Error(`${input.id} 不是音色`);
  const parts = voiceParts(current);
  return upsertLibraryAsset(
    {
      id: input.id,
      kind: "voice",
      label: input.label ?? current?.label ?? input.id,
      style: input.style ?? current?.style ?? parts.instruct,
      file: current?.file,
      text: current?.text,
      files: current?.files,
      texts: current?.texts,
      styles: current?.styles,
    },
    root,
  );
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
        refText: options.refText ?? "",
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
  const parts = voiceParts(current);
  const as: VoiceKeepAs = input.as ?? "preview";
  const currentRel = as === "clone" ? parts.clone?.file : parts.preview?.file;
  const rel = voiceKeepRel(input.id, as, currentRel);
  const dest = path.join(libraryRoot(root), rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  if (path.resolve(input.sourceAbs) !== path.resolve(dest)) {
    fs.copyFileSync(input.sourceAbs, dest);
  }
  const cloneFile = as === "clone" ? rel : parts.clone?.file;
  const cloneSaid = as === "clone" ? (input.said ?? parts.clone?.said ?? "") : (parts.clone?.said ?? "");
  const files = { ...(current?.files ?? {}) };
  const texts = { ...(current?.texts ?? {}) };
  if (as === "clone") {
    files[VOICE_CLONE_KEY] = rel;
    texts[VOICE_CLONE_KEY] = cloneSaid;
    return upsertLibraryAsset(
      {
        id: input.id,
        kind: "voice",
        label: input.label ?? current?.label ?? input.id,
        file: current?.file,
        text: current?.text,
        style: input.style ?? current?.style ?? parts.instruct,
        files,
        texts,
      },
      root,
    );
  }
  const nextFiles = cloneFile ? { [VOICE_CLONE_KEY]: cloneFile } : undefined;
  const nextTexts = cloneFile ? { [VOICE_CLONE_KEY]: cloneSaid } : undefined;
  return upsertLibraryAsset(
    {
      id: input.id,
      kind: "voice",
      label: input.label ?? current?.label ?? input.id,
      file: rel,
      text: input.said ?? parts.preview?.said ?? "",
      style: input.style ?? current?.style ?? parts.instruct,
      files: nextFiles,
      texts: nextTexts,
    },
    root,
  );
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
