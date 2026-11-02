import fs from "node:fs";
import path from "node:path";
import { gunzipSync, inflateRawSync } from "node:zlib";
import { WeaverError } from "../contracts/errors.ts";

/**
 * 引擎归档解压。只接受 tar.gz 与 zip，成员路径必须是安装目录内的相对路径；
 * 拒绝绝对路径、`..`、越界软链和未知成员类型，避免把发布包内容写到别处。
 */
export type ArchiveFormat = "tar.gz" | "zip";

function unsafe(member: string, reason: string): WeaverError {
  return new WeaverError("ENGINE_ARCHIVE_INVALID", "引擎归档包含不安全成员", {
    member,
    reason,
  });
}

function memberPath(root: string, member: string): string {
  const normalized = member.split("\\").join("/");
  if (
    !normalized ||
    normalized.startsWith("/") ||
    /^[a-zA-Z]:\//.test(normalized) ||
    normalized.includes("\u0000")
  )
    throw unsafe(member, "必须是归档内的相对路径");
  const parts = normalized.split("/").filter((part) => part && part !== ".");
  if (parts.includes("..")) throw unsafe(member, "不能包含上级目录");
  const resolved = path.resolve(root, ...parts);
  const base = path.resolve(root);
  if (resolved !== base && !resolved.startsWith(base + path.sep))
    throw unsafe(member, "解析后越出安装目录");
  return resolved;
}

function linkTarget(root: string, member: string, target: string): string {
  if (!target || target.includes("\u0000")) throw unsafe(member, "软链目标无效");
  const normalized = target.split("\\").join("/");
  if (normalized.startsWith("/") || /^[a-zA-Z]:\//.test(normalized))
    throw unsafe(member, "软链目标必须是相对路径");
  const resolved = path.resolve(path.dirname(memberPath(root, member)), normalized);
  const base = path.resolve(root);
  if (resolved !== base && !resolved.startsWith(base + path.sep))
    throw unsafe(member, "软链目标越出安装目录");
  return normalized;
}

function writeFile(file: string, content: Buffer, mode: number): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, { mode: mode || 0o644 });
  if (mode) fs.chmodSync(file, mode);
}

function tarString(block: Buffer, offset: number, length: number): string {
  const raw = block.subarray(offset, offset + length);
  const end = raw.indexOf(0);
  return raw.toString("utf8", 0, end === -1 ? raw.length : end);
}

function tarOctal(block: Buffer, offset: number, length: number): number {
  const raw = tarString(block, offset, length).trim();
  if (!raw) return 0;
  const value = Number.parseInt(raw, 8);
  return Number.isFinite(value) ? value : 0;
}

type PendingHeader = {
  path?: string;
  linkpath?: string;
  size?: number;
};

function paxFields(content: Buffer): PendingHeader {
  const fields: PendingHeader = {};
  for (const line of content.toString("utf8").split("\n")) {
    const match = /^\d+ ([a-zA-Z]+)=(.*)$/.exec(line);
    if (!match) continue;
    if (match[1] === "path") fields.path = match[2];
    else if (match[1] === "linkpath") fields.linkpath = match[2];
    else if (match[1] === "size") {
      const size = Number(match[2]);
      if (Number.isFinite(size)) fields.size = size;
    }
  }
  return fields;
}

export function extractTarGz(archive: string, root: string): number {
  const tar = gunzipSync(fs.readFileSync(archive));
  let offset = 0,
    count = 0,
    pending: PendingHeader = {};
  const resolveTarget = (name: string, target: string) => {
    const member = name.startsWith("/") ? name.slice(1) : name;
    return { member, destination: memberPath(root, member), target: linkTarget(root, member, target) };
  };
  while (offset + 512 <= tar.length) {
    const block = tar.subarray(offset, offset + 512);
    if (block.every((byte) => byte === 0)) break;
    const size = pending.size ?? tarOctal(block, 124, 12),
      type = String.fromCharCode(block[156] || 0x30),
      contentStart = offset + 512,
      contentEnd = contentStart + size;
    if (size < 0 || contentEnd > tar.length)
      throw new WeaverError("ENGINE_ARCHIVE_INVALID", "引擎归档已截断");
    const content = tar.subarray(contentStart, contentEnd);
    if (type === "x") pending = { ...pending, ...paxFields(content) };
    else if (type === "g") pending = pending;
    else if (type === "L") pending = { ...pending, path: tarString(content, 0, content.length) };
    else if (type === "K") pending = { ...pending, linkpath: tarString(content, 0, content.length) };
    else {
      const headerName = tarString(block, 0, 100),
        prefix = tarString(block, 345, 155);
      const name = pending.path ?? (prefix ? `${prefix}/${headerName}` : headerName),
        headerLink = pending.linkpath ?? tarString(block, 157, 100);
      pending = {};
      if (!name) throw new WeaverError("ENGINE_ARCHIVE_INVALID", "引擎归档成员缺少路径");
      if (type === "0" || type === "\u0000" || type === "7") {
        writeFile(memberPath(root, name), Buffer.from(content), tarOctal(block, 100, 8) & 0o777);
        count += 1;
      } else if (type === "5") {
        fs.mkdirSync(memberPath(root, name), { recursive: true, mode: 0o755 });
      } else if (type === "2") {
        const resolved = resolveTarget(name, headerLink);
        fs.mkdirSync(path.dirname(resolved.destination), { recursive: true });
        fs.symlinkSync(resolved.target, resolved.destination);
        count += 1;
      } else if (type === "1") {
        const source = memberPath(root, headerLink);
        if (!fs.existsSync(source))
          throw new WeaverError("ENGINE_ARCHIVE_INVALID", "引擎归档硬链接缺少源文件", { member: name });
        fs.mkdirSync(path.dirname(memberPath(root, name)), { recursive: true });
        fs.linkSync(source, memberPath(root, name));
        count += 1;
      } else throw new WeaverError("ENGINE_ARCHIVE_INVALID", "引擎归档包含不支持的成员类型", { member: name, type });
    }
    offset = contentStart + Math.ceil(size / 512) * 512;
  }
  return count;
}

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1)
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[index] = value;
  }
  return table;
})();

function crc32(content: Buffer): number {
  let value = -1;
  for (const byte of content) value = CRC_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ -1) >>> 0;
}

function zipEocd(buffer: Buffer): { count: number; directorySize: number; directoryOffset: number } {
  const start = Math.max(0, buffer.length - 66_000);
  for (let offset = buffer.length - 22; offset >= start; offset -= 1) {
    if (buffer.readUInt32LE(offset) !== 0x06054b50) continue;
    const count = buffer.readUInt16LE(offset + 10),
      size = buffer.readUInt32LE(offset + 12),
      directory = buffer.readUInt32LE(offset + 16);
    if (count === 0xffff || size === 0xffffffff || directory === 0xffffffff)
      throw new WeaverError("ENGINE_ARCHIVE_INVALID", "不支持 ZIP64 引擎归档");
    return { count, directorySize: size, directoryOffset: directory };
  }
  throw new WeaverError("ENGINE_ARCHIVE_INVALID", "不是有效的 zip 引擎归档");
}

export function extractZip(archive: string, root: string): number {
  const buffer = fs.readFileSync(archive);
  const eocd = zipEocd(buffer);
  let offset = eocd.directoryOffset,
    count = 0;
  for (let index = 0; index < eocd.count; index += 1) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== 0x02014b50)
      throw new WeaverError("ENGINE_ARCHIVE_INVALID", "引擎 zip 中央目录无效");
    const madeBy = buffer.readUInt16LE(offset + 4) >> 8,
      flags = buffer.readUInt16LE(offset + 8),
      compression = buffer.readUInt16LE(offset + 10),
      expectedCrc = buffer.readUInt32LE(offset + 16),
      compressedSize = buffer.readUInt32LE(offset + 20),
      uncompressedSize = buffer.readUInt32LE(offset + 24),
      nameLength = buffer.readUInt16LE(offset + 28),
      extraLength = buffer.readUInt16LE(offset + 30),
      commentLength = buffer.readUInt16LE(offset + 32),
      external = buffer.readUInt32LE(offset + 38),
      localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString("utf8", offset + 46, offset + 46 + nameLength);
    offset += 46 + nameLength + extraLength + commentLength;
    if (flags & 0x1)
      throw new WeaverError("ENGINE_ARCHIVE_INVALID", "不支持加密的 zip 引擎归档", { member: name });
    if (name.endsWith("/")) {
      fs.mkdirSync(memberPath(root, name.replace(/\/+$/, "")), { recursive: true, mode: 0o755 });
      continue;
    }
    if (localOffset + 30 > buffer.length || buffer.readUInt32LE(localOffset) !== 0x04034b50)
      throw new WeaverError("ENGINE_ARCHIVE_INVALID", "引擎 zip 本地头无效", { member: name });
    const localName = buffer.readUInt16LE(localOffset + 26),
      localExtra = buffer.readUInt16LE(localOffset + 28),
      dataStart = localOffset + 30 + localName + localExtra,
      dataEnd = dataStart + compressedSize;
    if (dataEnd > buffer.length)
      throw new WeaverError("ENGINE_ARCHIVE_INVALID", "引擎归档已截断", { member: name });
    const raw = buffer.subarray(dataStart, dataEnd),
      content = compression === 0 ? raw : compression === 8 ? inflateRawSync(raw) : undefined;
    if (!content)
      throw new WeaverError("ENGINE_ARCHIVE_INVALID", "引擎 zip 使用了不支持的压缩方式", {
        member: name,
        compression,
      });
    if (content.length !== uncompressedSize || crc32(content) !== expectedCrc)
      throw new WeaverError("ENGINE_ARCHIVE_INVALID", "引擎 zip 成员校验失败", { member: name });
    const unixMode = madeBy === 3 || madeBy === 19 ? (external >>> 16) & 0xffff : 0,
      destination = memberPath(root, name);
    if ((unixMode & 0o170000) === 0o120000) {
      const target = content.toString("utf8");
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.symlinkSync(linkTarget(root, name, target), destination);
    } else {
      const mode = unixMode & 0o777;
      writeFile(destination, Buffer.from(content), mode);
    }
    count += 1;
  }
  return count;
}

export function extractArchive(input: {
  archive: string;
  format: ArchiveFormat;
  root: string;
}): number {
  fs.rmSync(input.root, { recursive: true, force: true });
  fs.mkdirSync(input.root, { recursive: true, mode: 0o700 });
  return input.format === "zip"
    ? extractZip(input.archive, input.root)
    : extractTarGz(input.archive, input.root);
}
