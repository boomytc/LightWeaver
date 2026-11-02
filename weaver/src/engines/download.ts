import fs from "node:fs";
import fsp from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { WeaverError } from "../contracts/errors.ts";

/**
 * 下载固定大小的引擎产物并边写边校验 SHA-256。目标文件由调用方放进本次
 * 作业的暂存区，校验通过后才由安装服务发布；取消或失败不会留下半成品。
 */
export async function downloadArtifact(input: {
  url: string;
  size: number;
  sha256: string;
  destination: string;
  signal: AbortSignal;
  onProgress?: (received: number, total: number) => void;
}): Promise<void> {
  let response: Response;
  try {
    response = await fetch(input.url, { signal: input.signal, redirect: "follow" });
  } catch {
    if (input.signal.aborted)
      throw new WeaverError("CANCELLED", "引擎下载已取消");
    throw new WeaverError("NETWORK_ERROR", "引擎下载请求失败", null, [], true);
  }
  if (!response.ok || !response.body) {
    await response.body?.cancel().catch(() => undefined);
    throw new WeaverError(
      "NETWORK_ERROR",
      `引擎下载返回 HTTP ${response.status}`,
      { status: response.status },
      [],
      response.status === 429 || response.status >= 500,
    );
  }
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > 0 && declared !== input.size) {
    await response.body.cancel().catch(() => undefined);
    throw new WeaverError("ENGINE_SIZE_MISMATCH", "下载响应大小与引擎发布清单不一致", {
      expected: input.size,
      actual: declared,
    });
  }
  const reader = response.body.getReader(),
    hash = createHash("sha256");
  let handle: FileHandle | undefined,
    received = 0,
    reportedAt = 0;
  try {
    await fsp.mkdir(path.dirname(input.destination), { recursive: true, mode: 0o700 });
    handle = await fsp.open(input.destination, "wx", 0o600);
    while (true) {
      input.signal.throwIfAborted();
      const chunk = await reader.read();
      if (chunk.done) break;
      received += chunk.value.byteLength;
      if (received > input.size)
        throw new WeaverError("ENGINE_SIZE_MISMATCH", "下载内容超过引擎发布大小", {
          expected: input.size,
          actual: received,
        });
      hash.update(chunk.value);
      await handle.write(chunk.value);
      if (input.onProgress && Date.now() - reportedAt >= 250) {
        reportedAt = Date.now();
        input.onProgress(received, input.size);
      }
    }
    await handle.sync();
  } catch (error) {
    if (input.signal.aborted)
      throw new WeaverError("CANCELLED", "引擎下载已取消");
    throw error;
  } finally {
    await handle?.close().catch(() => undefined);
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
  const actual = hash.digest("hex");
  if (received !== input.size || actual !== input.sha256)
    throw new WeaverError("ENGINE_VERIFY_FAILED", "引擎下载文件完整性校验失败", {
      expectedSize: input.size,
      actualSize: received,
      expectedSha256: input.sha256,
      actualSha256: actual,
    });
  input.onProgress?.(received, input.size);
  if (fs.existsSync(input.destination)) fs.chmodSync(input.destination, 0o600);
}
