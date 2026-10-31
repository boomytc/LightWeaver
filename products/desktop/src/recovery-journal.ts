import fs from "node:fs";
import path from "node:path";

export type RecoveryDraft = {
  projectId: string;
  base: string;
  document?: unknown;
  creativePlanDraft?: unknown;
  updatedAt: string;
};

type JournalFile = {
  version: 1;
  drafts: RecoveryDraft[];
};

const JOURNAL_VERSION = 1;

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`${label}必须是对象`);
  return value as Record<string, unknown>;
}

function requiredText(
  value: unknown,
  label: string,
  maxLength: number,
): string {
  if (typeof value !== "string" || !value || value.length > maxLength)
    throw new Error(`${label}无效`);
  return value;
}

function timestamp(value: unknown, label: string): {
  value: string;
  time: number;
} {
  const text = requiredText(value, label, 128);
  const time = Date.parse(text);
  if (!Number.isFinite(time) || new Date(time).toISOString() !== text)
    throw new Error(`${label}必须是规范 ISO 时间`);
  return { value: text, time };
}

function cloneDraft(value: unknown): RecoveryDraft {
  const input = record(value, "恢复草稿");
  const projectId = requiredText(input.projectId, "恢复草稿 projectId", 1024);
  const base = requiredText(input.base, "恢复草稿 base", 1024);
  const updatedAt = timestamp(input.updatedAt, "恢复草稿 updatedAt").value;
  const draft: RecoveryDraft = { projectId, base, updatedAt };
  if (Object.hasOwn(input, "document") && input.document !== undefined)
    draft.document = input.document;
  if (
    Object.hasOwn(input, "creativePlanDraft") &&
    input.creativePlanDraft !== undefined
  )
    draft.creativePlanDraft = input.creativePlanDraft;

  let encoded: string | undefined;
  try {
    encoded = JSON.stringify(draft);
  } catch {
    throw new Error("恢复草稿包含无法序列化的值");
  }
  if (encoded === undefined)
    throw new Error("恢复草稿包含无法序列化的值");
  return record(JSON.parse(encoded), "恢复草稿") as RecoveryDraft;
}

export class RecoveryJournal {
  private tail: Promise<void> = Promise.resolve();

  get(dataDir: string): Promise<RecoveryDraft[]> {
    return this.enqueue(() => this.read(dataDir));
  }

  save(dataDir: string, value: unknown): Promise<void> {
    const draft = cloneDraft(value);
    return this.enqueue(() => {
      const drafts = this.read(dataDir);
      const existing = drafts.find((item) => item.projectId === draft.projectId);
      if (
        existing &&
        Date.parse(draft.updatedAt) < Date.parse(existing.updatedAt)
      )
        throw new Error("拒绝旧恢复草稿覆盖较新的草稿");
      const next = [
        draft,
        ...drafts.filter((item) => item.projectId !== draft.projectId),
      ];
      this.write(dataDir, next);
    });
  }

  clear(
    dataDir: string,
    value: unknown,
  ): Promise<void> {
    const input = record(value, "清除恢复草稿请求");
    const projectId = requiredText(
      input.projectId,
      "清除恢复草稿 projectId",
      1024,
    );
    const through = timestamp(
      input.throughUpdatedAt,
      "清除恢复草稿 throughUpdatedAt",
    ).time;
    return this.enqueue(() => {
      const drafts = this.read(dataDir);
      const next = drafts.filter(
        (draft) =>
          draft.projectId !== projectId ||
          Date.parse(draft.updatedAt) > through,
      );
      if (next.length !== drafts.length) this.write(dataDir, next);
    });
  }

  flush(): Promise<void> {
    return this.tail;
  }

  private enqueue<T>(operation: () => T): Promise<T> {
    const run = this.tail.then(operation, operation);
    this.tail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private file(dataDir: string): string {
    return path.join(
      path.resolve(dataDir),
      ".desktop-recovery",
      "journal.json",
    );
  }

  private read(dataDir: string): RecoveryDraft[] {
    const file = this.file(dataDir);
    if (!fs.existsSync(file)) return [];
    let parsed: unknown;
    try {
      parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
      throw new Error("恢复草稿 journal 无法解析");
    }
    const root = record(parsed, "恢复草稿 journal");
    if (root.version !== JOURNAL_VERSION || !Array.isArray(root.drafts))
      throw new Error("恢复草稿 journal 版本或结构无效");
    return root.drafts
      .map((draft) => cloneDraft(draft))
      .sort(
        (left, right) =>
          Date.parse(right.updatedAt) - Date.parse(left.updatedAt),
      );
  }

  private write(dataDir: string, drafts: RecoveryDraft[]): void {
    const file = this.file(dataDir);
    const directory = path.dirname(file);
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    const journal: JournalFile = {
      version: JOURNAL_VERSION,
      drafts,
    };
    const temp = path.join(
      directory,
      `.journal.${process.pid}.${Date.now()}.${Math.random()
        .toString(16)
        .slice(2)}.tmp`,
    );
    let fd: number | undefined;
    try {
      fd = fs.openSync(temp, "wx", 0o600);
      fs.writeFileSync(fd, JSON.stringify(journal), "utf8");
      fs.fsyncSync(fd);
      fs.closeSync(fd);
      fd = undefined;
      fs.renameSync(temp, file);
      fs.chmodSync(file, 0o600);
      try {
        const directoryFd = fs.openSync(directory, "r");
        try {
          fs.fsyncSync(directoryFd);
        } finally {
          fs.closeSync(directoryFd);
        }
      } catch {
        // Directory fsync is unavailable on Windows; the file itself is synced.
      }
    } finally {
      if (fd !== undefined) fs.closeSync(fd);
      fs.rmSync(temp, { force: true });
    }
  }
}
