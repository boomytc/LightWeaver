import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { filmsProductRoot, firstPartyRoot, libraryRoot, userRoot, voiceCandidateRoot, weaverRoot } from "./paths.ts";
import { loadLibrary, upsertLibraryAsset, voiceCloneSource, type VoiceOrigin } from "./assets.ts";
import { loadProject } from "./project.ts";
import { parseTtsResult } from "./tts.ts";
import { ensureVoiceSaid, type TranscribeFn } from "./asr.ts";
import type { Asset } from "./schema.ts";

const ID_RE = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;

export function voiceNameOf(asset: Pick<Asset, "id" | "label">): string {
  return (asset.label ?? asset.id).trim();
}

/** Agent 跟随用的默认 id。人只看名称。 */
export function voiceIdFromName(name: string, taken: string[] = []): string {
  const ascii = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const base =
    ascii && ID_RE.test(ascii) ? (ascii.startsWith("voice.") ? ascii : `voice.${ascii}`) : "voice.pack";
  if (!taken.includes(base)) return base;
  for (let n = 2; n < 1000; n++) {
    const next = `${base}-${n}`;
    if (!taken.includes(next)) return next;
  }
  throw new Error("无法分配音色 id");
}

export function allocateNewVoice(name: string, root = weaverRoot()): { id: string; label: string } {
  const label = name.trim();
  if (!label) throw new Error("先写名称");
  const voices = loadLibrary(root).filter((item) => item.kind === "voice");
  if (voices.some((item) => voiceNameOf(item) === label)) throw new Error(`${label} 已在音色库里`);
  return { id: voiceIdFromName(label, voices.map((item) => item.id)), label };
}

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

export type KeepLibraryVoiceInput = {
  id?: string;
  sourceAbs: string;
  origin?: VoiceOrigin;
  label?: string;
  said?: string;
  style?: string;
};

export function voiceKeepRel(id: string, current?: string): string {
  return current || path.posix.join("voices", `${id}.wav`);
}

export function upsertVoicePack(
  input: { id: string; label?: string; style?: string },
  root = weaverRoot(),
): Asset {
  if (!ID_RE.test(input.id)) throw new Error("资产 id 必须是 dotted/kebab 小写");
  const current = loadLibrary(root).find((item) => item.id === input.id);
  if (current && current.kind !== "voice") throw new Error(`${input.id} 不是音色`);
  const source = voiceCloneSource(current);
  return upsertLibraryAsset(
    {
      id: input.id,
      kind: "voice",
      label: input.label ?? current?.label ?? input.id,
      style: input.style ?? source.instruct,
      file: source.file,
      text: current?.text ?? source.said,
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

export function keepLibraryVoice(
  input: KeepLibraryVoiceInput,
  root = weaverRoot(),
  transcribe?: TranscribeFn,
): Asset {
  assertReadableSource(input.sourceAbs, root);
  const assets = loadLibrary(root);
  const wantedName = (input.label ?? "").trim();
  let id = (input.id ?? "").trim();
  if (!id) {
    id = allocateNewVoice(wantedName, root).id;
  } else if (!ID_RE.test(id)) {
    throw new Error("资产 id 必须是 dotted/kebab 小写");
  } else if (wantedName) {
    const clash = assets.find((item) => item.kind === "voice" && item.id !== id && voiceNameOf(item) === wantedName);
    if (clash) throw new Error(`${wantedName} 已在音色库里`);
  }
  const current = assets.find((item) => item.id === id);
  if (current && current.kind !== "voice") throw new Error(`${id} 不是音色`);
  const source = voiceCloneSource(current);
  const origin: VoiceOrigin = input.origin ?? (input.style?.trim() ? "instruct" : "upload");
  const rel = voiceKeepRel(id, source.file);
  const dest = path.join(libraryRoot(root), rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  if (path.resolve(input.sourceAbs) !== path.resolve(dest)) {
    fs.copyFileSync(input.sourceAbs, dest);
  }
  return upsertLibraryAsset(
    {
      id,
      kind: "voice",
      label: wantedName || current?.label || id,
      file: rel,
      text: ensureVoiceSaid(input.sourceAbs, input.said, root, transcribe),
      style: origin === "instruct" ? (input.style ?? source.instruct) : "",
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
