import fs from "node:fs";
import { WeaverError } from "../contracts/errors.ts";

function errnoCode(error: unknown): string | undefined {
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof error.code === "string"
  )
    return error.code;
  return undefined;
}

export function readTextFile(file: string, label: string): string {
  try {
    return fs.readFileSync(file, "utf8");
  } catch (error) {
    const code = errnoCode(error);
    if (code === "ENOENT")
      throw new WeaverError(
        "NOT_FOUND",
        `${label} 指定的文件不存在: ${file}`,
        { file },
        ["检查路径是否正确，建议传入绝对路径"],
      );
    if (code === "EISDIR")
      throw new WeaverError(
        "INVALID_INPUT",
        `${label} 指向目录，需要普通文件: ${file}`,
        { file },
      );
    throw error;
  }
}

export function readJsonFile(file: string, label: string): unknown {
  const content = readTextFile(file, label);
  try {
    return JSON.parse(content);
  } catch (error) {
    throw new WeaverError(
      "INVALID_INPUT",
      `${label} 不是有效 JSON: ${file}`,
      {
        file,
        reason: error instanceof Error ? error.message : String(error),
      },
      ["检查 JSON 语法、引号和尾随逗号"],
    );
  }
}
