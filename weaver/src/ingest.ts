import fs from "node:fs";
import path from "node:path";
import { addAsset, loadLibrary, upsertLibraryAsset, voiceCloneSource } from "./assets.ts";
import { safeJoin } from "./io.ts";
import { isMaterialKind, allocateNewMaterial } from "./library-material.ts";
import { libraryRoot, weaverRoot } from "./paths.ts";
import type { Asset } from "./schema.ts";
import { allocateNewVoice } from "./voice-mint.ts";

export type IngestUploadInput = {
  scope: "library";
  kind: string;
  id?: string;
  locale?: string;
  label?: string;
  text?: string;
  style?: string;
  filename?: string;
  mime?: string;
  buffer: Uint8Array;
  root?: string;
};

export function guessExt(mime = ""): string {
  if (mime.includes("png")) return ".png";
  if (mime.includes("jpeg")) return ".jpg";
  if (mime.includes("wav")) return ".wav";
  if (mime.includes("svg")) return ".svg";
  if (mime.includes("mp4")) return ".mp4";
  return "";
}

export function folderFor(kind: string, locale?: string): string {
  if (kind === "voice") return "voices";
  if (kind === "still") return locale ? `assets/stills/${locale}` : "assets/stills";
  if (kind === "reference") return "assets/references";
  if (kind === "element") return "elements";
  if (kind === "line") return locale ? `assets/lines/${locale}` : "assets/lines";
  if (kind === "output") return "assets/outputs";
  if (kind === "video") return "assets/source";
  if (kind === "transcript") return "assets/transcripts";
  if (kind === "description") return "assets/descriptions";
  return "assets/misc";
}

export function destRel(kind: string, id: string, locale: string | undefined, ext: string): string {
  const safe = id.replace(/[^a-z0-9.-]+/gi, "-");
  if (kind === "voice") return locale ? `voices/${safe}-${locale}${ext}` : `voices/${safe}${ext}`;
  if (kind === "video") {
    const leaf = safe.replace(/^video\./, "") || safe;
    return path.posix.join("assets/source", `${leaf}${ext}`);
  }
  const folder = folderFor(kind, locale);
  const leaf = isMaterialKind(kind) ? safe.replace(new RegExp(`^${kind}\\.`), "") || safe : safe;
  return path.posix.join(folder, `${leaf}${ext}`);
}

export function ingestUpload(input: IngestUploadInput): Asset {
  const root = input.root ?? weaverRoot();
  const kind = input.kind;
  const locale = input.locale || undefined;
  const label = input.label;
  const text = input.text;
  const style = input.style;
  if (!input.buffer.byteLength) throw new Error("缺少文件");
  let id = (input.id ?? "").trim();
  if (kind === "method") {
    throw new Error("方法进库要写 methods/ 下的配方并登记，不要当文件上传");
  }
  if (kind === "voice" && !id) {
    id = allocateNewVoice(label ?? "", root).id;
  }
  if (isMaterialKind(kind) && !id) {
    id = allocateNewMaterial(kind, label ?? "", root).id;
  }
  if (!id) throw new Error("缺少资产 id");

  const ext = path.extname(input.filename || "") || guessExt(input.mime);
  const rel = destRel(kind, id, locale, ext);

  const existing = loadLibrary(root).find((asset) => asset.id === id);
  if (kind === "voice") {
    const source = voiceCloneSource(existing);
    const cloneRel = source.file ?? `voices/${id.replace(/[^a-z0-9.-]+/gi, "-")}${ext}`;
    const dest = safeJoin(libraryRoot(root), cloneRel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, input.buffer);
    return upsertLibraryAsset(
      {
        id,
        kind: "voice",
        label: label ?? existing?.label ?? id,
        file: cloneRel,
        text: text ?? source.said,
        style: "",
      },
      root,
    );
  }
  const dest = safeJoin(libraryRoot(root), rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, input.buffer);
  if (existing) {
    return upsertLibraryAsset(
      {
        ...existing,
        kind: kind as Asset["kind"],
        locale: locale ?? existing.locale,
        file: rel,
        text: text ?? existing.text,
        style: style ?? existing.style,
        label: label ?? existing.label,
      },
      root,
    );
  }
  return addAsset({ kind: "library" }, { id, kind, locale, file: rel, text, style, label }, root);
}
