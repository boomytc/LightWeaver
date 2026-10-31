import { z, ArtifactManifest, Digest } from "../contracts/index.ts";
import { Store, digest, newId, now, canonical } from "../store/index.ts";

export class Artifacts {
  constructor(private readonly store: Store) {}
  key(operation: string, inputs: unknown): z.infer<typeof Digest> {
    return digest({ operation, inputs });
  }
  lookup(
    cacheKey: string,
    generation?: string,
  ): z.infer<typeof ArtifactManifest> | undefined {
    const rows = this.store.listJson(
      `SELECT json FROM artifacts WHERE cache_key=? AND verified=1 ${generation ? "AND generation=?" : ""} ORDER BY rowid DESC`,
      generation ? [cacheKey, generation] : [cacheKey],
      ArtifactManifest,
    );
    return rows.find(
      (r) =>
        this.store.verifyBlob(r.digest) &&
        r.dependencies.every((d) => this.store.verifyBlob(d)),
    );
  }
  record(input: {
    operation: string;
    cacheKey: z.infer<typeof Digest>;
    generation: string;
    digest: z.infer<typeof Digest>;
    mime: string;
    dependencies: z.infer<typeof Digest>[];
    provenance: Record<string, unknown>;
    verified: boolean;
  }): z.infer<typeof ArtifactManifest> {
    const record = ArtifactManifest.parse({
      ...input,
      id: newId("artifact"),
      createdAt: now(),
    });
    return this.store.transaction(() => {
      const old = this.store.listJson(
        "SELECT json FROM artifacts WHERE operation=? AND cache_key=? AND generation=? AND digest=? LIMIT 1",
        [record.operation, record.cacheKey, record.generation, record.digest],
        ArtifactManifest,
      )[0];
      if (old) return old;
      this.store.db
        .prepare("INSERT INTO artifacts VALUES(?,?,?,?,?,?,?)")
        .run(
          record.id,
          record.operation,
          record.cacheKey,
          record.generation,
          record.digest,
          record.verified ? 1 : 0,
          canonical(record),
        );
      this.store.pin(`artifact:${record.id}`, record);
      return record;
    });
  }
  state(
    record: z.infer<typeof ArtifactManifest> | undefined,
    expectedKey: string,
  ): "missing" | "current" | "stale" | "historical/unverified" {
    if (!record || !this.store.verifyBlob(record.digest)) return "missing";
    if (!record.verified) return "historical/unverified";
    return record.cacheKey === expectedKey &&
      record.dependencies.every((d) => this.store.verifyBlob(d))
      ? "current"
      : "stale";
  }
}
