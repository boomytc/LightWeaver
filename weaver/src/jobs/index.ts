import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  z,
  RunId,
  RunRecord,
  EventRecord,
  Digest,
  ErrorProtocol,
} from "../contracts/index.ts";
import { WeaverError, errorProtocol } from "../contracts/errors.ts";
import { Store, newId, now, canonical } from "../store/index.ts";

const Receipt = z.object({
  nodeId: z.string(),
  inputDigest: Digest,
  resultDigest: Digest,
  blobs: z.array(Digest),
});
export const NodeSpec = z.strictObject({
  key: z.string(),
  operation: z.string(),
  input: z.unknown(),
  dependencies: z.array(z.string()).default([]),
});
const NodeRow = z.object({
  id: z.string(),
  run_id: RunId,
  key: z.string(),
  state: z.string(),
  token: z.string().nullable(),
  attempts: z.number(),
  retry_base: z.number(),
  result: z.string().nullable(),
  json: z.string(),
});
export type NodeContext = {
  runId: z.infer<typeof RunId>;
  nodeId: string;
  token: string;
  workDir: string;
  signal: AbortSignal;
  input: unknown;
  dependencies: Record<string, unknown>;
  event: (type: string, data: unknown) => void;
  publish: (fn: () => void) => void;
};
export type Handler = (context: NodeContext) => Promise<unknown>;

export class Jobs {
  private handlers = new Map<string, Handler>();
  private completions = new Map<
    string,
    (context: NodeContext, result: unknown) => void
  >();
  private active = new Map<string, AbortController>();
  private stopping = false;
  constructor(private readonly store: Store) {
    const cols = z
      .array(z.object({ name: z.string() }))
      .parse(store.db.pragma("table_info(nodes)"));
    if (!cols.some((c) => c.name === "json"))
      store.db.exec(
        "ALTER TABLE nodes ADD COLUMN json TEXT NOT NULL DEFAULT '{}'",
      );
    if (!cols.some((c) => c.name === "retry_base"))
      store.db.exec(
        "ALTER TABLE nodes ADD COLUMN retry_base INTEGER NOT NULL DEFAULT 0",
      );
  }
  register(
    operation: string,
    handler: Handler,
    complete?: (context: NodeContext, result: unknown) => void,
  ): void {
    this.handlers.set(operation, handler);
    if (complete) this.completions.set(operation, complete);
  }
  event(runId: string, type: string, data: unknown): void {
    this.store.db
      .prepare(
        "INSERT INTO events(run_id,type,data,created_at) VALUES(?,?,?,?)",
      )
      .run(runId, type, canonical(data), now());
  }
  events(runId: string, after = 0): z.infer<typeof EventRecord>[] {
    this.read(runId);
    return this.store.db
      .prepare(
        "SELECT * FROM events WHERE run_id=? AND seq>? ORDER BY seq LIMIT 1000",
      )
      .all(runId, after)
      .map((raw) => {
        const r = z
          .object({
            seq: z.number(),
            run_id: RunId,
            type: z.string(),
            data: z.string(),
            created_at: z.string(),
          })
          .parse(raw);
        return EventRecord.parse({
          seq: r.seq,
          runId: r.run_id,
          type: r.type,
          data: JSON.parse(r.data),
          createdAt: r.created_at,
        });
      });
  }
  read(runId: string): z.infer<typeof RunRecord> {
    const raw = this.store.db
      .prepare("SELECT * FROM runs WHERE id=?")
      .get(runId);
    if (!raw) throw new WeaverError("NOT_FOUND", "找不到作业", { runId });
    const r = z
      .object({
        id: RunId,
        project_id: z.string().nullable(),
        kind: z.string(),
        state: z.string(),
        snapshot_digest: Digest,
        cancel_requested: z.number(),
        created_at: z.string(),
        updated_at: z.string(),
        error: z.string().nullable(),
      })
      .parse(raw);
    return RunRecord.parse({
      id: r.id,
      projectId: r.project_id,
      kind: r.kind,
      state: r.state,
      snapshotDigest: r.snapshot_digest,
      cancelRequested: !!r.cancel_requested,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      error: r.error ? JSON.parse(r.error) : null,
    });
  }
  list(projectId?: string) {
    return z
      .array(z.object({ id: RunId }))
      .parse(
        this.store.db
          .prepare(
            `SELECT id FROM runs ${projectId ? "WHERE project_id=?" : ""} ORDER BY created_at DESC LIMIT 100`,
          )
          .all(...(projectId ? [projectId] : [])),
      )
      .map((r) => this.read(r.id));
  }
  nodes(runId: string) {
    return this.store.db
      .prepare("SELECT * FROM nodes WHERE run_id=? ORDER BY rowid")
      .all(runId)
      .map((row) => {
        const n = NodeRow.extend({ error: z.string().nullable() }).parse(row);
        return {
          id: n.id,
          key: n.key,
          state: n.state,
          attempts: n.attempts,
          result: n.result ? JSON.parse(n.result) : null,
          error: n.error ? ErrorProtocol.parse(JSON.parse(n.error)) : null,
        };
      });
  }
  prior(
    kind: string,
    requestId: string,
    requestInput: unknown,
    projectId?: string,
  ) {
    return this.store.request(
      "run-submit",
      requestId,
      { kind, projectId, requestInput },
      RunRecord,
    );
  }
  submit(
    input: {
      projectId?: string;
      kind: string;
      snapshot: unknown;
      nodes: z.input<typeof NodeSpec>[];
      requestId: string;
      requestInput?: unknown;
    },
    onSubmit?: (runId: string) => void,
  ): z.infer<typeof RunRecord> {
    const specs = z.array(NodeSpec).min(1).parse(input.nodes);
    if (new Set(specs.map((n) => n.key)).size !== specs.length)
      throw new WeaverError("INVALID_INPUT", "作业节点重复");
    const seen = new Set<string>();
    for (const spec of specs) {
      if (spec.dependencies.some((d) => !seen.has(d)))
        throw new WeaverError("INVALID_INPUT", "节点依赖必须位于前面");
      seen.add(spec.key);
    }
    return this.store.ownedSync("run-submit", () => {
      const snapshotDigest = this.store.putJson(input.snapshot);
      return this.store.mutate(
        "run-submit",
        input.requestId,
        input.requestInput === undefined
          ? { ...input, snapshot: snapshotDigest }
          : {
              kind: input.kind,
              projectId: input.projectId,
              requestInput: input.requestInput,
            },
        RunRecord,
        () => {
          const id = RunId.parse(newId("run")),
            timestamp = now();
          this.store.db
            .prepare("INSERT INTO runs VALUES(?,?,?,'queued',?,0,?,?,NULL)")
            .run(
              id,
              input.projectId ?? null,
              input.kind,
              snapshotDigest,
              timestamp,
              timestamp,
            );
          for (const spec of specs)
            this.store.db
              .prepare(
                "INSERT INTO nodes(id,run_id,key,state,json) VALUES(?,?,?,'queued',?)",
              )
              .run(newId("node"), id, spec.key, canonical(spec));
          this.store.pin(`run:${id}`, {
            snapshotDigest,
            snapshot: input.snapshot,
          });
          onSubmit?.(id);
          this.event(id, "queued", { nodes: specs.map((n) => n.key) });
          return this.read(id);
        },
      );
    });
  }
  cancel(runId: string): z.infer<typeof RunRecord> {
    return this.store.transaction(() => {
      const run = this.read(runId);
      if (["succeeded", "failed", "cancelled", "partial"].includes(run.state))
        return run;
      this.store.db
        .prepare(
          "UPDATE runs SET cancel_requested=1,state='cancelling',updated_at=? WHERE id=?",
        )
        .run(now(), runId);
      this.store.db
        .prepare(
          "UPDATE nodes SET state='cancelled' WHERE run_id=? AND state IN ('queued','interrupted')",
        )
        .run(runId);
      this.event(runId, "cancel-requested", {});
      for (const [token, controller] of this.active) {
        if (
          this.store.db
            .prepare("SELECT 1 FROM nodes WHERE run_id=? AND token=?")
            .get(runId, token)
        )
          controller.abort();
      }
      this.summarize(runId);
      return this.read(runId);
    });
  }
  resume(runId: string): z.infer<typeof RunRecord> {
    return this.store.transaction(() => {
      const r = this.read(runId);
      if (["running", "queued", "cancelling"].includes(r.state))
        throw new WeaverError("INVALID_INPUT", "作业尚未停止");
      const invalid = new Set<string>();
      for (const row of this.store.db
        .prepare("SELECT * FROM nodes WHERE run_id=? ORDER BY rowid")
        .all(runId)) {
        const node = NodeRow.parse(row),
          spec = NodeSpec.parse(JSON.parse(node.json));
        const receipt = this.store.listJson(
          "SELECT json FROM node_receipts WHERE node_id=? AND token=?",
          [node.id, node.token],
          Receipt,
        )[0];
        if (
          node.state !== "succeeded" ||
          spec.dependencies.some((key) => invalid.has(key)) ||
          !receipt ||
          !this.store.verifyBlob(receipt.resultDigest) ||
          !receipt.blobs.every((d) => this.store.verifyBlob(d))
        ) {
          invalid.add(node.key);
          this.store.db
            .prepare(
              "UPDATE nodes SET state='queued',token=NULL,lease_until=NULL,next_at=0,error=NULL,result=NULL,retry_base=attempts WHERE id=?",
            )
            .run(node.id);
        }
      }
      if (!invalid.size) {
        this.summarize(runId);
        return this.read(runId);
      }
      this.store.db
        .prepare(
          "UPDATE runs SET state='queued',cancel_requested=0,error=NULL,updated_at=? WHERE id=?",
        )
        .run(now(), runId);
      this.event(runId, "resumed", {
        successfulNodesRetained: true,
        reset: [...invalid],
      });
      return this.read(runId);
    });
  }
  recover(): void {
    this.store.transaction(() => {
      const expired = z
        .array(
          z.object({
            id: z.string(),
            run_id: z.string(),
            token: z.string().nullable(),
          }),
        )
        .parse(
          this.store.db
            .prepare(
              "SELECT id,run_id,token FROM nodes WHERE state='running' AND lease_until<?",
            )
            .all(Date.now()),
        );
      for (const n of expired) {
        this.store.db
          .prepare(
            "UPDATE nodes SET state='interrupted',token=NULL,lease_until=NULL WHERE id=?",
          )
          .run(n.id);
        this.store.db
          .prepare(
            "UPDATE attempts SET state='interrupted',finished_at=? WHERE token=? AND state='running'",
          )
          .run(now(), n.token);
        this.store.db
          .prepare(
            "UPDATE runs SET state='interrupted',updated_at=? WHERE id=? AND cancel_requested=0",
          )
          .run(now(), n.run_id);
        this.event(n.run_id, "interrupted", { nodeId: n.id });
      }
      // 中断节点保持可见；显式 resume 不会重跑成功节点。
      for (const r of this.list().filter((r) => r.state === "cancelling"))
        this.summarize(r.id);
    });
  }
  private claim(onlyRun?: string) {
    return this.store.transaction(() => {
      const rows = this.store.db
        .prepare(
          `SELECT n.* FROM nodes n JOIN runs r ON r.id=n.run_id WHERE n.state='queued' AND n.next_at<=? AND r.cancel_requested=0 AND r.state IN ('queued','running') ${onlyRun ? "AND r.id=?" : ""} ORDER BY n.rowid`,
        )
        .all(Date.now(), ...(onlyRun ? [onlyRun] : []));
      for (const row of rows) {
        const n = NodeRow.parse(row),
          spec = NodeSpec.parse(JSON.parse(n.json));
        if (
          spec.operation === "render" &&
          this.store.db
            .prepare(
              "SELECT 1 FROM nodes WHERE state='running' AND json_extract(json,'$.operation')='render'",
            )
            .get()
        )
          continue;
        const siblings = this.nodes(n.run_id),
          dependencies: Record<string, unknown> = {};
        if (
          spec.dependencies.some(
            (key) => siblings.find((s) => s.key === key)?.state !== "succeeded",
          )
        )
          continue;
        for (const key of spec.dependencies)
          dependencies[key] = siblings.find((s) => s.key === key)?.result;
        const token = randomUUID();
        this.store.db
          .prepare(
            "UPDATE nodes SET state='running',token=?,attempts=attempts+1,lease_until=? WHERE id=? AND state='queued'",
          )
          .run(token, Date.now() + 15000, n.id);
        this.store.db
          .prepare(
            "INSERT INTO attempts(token,node_id,ordinal,state,started_at) VALUES(?,?,?,'running',?)",
          )
          .run(token, n.id, n.attempts + 1, now());
        this.store.db
          .prepare("UPDATE runs SET state='running',updated_at=? WHERE id=?")
          .run(now(), n.run_id);
        this.event(n.run_id, "node-started", {
          key: n.key,
          token,
          attempt: n.attempts + 1,
        });
        return { ...n, token, spec, dependencies };
      }
      return undefined;
    });
  }
  private owns(nodeId: string, token: string): boolean {
    return !!this.store.db
      .prepare(
        "SELECT 1 FROM nodes n JOIN runs r ON r.id=n.run_id WHERE n.id=? AND n.token=? AND n.state='running' AND r.cancel_requested=0 AND n.lease_until>=?",
      )
      .get(nodeId, token, Date.now());
  }
  async tick(onlyRun?: string): Promise<boolean> {
    this.recover();
    const n = this.claim(onlyRun);
    if (!n) return false;
    const controller = new AbortController();
    this.active.set(n.token, controller);
    const workDir = path.join(this.store.root, "work", n.id, n.token);
    fs.mkdirSync(workDir, { recursive: true });
    const heartbeat = setInterval(() => {
      const run = this.read(n.run_id);
      if (run.cancelRequested || !this.owns(n.id, n.token)) controller.abort();
      else
        this.store.db
          .prepare(
            "UPDATE nodes SET lease_until=? WHERE id=? AND token=? AND state='running'",
          )
          .run(Date.now() + 15000, n.id, n.token);
    }, 1000);
    const first = z
      .object({ started_at: z.string() })
      .parse(
        this.store.db
          .prepare(
            "SELECT started_at FROM attempts WHERE node_id=? AND ordinal>? ORDER BY ordinal LIMIT 1",
          )
          .get(n.id, n.retry_base),
      );
    const remainingMs = Math.max(
      1,
      30 * 60 * 1000 - (Date.now() - Date.parse(first.started_at)),
    );
    const deadline = setTimeout(
      () => controller.abort(new Error("作业总时限")),
      remainingMs,
    );
    const publications: (() => void)[] = [];
    const context: NodeContext = {
      runId: n.run_id,
      nodeId: n.id,
      token: n.token,
      workDir,
      signal: controller.signal,
      input: n.spec.input,
      dependencies: n.dependencies,
      event: (type, data) => this.event(n.run_id, type, data),
      publish: (fn) => {
        publications.push(fn);
      },
    };
    return this.store.owned(`attempt:${n.token}`, async () => {
      try {
        const handler = this.handlers.get(n.spec.operation);
        if (!handler)
          throw new WeaverError(
            "CAPABILITY_UNAVAILABLE",
            `没有注册 ${n.spec.operation} 执行器`,
          );
        const receiptFile = path.join(workDir, "receipt.json");
        const inputDigest = this.store.putJson(
          n.spec.dependencies.length
            ? { spec: n.spec, dependencies: n.dependencies }
            : n.spec,
        );
        // 完成收据先于 DB 写入。恢复只接纳通过 SHA 验证的不可变结果。
        const priorDirs = fs.readdirSync(path.dirname(workDir));
        let result: unknown,
          reused = false;
        const receipts = this.store.listJson(
          "SELECT json FROM node_receipts WHERE node_id=?",
          [n.id],
          Receipt,
        );
        for (const dir of priorDirs) {
          const file = path.join(path.dirname(workDir), dir, "receipt.json");
          try {
            if (fs.existsSync(file))
              receipts.push(
                Receipt.parse(JSON.parse(fs.readFileSync(file, "utf8"))),
              );
          } catch {
            /* Partial attempt receipt. */
          }
        }
        for (const r of receipts) {
          try {
            if (
              r.nodeId === n.id &&
              r.inputDigest === inputDigest &&
              this.store.verifyBlob(r.resultDigest) &&
              r.blobs.every((d) => this.store.verifyBlob(d))
            ) {
              result = this.store.jsonBlob(r.resultDigest, z.unknown());
              reused = true;
              break;
            }
          } catch {
            /* 无有效收据，重新执行 */
          }
        }
        if (!reused) result = await handler(context);
        controller.signal.throwIfAborted();
        const resultDigest = this.store.putJson(result);
        const blobs = new Set<string>();
        const collect = (v: unknown): void => {
          if (
            typeof v === "string" &&
            /^[a-f0-9]{64}$/.test(v) &&
            this.store.db.prepare("SELECT 1 FROM blobs WHERE digest=?").get(v)
          )
            blobs.add(v);
          else if (Array.isArray(v)) v.forEach(collect);
          else if (v && typeof v === "object")
            Object.values(v).forEach(collect);
        };
        collect(result);
        const receipt = Receipt.parse({
          nodeId: n.id,
          inputDigest,
          resultDigest,
          blobs: [...blobs],
        });
        fs.writeFileSync(receiptFile, canonical(receipt));
        this.store.transaction(() => {
          if (!this.owns(n.id, n.token))
            throw new WeaverError("FENCED", "attempt 所有权失效");
          this.store.db
            .prepare("INSERT OR REPLACE INTO node_receipts VALUES(?,?,?)")
            .run(n.id, n.token, canonical(receipt));
          this.store.pin(`receipt:${n.id}:${n.token}`, receipt);
        });
        this.store.transaction(() => {
          if (!this.owns(n.id, n.token))
            throw new WeaverError("FENCED", "attempt 所有权失效");
          this.completions.get(n.spec.operation)?.(context, result);
          for (const publish of publications) publish();
          this.store.db
            .prepare(
              "UPDATE nodes SET state='succeeded',result=?,lease_until=NULL WHERE id=? AND token=?",
            )
            .run(canonical(result), n.id, n.token);
          this.store.db
            .prepare(
              "UPDATE attempts SET state='succeeded',result=?,finished_at=? WHERE token=?",
            )
            .run(canonical(result), now(), n.token);
          this.store.pin(`node:${n.id}`, { resultDigest, result });
          this.event(n.run_id, "node-succeeded", { key: n.key, reused });
          this.summarize(n.run_id);
        });
      } catch (error) {
        this.store.transaction(() => {
          const cancelled = this.read(n.run_id).cancelRequested,
            protocol = errorProtocol(error);
          const interrupted = !cancelled && this.stopping;
          const retry =
            !cancelled &&
            !interrupted &&
            protocol.retryable &&
            n.attempts - n.retry_base + 1 < 3;
          const delay =
            protocol.details &&
            typeof protocol.details === "object" &&
            "retryAfterMs" in protocol.details
              ? Number(protocol.details.retryAfterMs)
              : 1000 * 2 ** (n.attempts - n.retry_base);
          const state = cancelled
            ? "cancelled"
            : interrupted
              ? "interrupted"
              : retry
                ? "queued"
                : "failed";
          const updated = this.store.db
            .prepare(
              "UPDATE nodes SET state=?,error=?,lease_until=NULL,next_at=? WHERE id=? AND token=? AND state='running'",
            )
            .run(
              state,
              canonical(protocol),
              Date.now() + Math.min(60000, Math.max(0, delay)),
              n.id,
              n.token,
            );
          this.store.db
            .prepare(
              "UPDATE attempts SET state=?,error=?,finished_at=? WHERE token=? AND state='running'",
            )
            .run(
              cancelled ? "cancelled" : interrupted ? "interrupted" : "failed",
              canonical(protocol),
              now(),
              n.token,
            );
          if (updated.changes) {
            if (interrupted)
              this.store.db
                .prepare(
                  "UPDATE runs SET state='interrupted',updated_at=? WHERE id=?",
                )
                .run(now(), n.run_id);
            this.event(n.run_id, retry ? "retry-scheduled" : state, {
              key: n.key,
              error: protocol,
            });
            this.summarize(n.run_id);
          }
        });
        if (this.read(n.run_id).cancelRequested)
          fs.rmSync(workDir, { recursive: true, force: true });
      } finally {
        clearInterval(heartbeat);
        clearTimeout(deadline);
        this.active.delete(n.token);
      }
      return true;
    });
  }
  private summarize(runId: string): void {
    const states = this.nodes(runId).map((n) => n.state),
      run = this.read(runId);
    if (states.includes("running")) return;
    if (states.includes("queued")) {
      if (!states.includes("failed")) return;
      // 依赖失败的节点不永久排队；独立目标仍可运行。
      for (const row of this.store.db
        .prepare("SELECT * FROM nodes WHERE run_id=? AND state='queued'")
        .all(runId)) {
        const n = NodeRow.parse(row),
          spec = NodeSpec.parse(JSON.parse(n.json)),
          siblings = this.nodes(runId);
        if (
          spec.dependencies.some((d) =>
            ["failed", "cancelled"].includes(
              siblings.find((s) => s.key === d)?.state || "",
            ),
          )
        )
          this.store.db
            .prepare("UPDATE nodes SET state='failed',error=? WHERE id=?")
            .run(
              canonical({
                code: "DEPENDENCY_FAILED",
                message: "上游步骤失败",
                retryable: false,
                hints: [],
              }),
              n.id,
            );
      }
      if (this.nodes(runId).some((n) => n.state === "queued")) return;
    }
    const finalStates = this.nodes(runId).map((n) => n.state);
    const rows = this.store.db
      .prepare("SELECT json FROM nodes WHERE run_id=?")
      .all(runId)
      .map((r) =>
        NodeSpec.parse(
          JSON.parse(z.object({ json: z.string() }).parse(r).json),
        ),
      );
    const dependedOn = new Set(rows.flatMap((n) => n.dependencies));
    const leaves = new Set(
      rows.filter((n) => !dependedOn.has(n.key)).map((n) => n.key),
    );
    const success = this.nodes(runId).filter(
      (n) => leaves.has(n.key) && n.state === "succeeded",
    ).length;
    const state = run.cancelRequested
      ? "cancelled"
      : finalStates.every((s) => s === "succeeded")
        ? "succeeded"
        : finalStates.includes("interrupted")
          ? "interrupted"
          : success
            ? "partial"
            : "failed";
    const failure = this.nodes(runId).find((n) => n.error)?.error;
    this.store.db
      .prepare("UPDATE runs SET state=?,updated_at=?,error=? WHERE id=?")
      .run(state, now(), failure ? canonical(failure) : null, runId);
    this.event(runId, "run-state", { state });
  }
  async wait(runId: string): Promise<z.infer<typeof RunRecord>> {
    while (!this.stopping) {
      const r = this.read(runId);
      if (!["queued", "running", "cancelling"].includes(r.state)) return r;
      if (!(await this.tick(runId)))
        await new Promise<void>((resolve) => setTimeout(resolve, 200));
    }
    return this.read(runId);
  }
  async worker(signal: AbortSignal): Promise<void> {
    signal.addEventListener(
      "abort",
      () => {
        this.stopping = true;
        for (const controller of this.active.values()) controller.abort();
      },
      { once: true },
    );
    while (!signal.aborted)
      if (!(await this.tick()))
        await new Promise<void>((resolve) => setTimeout(resolve, 300));
  }
}
