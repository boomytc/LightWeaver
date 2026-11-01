import { AsyncLocalStorage } from "node:async_hooks";
import Database from "better-sqlite3";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";
import { Transform } from "node:stream";
import { z, Digest, Id } from "../contracts/index.ts";
import { WeaverError } from "../contracts/errors.ts";

export function canonical(value: unknown): string {
  if (value === null || typeof value !== "object")
    return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.entries(value)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b, "en"))
    .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
    .join(",")}}`;
}
export function digest(value: unknown): z.infer<typeof Digest> {
  return Digest.parse(
    createHash("sha256").update(canonical(value)).digest("hex"),
  );
}
export function bytesDigest(
  value: Uint8Array | string,
): z.infer<typeof Digest> {
  return Digest.parse(createHash("sha256").update(value).digest("hex"));
}
export function fileBytesDigest(file: string): z.infer<typeof Digest> {
  const fd = fs.openSync(file, "r"),
    hash = createHash("sha256"),
    buffer = Buffer.allocUnsafe(1024 * 1024);
  try {
    let length: number;
    while ((length = fs.readSync(fd, buffer)) > 0)
      hash.update(buffer.subarray(0, length));
    return Digest.parse(hash.digest("hex"));
  } finally {
    fs.closeSync(fd);
  }
}
export function newId(prefix: string): string {
  return `${prefix}-${randomUUID()}`;
}
export const now = () => new Date().toISOString();
const JsonRow = z.object({ json: z.string() });

const integrityCache = new Map<string, string>();
export class Store {
  private owners = new AsyncLocalStorage<string>();
  readonly db: Database.Database;
  readonly root: string;
  constructor(
    root = process.env.LIGHTWEAVER_DATA_DIR ||
      fileURLToPath(new URL("../../../data/.weaver", import.meta.url)),
  ) {
    fs.mkdirSync(root, { recursive: true });
    this.root = fs.realpathSync(root);
    for (const dir of ["blobs", "work", "materialized", "backups"]) {
      fs.mkdirSync(path.join(this.root, dir), { recursive: true });
      if (
        fs.realpathSync(path.join(this.root, dir)) !== path.join(this.root, dir)
      )
        throw new WeaverError("INVALID_INPUT", "内容存储目录不能是软链", {
          dir,
        });
    }
    this.db = new Database(path.join(this.root, "state.sqlite3"));
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.db.pragma("busy_timeout = 10000");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
      INSERT OR IGNORE INTO schema_migrations VALUES(1, strftime('%Y-%m-%dT%H:%M:%fZ','now'));
      CREATE TABLE IF NOT EXISTS blobs(digest TEXT PRIMARY KEY, bytes INTEGER NOT NULL, mime TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS blob_refs(owner TEXT NOT NULL, digest TEXT NOT NULL REFERENCES blobs(digest), PRIMARY KEY(owner,digest));
      CREATE TABLE IF NOT EXISTS projects(id TEXT PRIMARY KEY, head TEXT NOT NULL, deleted INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS revisions(id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), parent TEXT, digest TEXT NOT NULL, json TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS revisions_project ON revisions(project_id);
      CREATE TABLE IF NOT EXISTS assets(asset_id TEXT NOT NULL, version TEXT NOT NULL, json TEXT NOT NULL, PRIMARY KEY(asset_id,version));
      CREATE TABLE IF NOT EXISTS library_items(id TEXT PRIMARY KEY, head TEXT NOT NULL, deleted INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS library_versions(item_id TEXT NOT NULL REFERENCES library_items(id), version TEXT NOT NULL, json TEXT NOT NULL, PRIMARY KEY(item_id,version));
      CREATE TABLE IF NOT EXISTS requests(scope TEXT NOT NULL, id TEXT NOT NULL, fingerprint TEXT NOT NULL, result TEXT NOT NULL, PRIMARY KEY(scope,id));
      CREATE TABLE IF NOT EXISTS artifacts(id TEXT PRIMARY KEY, operation TEXT NOT NULL, cache_key TEXT NOT NULL, generation TEXT NOT NULL, digest TEXT NOT NULL REFERENCES blobs(digest), verified INTEGER NOT NULL, json TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS artifacts_cache ON artifacts(cache_key,generation,verified);
      CREATE TABLE IF NOT EXISTS runs(id TEXT PRIMARY KEY, project_id TEXT, kind TEXT NOT NULL, state TEXT NOT NULL, snapshot_digest TEXT NOT NULL REFERENCES blobs(digest), cancel_requested INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, error TEXT);
      CREATE TABLE IF NOT EXISTS nodes(id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES runs(id), key TEXT NOT NULL, state TEXT NOT NULL, token TEXT, lease_until INTEGER, attempts INTEGER NOT NULL DEFAULT 0, next_at INTEGER NOT NULL DEFAULT 0, result TEXT, error TEXT, UNIQUE(run_id,key));
      CREATE TABLE IF NOT EXISTS attempts(token TEXT PRIMARY KEY, node_id TEXT NOT NULL REFERENCES nodes(id), ordinal INTEGER NOT NULL, state TEXT NOT NULL, started_at TEXT NOT NULL, finished_at TEXT, result TEXT, error TEXT, remote_capabilities TEXT);
      CREATE TABLE IF NOT EXISTS events(seq INTEGER PRIMARY KEY AUTOINCREMENT, run_id TEXT NOT NULL REFERENCES runs(id), type TEXT NOT NULL, data TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS targets(project_id TEXT NOT NULL, target TEXT NOT NULL, generation INTEGER NOT NULL, fingerprint TEXT NOT NULL, run_id TEXT NOT NULL, PRIMARY KEY(project_id,target));
      CREATE TABLE IF NOT EXISTS deliveries(id TEXT PRIMARY KEY, project_id TEXT NOT NULL, revision_id TEXT NOT NULL, run_id TEXT NOT NULL, target TEXT NOT NULL, generation INTEGER NOT NULL, fingerprint TEXT NOT NULL, json TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS current_deliveries(project_id TEXT NOT NULL, target TEXT NOT NULL, delivery_id TEXT NOT NULL REFERENCES deliveries(id), PRIMARY KEY(project_id,target));
      CREATE TABLE IF NOT EXISTS proposals(id TEXT PRIMARY KEY, project_id TEXT NOT NULL, json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS analysis(id TEXT PRIMARY KEY, project_id TEXT NOT NULL, source_key TEXT NOT NULL, kind TEXT NOT NULL, start_us INTEGER NOT NULL, duration_us INTEGER NOT NULL, model TEXT NOT NULL, json TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS analysis_lookup ON analysis(project_id,source_key,kind,start_us);
      CREATE TABLE IF NOT EXISTS migration_journals(id TEXT PRIMARY KEY, state TEXT NOT NULL, json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS pins(id TEXT PRIMARY KEY, json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS node_receipts(node_id TEXT NOT NULL, token TEXT PRIMARY KEY, json TEXT NOT NULL);
    `);
    for (const table of [
      "revisions",
      "assets",
      "library_versions",
      "artifacts",
      "deliveries",
    ]) {
      this.db.exec(
        `CREATE TRIGGER IF NOT EXISTS ${table}_immutable_update BEFORE UPDATE ON ${table} BEGIN SELECT RAISE(ABORT, 'immutable version'); END; CREATE TRIGGER IF NOT EXISTS ${table}_immutable_delete BEFORE DELETE ON ${table} BEGIN SELECT RAISE(ABORT, 'immutable version'); END;`,
      );
    }
  }
  releaseAbandonedOperations(force = false): void {
    // Old pins did not contain an owner. Read row identity from SQLite instead.
    const rows = z
      .array(z.object({ id: z.string(), json: z.string() }))
      .parse(
        this.db
          .prepare(
            "SELECT id,json FROM pins WHERE json_extract(json,'$.kind') IN ('operation-in-progress','backup-in-progress')",
          )
          .all(),
      );
    for (const row of rows) {
      const pin = z
        .object({ pid: z.number().optional() })
        .parse(JSON.parse(row.json));
      if (!force && pin.pid) {
        try {
          process.kill(pin.pid, 0);
          continue;
        } catch (e) {
          if (!(e instanceof Error) || !("code" in e) || e.code !== "ESRCH")
            continue;
        }
      } else if (!force) continue;
      this.transaction(() => {
        if (row.id.startsWith("attempt:")) {
          this.db
            .prepare("UPDATE pins SET json=? WHERE id=?")
            .run(
              canonical({ kind: "recovery-pending", createdAt: now() }),
              row.id,
            );
        } else {
          this.db.prepare("DELETE FROM blob_refs WHERE owner=?").run(row.id);
          this.db.prepare("DELETE FROM pins WHERE id=?").run(row.id);
        }
      });
    }
  }
  async owned<T>(label: string, fn: () => Promise<T>): Promise<T> {
    const owner = `${label}:${newId("scope")}`;
    this.db.prepare("INSERT INTO pins VALUES(?,?)").run(
      owner,
      canonical({
        kind: "operation-in-progress",
        pid: process.pid,
        createdAt: now(),
      }),
    );
    try {
      return await this.owners.run(owner, fn);
    } finally {
      this.transaction(() => {
        this.db.prepare("DELETE FROM blob_refs WHERE owner=?").run(owner);
        this.db.prepare("DELETE FROM pins WHERE id=?").run(owner);
      });
    }
  }
  ownedSync<T>(label: string, fn: () => T): T {
    const owner = `${label}:${newId("scope")}`;
    this.db.prepare("INSERT INTO pins VALUES(?,?)").run(
      owner,
      canonical({
        kind: "operation-in-progress",
        pid: process.pid,
        createdAt: now(),
      }),
    );
    try {
      return this.owners.run(owner, fn);
    } finally {
      this.transaction(() => {
        this.db.prepare("DELETE FROM blob_refs WHERE owner=?").run(owner);
        this.db.prepare("DELETE FROM pins WHERE id=?").run(owner);
      });
    }
  }
  close(): void {
    this.db.close();
  }
  transaction<T>(fn: () => T): T {
    return this.db.transaction(fn).immediate();
  }
  readJson<T>(query: string, params: unknown[], schema: z.ZodType<T>): T {
    const row = this.db.prepare(query).get(...params);
    if (!row) throw new WeaverError("NOT_FOUND", "记录不存在");
    return schema.parse(JSON.parse(JsonRow.parse(row).json));
  }
  listJson<T>(query: string, params: unknown[], schema: z.ZodType<T>): T[] {
    return this.db
      .prepare(query)
      .all(...params)
      .map((row) => schema.parse(JSON.parse(JsonRow.parse(row).json)));
  }
  mutate<T>(
    scope: string,
    requestId: string,
    input: unknown,
    schema: z.ZodType<T>,
    fn: () => T,
  ): T {
    Id.parse(requestId);
    const fingerprint = digest(input);
    return this.transaction(() => {
      const prior = this.db
        .prepare(
          "SELECT fingerprint,result FROM requests WHERE scope=? AND id=?",
        )
        .get(scope, requestId);
      if (prior) {
        const r = z
          .object({ fingerprint: Digest, result: z.string() })
          .parse(prior);
        if (r.fingerprint !== fingerprint)
          throw new WeaverError(
            "REQUEST_ID_REUSED",
            "同一 requestId 对应不同请求",
            { requestId },
          );
        return schema.parse(JSON.parse(r.result));
      }
      const result = schema.parse(fn());
      this.db
        .prepare("INSERT INTO requests VALUES(?,?,?,?)")
        .run(scope, requestId, fingerprint, canonical(result));
      return result;
    });
  }
  request<T>(
    scope: string,
    requestId: string,
    input: unknown,
    schema: z.ZodType<T>,
  ): T | undefined {
    Id.parse(requestId);
    const row = this.db
      .prepare("SELECT fingerprint,result FROM requests WHERE scope=? AND id=?")
      .get(scope, requestId);
    if (!row) return undefined;
    const prior = z
      .object({ fingerprint: Digest, result: z.string() })
      .parse(row);
    if (prior.fingerprint !== digest(input))
      throw new WeaverError(
        "REQUEST_ID_REUSED",
        "同一 requestId 对应不同请求",
        { requestId },
      );
    return schema.parse(JSON.parse(prior.result));
  }
  pin(owner: string, value: unknown): void {
    const found = new Set<string>();
    const visit = (v: unknown): void => {
      if (typeof v === "string" && /^[a-f0-9]{64}$/.test(v)) found.add(v);
      else if (Array.isArray(v)) v.forEach(visit);
      else if (v && typeof v === "object") Object.values(v).forEach(visit);
    };
    visit(value);
    const insert = this.db.prepare(
      "INSERT OR IGNORE INTO blob_refs(owner,digest) SELECT ?,digest FROM blobs WHERE digest=?",
    );
    for (const d of found) insert.run(owner, d);
  }
  blobPath(value: string): string {
    const d = Digest.parse(value);
    const file = path.join(this.root, "blobs", d.slice(0, 2), d.slice(2));
    const parent = path.dirname(file);
    if (fs.existsSync(parent) && fs.realpathSync(parent) !== parent)
      throw new WeaverError("INVALID_INPUT", "内容存储路径不安全");
    if (fs.existsSync(file)) {
      const real = fs.realpathSync(file);
      if (real !== file || !real.startsWith(`${this.root}${path.sep}`))
        throw new WeaverError("INVALID_INPUT", "内容存储路径不安全");
    }
    return file;
  }
  private registerBlob(
    d: z.infer<typeof Digest>,
    bytes: number,
    mime: string,
  ): void {
    this.transaction(() => {
      this.db
        .prepare("INSERT OR IGNORE INTO blobs VALUES(?,?,?)")
        .run(d, bytes, mime);
      const owner = this.owners.getStore();
      if (owner)
        this.db
          .prepare("INSERT OR IGNORE INTO blob_refs VALUES(?,?)")
          .run(owner, d);
    });
  }
  private installBlob(temp: string, d: z.infer<typeof Digest>): void {
    const dest = this.blobPath(d);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.chmodSync(temp, 0o444);
    const fd = fs.openSync(temp, "r");
    try {
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    try {
      fs.linkSync(temp, dest);
    } catch (e) {
      if (!(e instanceof Error && "code" in e && e.code === "EEXIST")) throw e;
      if (!this.verifyBlob(d)) fs.renameSync(temp, dest);
    }
  }
  putBytes(
    value: Uint8Array | string,
    mime = "application/json",
  ): z.infer<typeof Digest> {
    const d = bytesDigest(value),
      temp = path.join(this.root, "work", newId("write"));
    try {
      fs.writeFileSync(temp, value, { flag: "wx" });
      this.installBlob(temp, d);
      this.registerBlob(d, Buffer.byteLength(value), mime);
      return d;
    } finally {
      fs.rmSync(temp, { force: true });
    }
  }
  putJson(value: unknown): z.infer<typeof Digest> {
    return this.putBytes(canonical(value));
  }
  async importFile(
    file: string,
    mime = "application/octet-stream",
  ): Promise<z.infer<typeof Digest>> {
    let source: string;
    try {
      source = await fsp.realpath(file);
      if (!(await fsp.stat(source)).isFile())
        throw new WeaverError("INVALID_INPUT", "素材必须是普通文件");
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT")
        throw new WeaverError("NOT_FOUND", `文件不存在：${file}`, undefined, ["检查文件路径，或重新选择文件。相对路径按命令的当前工作目录解析。"]);
      throw error;
    }
    const temp = path.join(this.root, "work", newId("import"));
    const hash = createHash("sha256");
    let bytes = 0;
    try {
      await pipeline(
        fs.createReadStream(source),
        new Transform({
          transform(chunk: Buffer, _encoding, callback) {
            hash.update(chunk);
            bytes += chunk.length;
            callback(null, chunk);
          },
        }),
        fs.createWriteStream(temp, { flags: "wx" }),
      );
      const d = Digest.parse(hash.digest("hex"));
      this.installBlob(temp, d);
      this.registerBlob(d, bytes, mime);
      return d;
    } finally {
      await fsp.rm(temp, { force: true });
    }
  }
  verifyBlob(d: string): boolean {
    try {
      const file = this.blobPath(d),
        stat = fs.statSync(file, { bigint: true }),
        signature = `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeNs}:${stat.ctimeNs}`;
      if (integrityCache.get(file) === signature) return true;
      const valid = stat.isFile() && fileBytesDigest(file) === d;
      if (valid) integrityCache.set(file, signature);
      return valid;
    } catch {
      return false;
    }
  }
  jsonBlob<T>(d: string, schema: z.ZodType<T>): T {
    if (!this.verifyBlob(d))
      throw new WeaverError("INTEGRITY_FAILED", "内容摘要不匹配或缺失", {
        digest: d,
      });
    return schema.parse(JSON.parse(fs.readFileSync(this.blobPath(d), "utf8")));
  }
}
