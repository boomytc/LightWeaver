import {
  z,
  LibraryId,
  LibraryPayload,
  LibraryVersion,
  Id,
  MediaAssetVersion,
  speechOf,
} from "../contracts/index.ts";
import { WeaverError } from "../contracts/errors.ts";
import { Store, digest, newId, now, canonical } from "../store/index.ts";

export class Library {
  constructor(private readonly store: Store) {}
  list(): z.infer<typeof LibraryVersion>[] {
    return this.store.listJson(
      "SELECT v.json FROM library_items i JOIN library_versions v ON v.item_id=i.id AND v.version=i.head WHERE i.deleted=0 ORDER BY i.id",
      [],
      LibraryVersion,
    );
  }
  read(id: string, version?: string): z.infer<typeof LibraryVersion> {
    return version
      ? this.store.readJson(
          "SELECT json FROM library_versions WHERE item_id=? AND version=?",
          [id, version],
          LibraryVersion,
        )
      : this.store.readJson(
          "SELECT v.json FROM library_items i JOIN library_versions v ON v.item_id=i.id AND v.version=i.head WHERE i.id=? AND i.deleted=0",
          [id],
          LibraryVersion,
        );
  }
  publish(input: {
    itemId?: string;
    expectedVersion: string | null;
    requestId: string;
    payload: unknown;
  }): z.infer<typeof LibraryVersion> {
    const payload = LibraryPayload.parse(input.payload);
    return this.store.mutate(
      "library",
      input.requestId,
      input,
      LibraryVersion,
      () => {
        const itemId = LibraryId.parse(input.itemId || newId("item"));
        const old = this.store.db
          .prepare("SELECT head,deleted FROM library_items WHERE id=?")
          .get(itemId);
        const head = old
          ? z.object({ head: z.string(), deleted: z.number() }).parse(old)
          : null;
        if ((head?.head ?? null) !== input.expectedVersion)
          throw new WeaverError("REVISION_CONFLICT", "库项已修改", {
            currentVersion: head?.head ?? null,
          });
        if (payload.kind !== "method") {
          const d =
            payload.kind === "voice" ? payload.reference : payload.digest;
          if (!this.store.verifyBlob(d))
            throw new WeaverError("INTEGRITY_FAILED", "库项引用媒体缺失", {
              digest: d,
            });
        } else {
          for (const scene of payload.sceneTemplate) {
            const speech = speechOf(scene),
              media = [
                ...(scene.kind === "clip"
                  ? [scene.source]
                  : scene.kind === "still"
                    ? [scene.image]
                    : []),
                ...(speech?.kind === "imported"
                  ? Object.values(speech.audio)
                  : []),
              ];
            for (const ref of media) {
              const asset = this.store.readJson(
                "SELECT json FROM assets WHERE asset_id=? AND version=?",
                [ref.assetId, ref.version],
                MediaAssetVersion,
              );
              if (!this.store.verifyBlob(asset.digest))
                throw new WeaverError(
                  "INTEGRITY_FAILED",
                  "方法模板引用媒体缺失",
                  ref,
                );
            }
            if (speech?.kind === "authored")
              for (const ref of Object.values(speech.voice)) {
                if (this.read(ref.itemId, ref.version).payload.kind !== "voice")
                  throw new WeaverError(
                    "INVALID_INPUT",
                    "方法模板的音色引用类型错误",
                    ref,
                  );
              }
          }
        }
        const version = LibraryVersion.parse({
          itemId,
          version: digest(payload),
          payload,
          createdAt: now(),
        });
        this.store.db
          .prepare(
            "INSERT INTO library_items VALUES(?,?,0) ON CONFLICT(id) DO UPDATE SET head=excluded.head,deleted=0",
          )
          .run(itemId, version.version);
        this.store.db
          .prepare("INSERT OR IGNORE INTO library_versions VALUES(?,?,?)")
          .run(itemId, version.version, canonical(version));
        this.store.pin(`library:${itemId}@${version.version}`, version);
        return this.read(itemId, version.version);
      },
    );
  }
  remove(input: {
    itemId: string;
    expectedVersion: string;
    requestId: string;
  }): { deleted: true } {
    return this.store.mutate(
      "library-delete",
      input.requestId,
      input,
      z.object({ deleted: z.literal(true) }),
      () => {
        const item = this.read(input.itemId);
        if (item.version !== input.expectedVersion)
          throw new WeaverError("REVISION_CONFLICT", "库项已修改", {
            currentVersion: item.version,
          });
        this.store.db
          .prepare("UPDATE library_items SET deleted=1 WHERE id=? AND head=?")
          .run(input.itemId, input.expectedVersion);
        return { deleted: true };
      },
    );
  }
}
