import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { z, Digest } from "../contracts/index.ts";
import { WeaverError } from "../contracts/errors.ts";
import { Store, now, newId, canonical } from "./index.ts";

const BackupReceipt = z.object({
  schemaVersion: z.literal(2),
  createdAt: z.string(),
  database: z.literal("state.sqlite3"),
  blobs: z.array(
    z.object({ digest: Digest, bytes: z.number(), mime: z.string() }),
  ),
});
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
      blobs = z
        .array(
          z.object({ digest: Digest, bytes: z.number(), mime: z.string() }),
        )
        .parse(
          snapshot
            .prepare(
              "SELECT DISTINCT b.* FROM blobs b JOIN blob_refs r ON r.digest=b.digest ORDER BY b.digest",
            )
            .all(),
        );
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
  const dbFile = path.join(src, receipt.database),
    check = new Database(dbFile, { readonly: true });
  try {
    if (check.pragma("integrity_check", { simple: true }) !== "ok")
      throw new WeaverError("INTEGRITY_FAILED", "备份数据库损坏");
  } finally {
    check.close();
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const staging = fs.mkdtempSync(`${dest}.partial-`);
  try {
    fs.copyFileSync(dbFile, path.join(staging, "state.sqlite3"));
    const restored = new Store(staging);
    try {
      for (const blob of receipt.blobs) {
        const file = path.join(
          src,
          "blobs",
          blob.digest.slice(0, 2),
          blob.digest.slice(2),
        );
        const target = restored.blobPath(blob.digest);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.copyFileSync(file, target);
        if (!restored.verifyBlob(blob.digest))
          throw new WeaverError("INTEGRITY_FAILED", "备份 blob 校验失败", blob);
      }
      restored.releaseAbandonedOperations(true);
    } finally {
      restored.close();
    }
    fs.renameSync(staging, dest);
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
  return { directory: dest, blobs: receipt.blobs.length };
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
