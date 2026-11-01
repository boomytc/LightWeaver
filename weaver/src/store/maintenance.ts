import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { z, Digest } from "../contracts/index.ts";
import { WeaverError } from "../contracts/errors.ts";
import { Store, now, newId, canonical } from "./index.ts";

const BlobMetadataSchema = z.object({
  digest: Digest,
  bytes: z.number().int().nonnegative().safe(),
  mime: z.string(),
});
const BackupReceipt = z.object({
  schemaVersion: z.literal(2),
  createdAt: z.string(),
  database: z.literal("state.sqlite3"),
  blobs: z.array(BlobMetadataSchema),
});

type BlobMetadata = z.infer<typeof BlobMetadataSchema>;

function readReferencedBlobs(database: Database.Database): BlobMetadata[] {
  try {
    const missing = z
      .array(z.object({ digest: Digest }))
      .parse(
        database
          .prepare(
            "SELECT DISTINCT r.digest FROM blob_refs r LEFT JOIN blobs b ON b.digest=r.digest WHERE b.digest IS NULL ORDER BY r.digest",
          )
          .all(),
      );
    if (missing.length)
      throw new WeaverError(
        "INTEGRITY_FAILED",
        "数据库 blob 引用缺少元数据",
        { digests: missing.map((row) => row.digest) },
      );
    return z
      .array(BlobMetadataSchema)
      .parse(
        database
          .prepare(
            "SELECT DISTINCT r.digest AS digest,b.bytes,b.mime FROM blob_refs r JOIN blobs b ON b.digest=r.digest ORDER BY r.digest",
          )
          .all(),
      );
  } catch (error) {
    if (error instanceof WeaverError) throw error;
    throw new WeaverError(
      "INTEGRITY_FAILED",
      "无法读取数据库 blob 引用",
      { cause: error instanceof Error ? error.message : String(error) },
    );
  }
}

export async function backup(store: Store, destination?: string) {
  const dest = path.resolve(
    destination || path.join(store.root, "backups", newId("backup")),
  );
  if (fs.existsSync(dest) && fs.readdirSync(dest).length)
    throw new WeaverError("INVALID_INPUT", "备份目标必须为空目录");
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const staging = fs.mkdtempSync(`${dest}.partial-`);
  const lockId = newId("backup-pin");
  store.db.prepare("INSERT INTO pins VALUES(?,?)").run(
    lockId,
    canonical({
      kind: "backup-in-progress",
      pid: process.pid,
      createdAt: now(),
    }),
  );
  try {
    await store.db.backup(path.join(staging, "state.sqlite3"));
    const snapshot = new Database(path.join(staging, "state.sqlite3"), {
      readonly: true,
    });
    let blobs: z.infer<typeof BackupReceipt>["blobs"];
    try {
      blobs = readReferencedBlobs(snapshot);
    } finally {
      snapshot.close();
    }
    for (const blob of blobs) {
      if (!store.verifyBlob(blob.digest))
        throw new WeaverError("INTEGRITY_FAILED", "备份引用的 blob 缺失", blob);
      const rel = path.join(
          "blobs",
          blob.digest.slice(0, 2),
          blob.digest.slice(2),
        ),
        target = path.join(staging, rel);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(
        store.blobPath(blob.digest),
        target,
        fs.constants.COPYFILE_EXCL,
      );
    }
    const receipt = BackupReceipt.parse({
      schemaVersion: 2,
      createdAt: now(),
      database: "state.sqlite3",
      blobs,
    });
    fs.writeFileSync(path.join(staging, "backup.json"), canonical(receipt));
    fs.renameSync(staging, dest);
    return { directory: dest, receipt };
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
    store.db.prepare("DELETE FROM pins WHERE id=?").run(lockId);
  }
}
export function restore(source: string, destination: string) {
  const src = fs.realpathSync(source),
    dest = path.resolve(destination);
  if (fs.existsSync(dest) && fs.readdirSync(dest).length)
    throw new WeaverError(
      "INVALID_INPUT",
      "恢复目标必须为空目录，不能覆盖活动数据库",
    );
  const receipt = BackupReceipt.parse(
    JSON.parse(fs.readFileSync(path.join(src, "backup.json"), "utf8")),
  );
  const dbFile = path.join(src, receipt.database);
  let check: Database.Database;
  try {
    check = new Database(dbFile, { readonly: true });
  } catch (error) {
    throw new WeaverError(
      "INTEGRITY_FAILED",
      "备份数据库无法读取",
      { cause: error instanceof Error ? error.message : String(error) },
    );
  }
  let databaseBlobs: BlobMetadata[];
  try {
    if (check.pragma("integrity_check", { simple: true }) !== "ok")
      throw new WeaverError("INTEGRITY_FAILED", "备份数据库损坏");
    databaseBlobs = readReferencedBlobs(check);
  } catch (error) {
    if (error instanceof WeaverError) throw error;
    throw new WeaverError(
      "INTEGRITY_FAILED",
      "备份数据库无法读取",
      { cause: error instanceof Error ? error.message : String(error) },
    );
  } finally {
    check.close();
  }
  const manifest = new Map<BlobMetadata["digest"], BlobMetadata>();
  for (const blob of receipt.blobs) {
    if (manifest.has(blob.digest))
      throw new WeaverError(
        "INTEGRITY_FAILED",
        "备份清单包含重复 blob",
        { digest: blob.digest },
      );
    manifest.set(blob.digest, blob);
  }
  for (const blob of databaseBlobs) {
    const declared = manifest.get(blob.digest);
    if (!declared)
      throw new WeaverError(
        "INTEGRITY_FAILED",
        "备份清单遗漏数据库引用的 blob",
        { digest: blob.digest },
      );
    if (declared.bytes !== blob.bytes || declared.mime !== blob.mime)
      throw new WeaverError(
        "INTEGRITY_FAILED",
        "备份清单 blob 元数据与数据库不符",
        { manifest: declared, database: blob },
      );
    manifest.delete(blob.digest);
  }
  if (manifest.size)
    throw new WeaverError(
      "INTEGRITY_FAILED",
      "备份清单包含数据库未引用的 blob",
      { blobs: [...manifest.values()] },
    );
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const staging = fs.mkdtempSync(`${dest}.partial-`);
  try {
    fs.copyFileSync(dbFile, path.join(staging, "state.sqlite3"));
    const restored = new Store(staging);
    try {
      for (const blob of databaseBlobs) {
        const file = path.join(
          src,
          "blobs",
          blob.digest.slice(0, 2),
          blob.digest.slice(2),
        );
        const target = restored.blobPath(blob.digest);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        try {
          fs.copyFileSync(file, target, fs.constants.COPYFILE_EXCL);
          const copied = fs.statSync(target);
          if (!copied.isFile() || copied.size !== blob.bytes)
            throw new WeaverError(
              "INTEGRITY_FAILED",
              "备份 blob 文件大小不符",
              blob,
            );
          if (!restored.verifyBlob(blob.digest))
            throw new WeaverError(
              "INTEGRITY_FAILED",
              "备份 blob 摘要不符",
              blob,
            );
        } catch (error) {
          if (error instanceof WeaverError) throw error;
          throw new WeaverError(
            "INTEGRITY_FAILED",
            "备份 blob 文件缺失或无法读取",
            {
              digest: blob.digest,
              cause: error instanceof Error ? error.message : String(error),
            },
          );
        }
      }
      restored.releaseAbandonedOperations(true);
    } finally {
      restored.close();
    }
    fs.renameSync(staging, dest);
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
  return { directory: dest, blobs: databaseBlobs.length };
}
export function gc(store: Store, apply = false) {
  store.releaseAbandonedOperations();
  return store.transaction(() => {
    if (
      store.db
        .prepare(
          "SELECT 1 FROM pins WHERE json_extract(json,'$.kind') IN ('backup-in-progress','operation-in-progress')",
        )
        .get()
    )
      throw new WeaverError(
        "INVALID_INPUT",
        "有媒体操作或备份正在进行，稍后 GC",
      );
    const rows = z
      .array(z.object({ digest: Digest, bytes: z.number() }))
      .parse(
        store.db
          .prepare(
            "SELECT digest,bytes FROM blobs b WHERE NOT EXISTS(SELECT 1 FROM blob_refs r WHERE r.digest=b.digest)",
          )
          .all(),
      );
    if (apply)
      for (const r of rows) {
        fs.rmSync(store.blobPath(r.digest), { force: true });
        store.db
          .prepare(
            "DELETE FROM blobs WHERE digest=? AND NOT EXISTS(SELECT 1 FROM blob_refs WHERE digest=?)",
          )
          .run(r.digest, r.digest);
      }
    return {
      dryRun: !apply,
      unreferenced: rows,
      bytes: rows.reduce((n, r) => n + r.bytes, 0),
      protects: [
        "all revisions",
        "library versions",
        "runs",
        "pins",
        "deliveries",
        "verified artifacts",
      ],
    };
  });
}
