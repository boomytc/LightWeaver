import { z, ErrorProtocol } from "@lightweaver/weaver/contracts";
export class ApiError extends Error {
  constructor(readonly protocol: z.infer<typeof ErrorProtocol>) {
    super(protocol.message);
  }
}
export async function api<T>(
  url: string,
  schema: z.ZodType<T>,
  options: { method?: string; body?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  const response = await fetch(`/api${url}`, {
    method: options.method || "GET",
    signal: options.signal,
    headers:
      options.body instanceof FormData
        ? undefined
        : { "Content-Type": "application/json" },
    body:
      options.body === undefined
        ? undefined
        : options.body instanceof FormData
          ? options.body
          : JSON.stringify(options.body),
  });
  const raw: unknown = await response.json();
  const envelope = z
    .object({
      ok: z.boolean(),
      result: z.unknown().optional(),
      error: ErrorProtocol.optional(),
    })
    .parse(raw);
  if (!envelope.ok || !response.ok)
    throw new ApiError(
      envelope.error || {
        code: "HTTP_ERROR",
        message: `HTTP ${response.status}`,
        retryable: false,
        hints: [],
      },
    );
  return schema.parse(envelope.result);
}
export const requestId = () => `ui-${crypto.randomUUID()}`;
export const mediaUrl = (digest: string) =>
  `/api/media/${encodeURIComponent(digest)}`;
