import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { z, Digest, Id } from "../contracts/index.ts";
import { WeaverError } from "../contracts/errors.ts";
import { fileBytesDigest, newId } from "../store/index.ts";
import type { Store } from "../store/index.ts";
import type { Builds } from "./build.ts";

function isErrno(error: unknown, code: string): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    Reflect.get(error, "code") === code
  );
}

export const ExportVideoOptionsSchema = z.strictObject({
  projectId: Id,
  destination: z
    .string()
    .min(1)
    .refine(
      (value) => path.isAbsolute(value) && !value.includes("\0"),
      "导出目标必须是绝对路径",
    ),
  deliveryId: Id.optional(),
});

export type ExportVideoOptions = z.infer<typeof ExportVideoOptionsSchema>;

export type ExportVideoInput = ExportVideoOptions & {
  store: Store;
  builds: Builds;
};

export const ExportVideoResultSchema = z.strictObject({
  file: z.string(),
  digest: Digest,
  deliveryId: Id,
  state: z.enum(["current", "stale", "historical"]),
});
export type ExportVideoResult = z.infer<typeof ExportVideoResultSchema>;

async function canonicalDestination(destination: string): Promise<string> {
  const requested = path.resolve(destination),
    name = path.basename(requested);
  if (!name)
    throw new WeaverError("INVALID_INPUT", "导出目标必须是文件路径");
  await fsp.mkdir(path.dirname(requested), { recursive: true });
  const parent = await fsp.realpath(path.dirname(requested));
  if (!(await fsp.stat(parent)).isDirectory())
    throw new WeaverError("INVALID_INPUT", "导出目标目录无效");
  return path.join(parent, name);
}

async function targetExists(target: string): Promise<boolean> {
  try {
    await fsp.lstat(target);
    return true;
  } catch (error) {
    if (isErrno(error, "ENOENT")) return false;
    throw error;
  }
}

export function publishFileWithoutOverwrite(
  staged: string,
  target: string,
): void {
  try {
    fs.linkSync(staged, target);
  } catch (error) {
    if (isErrno(error, "EEXIST"))
      throw new WeaverError(
        "INVALID_INPUT",
        "导出目标已存在，选择新文件",
        { destination: target },
      );
    if (
      ["EPERM", "ENOTSUP", "EOPNOTSUPP", "EXDEV"].some((code) =>
        isErrno(error, code),
      )
    )
      throw new WeaverError(
        "INVALID_INPUT",
        "导出目录不支持原子且不覆盖的文件发布",
        { destination: target },
      );
    throw error;
  }
}

export async function exportVideo(
  input: ExportVideoInput,
): Promise<ExportVideoResult> {
  const { store, builds, ...options } = input;
  const { projectId, destination, deliveryId } =
    ExportVideoOptionsSchema.parse(options);
  const deliveries = await builds.deliveries(projectId);
  const delivery = deliveries.find((item) =>
    deliveryId ? item.id === deliveryId : item.state === "current",
  );
  if (!delivery) {
    if (deliveryId)
      throw new WeaverError("NOT_FOUND", "找不到指定交付", {
        projectId,
        deliveryId,
      });
    throw new WeaverError(
      "BUILD_ISSUES",
      "没有可导出的 current 视频交付",
      { projectId },
      ["先完成当前修订的制作，或用 --delivery 显式选择历史交付"],
    );
  }
  if (delivery.state === "missing")
    throw new WeaverError(
      "INTEGRITY_FAILED",
      "交付文件缺失或不完整",
      {
        projectId,
        deliveryId: delivery.id,
        state: delivery.state,
      },
    );
  const video = delivery.artifacts.video;
  if (!video)
    throw new WeaverError("BUILD_ISSUES", "交付没有视频文件", {
      projectId,
      deliveryId: delivery.id,
    });
  if (!store.verifyBlob(video))
    throw new WeaverError("INTEGRITY_FAILED", "视频摘要校验失败", {
      projectId,
      deliveryId: delivery.id,
      digest: video,
    });

  const target = await canonicalDestination(destination);
  if (await targetExists(target))
    throw new WeaverError(
      "INVALID_INPUT",
      "导出目标已存在，选择新文件",
      { destination: target },
    );

  const staged = path.join(
      path.dirname(target),
      `.lightweaver-${newId("partial")}.mp4`,
    ),
    source = store.blobPath(video);
  try {
    await fsp.copyFile(source, staged, fs.constants.COPYFILE_EXCL);
    if (fileBytesDigest(staged) !== video)
      throw new WeaverError("INTEGRITY_FAILED", "导出副本摘要不匹配", {
        projectId,
        deliveryId: delivery.id,
        digest: video,
      });
    const handle = await fsp.open(staged, "r");
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
    publishFileWithoutOverwrite(staged, target);
    return ExportVideoResultSchema.parse({
      file: target,
      digest: video,
      deliveryId: delivery.id,
      state: delivery.state,
    });
  } finally {
    await fsp.rm(staged, { force: true }).catch(() => undefined);
  }
}
