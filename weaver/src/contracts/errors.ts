import { z, ErrorProtocol } from "./index.ts";

export class WeaverError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details: unknown = null,
    readonly hints: string[] = [],
    readonly retryable = false,
  ) {
    super(message);
  }
}
export function errorProtocol(error: unknown): z.infer<typeof ErrorProtocol> {
  if (error instanceof WeaverError)
    return {
      code: error.code,
      message: error.message,
      details: error.details,
      hints: error.hints,
      retryable: error.retryable,
    };
  if (error instanceof z.ZodError)
    return {
      code: "INVALID_INPUT",
      message: "输入不符合合同",
      retryable: false,
      details: error.issues,
      hints: ["运行 weaver schema 查看合同"],
    };
  return {
    code: "EXECUTION_FAILED",
    message: error instanceof Error ? error.message : String(error),
    retryable: false,
    hints: [],
  };
}
export function exitCode(code: string): number {
  return code === "REVISION_CONFLICT"
    ? 3
    : code === "CONFIG_MISSING" || code === "CAPABILITY_UNAVAILABLE"
      ? 4
      : [
            "INVALID_INPUT",
            "NOT_FOUND",
            "REQUEST_ID_REUSED",
            "BUILD_ISSUES",
            "ALIGNMENT_LANGUAGE_UNSUPPORTED",
            "INPUT_TOO_LONG",
          ].includes(code)
        ? 2
        : 1;
}
export function httpStatus(code: string): number {
  return code === "REVISION_CONFLICT" || code === "REQUEST_ID_REUSED"
    ? 409
    : code === "NOT_FOUND"
      ? 404
      : [
            "INVALID_INPUT",
            "BUILD_ISSUES",
            "ALIGNMENT_LANGUAGE_UNSUPPORTED",
            "INPUT_TOO_LONG",
          ].includes(code)
        ? 400
        : code === "CONFIG_MISSING" || code === "CAPABILITY_UNAVAILABLE"
          ? 422
          : 500;
}
