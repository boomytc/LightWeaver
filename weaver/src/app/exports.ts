import fs from "node:fs";
import path from "node:path";
import { z, Id, Digest, RevisionId } from "../contracts/index.ts";
import { WeaverError } from "../contracts/errors.ts";
import {
  Store,
  canonical,
  digest,
  fileBytesDigest,
  newId,
} from "../store/index.ts";
import type { Projects } from "../project/service.ts";
import type { Builds } from "./build.ts";
import type { Interchange } from "../interchange/index.ts";
import { processRun } from "../media/process.ts";
import {
  exportVideo,
  ExportVideoResultSchema,
  publishFileWithoutOverwrite,
} from "./export-video.ts";

export const ExportOptions = z.strictObject({
  projectId: Id,
  format: z.enum(["video", "bundle", "otio", "jianying"]),
  destination: z
    .string()
    .min(1)
    .refine(
      (value) => path.isAbsolute(value) && !value.includes("\0"),
      "导出目标必须是绝对路径",
    ),
  deliveryId: Id.optional(),
  requestId: Id,
});
export type ExportOptions = z.infer<typeof ExportOptions>;

const ExportResult = z.union([
  ExportVideoResultSchema,
  z.strictObject({
    destination: z.string(),
    projectRevision: RevisionId,
    semanticDigest: Digest,
    blobs: z.number(),
  }),
  z.strictObject({ destination: z.string(), receipt: z.unknown() }),
]);
const Frozen = z.discriminatedUnion("format", [
  z.strictObject({ format: z.literal("bundle"), revisionId: RevisionId }),
  z.strictObject({
    format: z.enum(["video", "otio", "jianying"]),
    deliveryId: Id,
  }),
]);
const Entry = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("directory"), name: z.string() }),
  z.strictObject({
    kind: z.literal("file"),
    name: z.string(),
    bytes: z.number(),
    digest: Digest,
  }),
]);
const Identity = z.strictObject({
  kind: z.enum(["file", "directory"]),
  device: z.string(),
  inode: z.string(),
  entries: z.array(Entry),
});
const Owner = z.strictObject({ pid: z.number().int().positive(), token: Id });
const Base = z.object({ target: z.string(), nonce: Id, frozen: Frozen });
const Preparing = Base.extend({
  phase: z.literal("preparing"),
  owner: Owner.nullable(),
});
const Ready = Base.extend({
  phase: z.literal("ready"),
  owner: Owner.nullable(),
  identity: Identity,
  result: ExportResult,
});
const Complete = Base.extend({
  phase: z.literal("complete"),
  identity: Identity,
  result: ExportResult,
});
const ExportRecord = z.discriminatedUnion("phase", [
  Preparing,
  Ready,
  Complete,
]);
type ExportRecord = z.infer<typeof ExportRecord>;
type RequestInput = Omit<ExportOptions, "requestId">;
const scope = "delivery-export-v1";

function exists(file: string): boolean {
  try {
    fs.lstatSync(file);
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT")
      return false;
    throw error;
  }
}

function identity(file: string, sync = false): z.infer<typeof Identity> {
  const root = fs.lstatSync(file, { bigint: true });
  const entries: z.infer<typeof Entry>[] = [];
  const visit = (current: string, name: string) => {
    const stat = fs.lstatSync(current);
    if (stat.isDirectory()) {
      entries.push({ kind: "directory", name });
      for (const child of fs.readdirSync(current).sort())
        visit(path.join(current, child), path.join(name, child));
    } else if (stat.isFile()) {
      if (sync) {
        const fd = fs.openSync(current, "r");
        try {
          fs.fsyncSync(fd);
        } finally {
          fs.closeSync(fd);
        }
      }
      entries.push({
        kind: "file",
        name,
        bytes: stat.size,
        digest: fileBytesDigest(current),
      });
    } else
      throw new WeaverError(
        "INTEGRITY_FAILED",
        "导出结果包含软链或非普通文件",
        { file: current },
      );
  };
  visit(file, "");
  return Identity.parse({
    kind: root.isFile() ? "file" : "directory",
    device: String(root.dev),
    inode: String(root.ino),
    entries,
  });
}

function verify(file: string, expected: z.infer<typeof Identity>): void {
  if (!exists(file) || canonical(identity(file)) !== canonical(expected))
    throw new WeaverError(
      "INTEGRITY_FAILED",
      "导出结果已移动或被修改，不能重放原请求",
      { file },
    );
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return !(
      error instanceof Error &&
      "code" in error &&
      error.code === "ESRCH"
    );
  }
}

function workDir(record: ExportRecord): string {
  return path.join(
    path.dirname(record.target),
    `.lightweaver-export-${record.nonce}`,
  );
}

function outputFile(record: ExportRecord): string {
  return path.join(
    workDir(record),
    record.frozen.format === "video"
      ? "video.mp4"
      : record.frozen.format === "bundle" && record.target.endsWith(".zip")
        ? "bundle.zip"
        : "package",
  );
}

async function publishDirectory(staged: string, target: string): Promise<void> {
  const result = await processRun("python3", [
    "-c",
    `import ctypes, errno, json, os, sys
try:
    if sys.platform in ("darwin", "linux"):
        library = ctypes.CDLL(None, use_errno=True)
        if sys.platform == "darwin":
            rename = library.renamex_np
            rename.argtypes = [ctypes.c_char_p, ctypes.c_char_p, ctypes.c_uint]
            arguments = [os.fsencode(sys.argv[1]), os.fsencode(sys.argv[2]), 4]
        else:
            rename = library.renameat2
            rename.argtypes = [ctypes.c_int, ctypes.c_char_p, ctypes.c_int, ctypes.c_char_p, ctypes.c_uint]
            arguments = [-100, os.fsencode(sys.argv[1]), -100, os.fsencode(sys.argv[2]), 1]
        rename.restype = ctypes.c_int
        if rename(*arguments) != 0:
            code = ctypes.get_errno()
            raise OSError(code, os.strerror(code))
    else:
        os.rename(sys.argv[1], sys.argv[2])
except OSError as error:
    print(json.dumps({"error": "exists" if error.errno in (errno.EEXIST, errno.ENOTEMPTY) else str(error)}))
except AttributeError:
    print(json.dumps({"error": "exclusive rename unavailable"}))
else:
    print(json.dumps({"error": None}))`,
    staged,
    target,
  ]);
  const response = z
    .strictObject({ error: z.string().nullable() })
    .parse(JSON.parse(result.stdout));
  if (response.error !== null)
    throw new WeaverError(
      "INVALID_INPUT",
      response.error === "exists"
        ? "导出目标已存在，选择新目录"
        : "导出目录不支持排他发布",
      { destination: target, reason: response.error },
    );
}

export class DeliveryExports {
  private readonly active = new Map<
    string,
    { fingerprint: string; promise: Promise<z.infer<typeof ExportResult>> }
  >();
  constructor(
    private readonly store: Store,
    private readonly projects: Projects,
    private readonly builds: Builds,
    private readonly interchange: Interchange,
  ) {}

  run(raw: ExportOptions): Promise<z.infer<typeof ExportResult>> {
    const { requestId, ...input } = ExportOptions.parse(raw);
    input.destination = path.resolve(input.destination);
    const fingerprint = digest(input),
      active = this.active.get(requestId);
    if (active) {
      if (active.fingerprint !== fingerprint)
        throw new WeaverError(
          "REQUEST_ID_REUSED",
          "同一 requestId 对应不同导出请求",
          { requestId },
        );
      return active.promise;
    }
    const promise = this.execute(input, requestId).finally(() =>
      this.active.delete(requestId),
    );
    this.active.set(requestId, { fingerprint, promise });
    return promise;
  }

  private read(
    input: RequestInput,
    requestId: string,
  ): ExportRecord | undefined {
    return this.store.request(scope, requestId, input, ExportRecord);
  }

  private write(requestId: string, record: ExportRecord): void {
    this.store.db
      .prepare("UPDATE requests SET result=? WHERE scope=? AND id=?")
      .run(canonical(ExportRecord.parse(record)), scope, requestId);
  }

  private async prepare(
    input: RequestInput,
    requestId: string,
  ): Promise<ExportRecord> {
    const requested = input.destination;
    fs.mkdirSync(path.dirname(requested), { recursive: true });
    const target = path.join(
      fs.realpathSync(path.dirname(requested)),
      path.basename(requested),
    );
    let frozen: z.infer<typeof Frozen>;
    if (input.format === "bundle")
      frozen = {
        format: "bundle",
        revisionId: this.projects.read(input.projectId).id,
      };
    else {
      const deliveries = await this.builds.deliveries(input.projectId);
      const delivery = deliveries.find((value) =>
        input.deliveryId
          ? value.id === input.deliveryId
          : value.state === "current",
      );
      if (!delivery)
        throw new WeaverError(
          input.deliveryId ? "NOT_FOUND" : "BUILD_ISSUES",
          "找不到可导出的交付",
          { projectId: input.projectId, deliveryId: input.deliveryId },
          ["先制作当前版本，或显式选择已有交付。"],
        );
      if (delivery.state === "missing")
        throw new WeaverError("INTEGRITY_FAILED", "交付文件缺失或不完整");
      frozen = { format: input.format, deliveryId: delivery.id };
    }
    return this.store.mutate(scope, requestId, input, ExportRecord, () => {
      if (exists(target))
        throw new WeaverError(
          "INVALID_INPUT",
          "导出目标已存在，选择新文件或目录",
          { destination: target },
        );
      return {
        phase: "preparing",
        owner: null,
        target,
        nonce: newId("output"),
        frozen,
      };
    });
  }

  private async execute(input: RequestInput, requestId: string) {
    let record =
      this.read(input, requestId) ?? (await this.prepare(input, requestId));
    if (record.phase === "complete") {
      verify(record.target, record.identity);
      fs.rmSync(workDir(record), { recursive: true, force: true });
      return record.result;
    }
    const owner = { pid: process.pid, token: newId("export") };
    record = this.store.transaction(() => {
      const current = this.read(input, requestId);
      if (!current) throw new WeaverError("NOT_FOUND", "导出请求记录缺失");
      if (current.phase === "complete") return current;
      if (current.owner && alive(current.owner.pid))
        throw new WeaverError(
          "EXPORT_IN_PROGRESS",
          "相同导出请求仍在执行，请稍后用原 requestId 重试",
          { requestId },
          [],
          true,
        );
      const claimed = { ...current, owner };
      this.write(requestId, claimed);
      return claimed;
    });
    if (record.phase === "complete") {
      verify(record.target, record.identity);
      return record.result;
    }
    try {
      if (record.phase === "preparing") {
        fs.rmSync(workDir(record), { recursive: true, force: true });
        fs.mkdirSync(workDir(record), { mode: 0o700 });
        const output = outputFile(record),
          frozen = record.frozen;
        const generated =
          frozen.format === "video"
            ? await exportVideo({
                store: this.store,
                builds: this.builds,
                projectId: input.projectId,
                deliveryId: frozen.deliveryId,
                destination: output,
              })
            : frozen.format === "bundle"
              ? await this.interchange.bundle(
                  input.projectId,
                  output,
                  frozen.revisionId,
                )
              : await this.interchange.export({
                  projectId: input.projectId,
                  format: frozen.format,
                  deliveryId: frozen.deliveryId,
                  destination: output,
                });
        const result = ExportResult.parse(
          "file" in generated
            ? { ...generated, file: record.target }
            : { ...generated, destination: record.target },
        );
        record = {
          ...record,
          phase: "ready",
          identity: identity(output, true),
          result,
        };
        this.store.transaction(() => this.write(requestId, record));
      }
      const ready = record;
      verify(
        exists(ready.target) ? ready.target : outputFile(ready),
        ready.identity,
      );
      if (!exists(ready.target)) {
        if (ready.identity.kind === "file")
          publishFileWithoutOverwrite(outputFile(ready), ready.target);
        else await publishDirectory(outputFile(ready), ready.target);
      }
      const completed = this.store.transaction(() => {
        const done = Complete.parse({ ...ready, phase: "complete" });
        this.write(requestId, done);
        return done;
      });
      fs.rmSync(workDir(completed), { recursive: true, force: true });
      return completed.result;
    } catch (error) {
      if (record.phase === "preparing")
        fs.rmSync(workDir(record), { recursive: true, force: true });
      this.store.transaction(() => {
        const current = this.read(input, requestId);
        if (
          current &&
          current.phase !== "complete" &&
          current.owner?.token === owner.token
        )
          this.write(requestId, { ...current, owner: null });
      });
      throw error;
    }
  }
}
