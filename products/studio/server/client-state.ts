import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { z } from "@lightweaver/weaver/contracts";
import { WeaverError } from "@lightweaver/weaver/app";

const DraftBackup = z
  .object({
    projectId: z.string().min(1),
    base: z.string().min(1),
    document: z.unknown().optional(),
    creativePlanDraft: z.unknown().optional(),
    updatedAt: z.string(),
  })
  .strict();

export const ClientState = z
  .object({
    revision: z.string(),
    theme: z.enum(["system", "light", "dark"]),
    recentProjectIds: z.array(z.string()),
    layout: z
      .object({
        left: z.number().int().min(160).max(640),
        right: z.number().int().min(220).max(640),
        bottom: z.number().int().min(120).max(480),
        collapsed: z
          .object({
            left: z.boolean(),
            right: z.boolean(),
            bottom: z.boolean(),
          })
          .strict(),
      })
      .strict(),
    drafts: z.array(DraftBackup),
  })
  .strict();
export type ClientState = z.infer<typeof ClientState>;

const Body = ClientState.omit({ revision: true });

export function emptyClientState(): ClientState {
  const body = {
    theme: "system" as const,
    recentProjectIds: [],
    layout: {
      left: 280,
      right: 320,
      bottom: 220,
      collapsed: { left: false, right: false, bottom: false },
    },
    drafts: [],
  };
  return { ...body, revision: revisionOf(body) };
}

function revisionOf(body: z.infer<typeof Body>): string {
  return createHash("sha256").update(JSON.stringify(body)).digest("hex");
}

export class ClientStateStore {
  constructor(private readonly file: string) {}

  read(): ClientState {
    try {
      const parsed = Body.parse(JSON.parse(fs.readFileSync(this.file, "utf8")));
      return { ...parsed, revision: revisionOf(parsed) };
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT")
        return emptyClientState();
      throw new WeaverError("CLIENT_STATE_INVALID", "客户端状态无法读取，原文件已保留", { file: this.file });
    }
  }

  write(input: unknown): ClientState {
    const current = this.read();
    const patch = z
      .object({
        expectedRevision: z.string(),
        theme: ClientState.shape.theme.optional(),
        recentProjectIds: ClientState.shape.recentProjectIds.optional(),
        layout: ClientState.shape.layout.optional(),
        drafts: ClientState.shape.drafts.optional(),
      })
      .strict()
      .parse(input);
    if (patch.expectedRevision !== current.revision) {
      throw new WeaverError("CLIENT_STATE_CONFLICT", "客户端状态已被其他操作修改", { current }, [], true);
    }
    const next = Body.parse({
      theme: patch.theme ?? current.theme,
      recentProjectIds: patch.recentProjectIds ?? current.recentProjectIds,
      layout: patch.layout ?? current.layout,
      drafts: patch.drafts ?? current.drafts,
    });
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const temp = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(next), { mode: 0o600 });
    fs.renameSync(temp, this.file);
    return { ...next, revision: revisionOf(next) };
  }
}
