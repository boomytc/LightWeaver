import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { localConfigValue, modelbestBackend } from "./config.ts";
import { DEFAULT_VLM_MODEL } from "./describe-settings.ts";
import { weaverRoot, weaverScriptsRoot } from "./paths.ts";

export type VlmFrame = { t: number; path: string };

export type VlmRequest = {
  frames: VlmFrame[];
  prompt: string;
  root?: string;
};

export type VlmResult = { observation: string };

export type VlmRuntime = {
  ready: boolean;
  model: string;
  hint?: string;
};

export function parseVlmResult(output: string): VlmResult {
  const lines = output.split(/\r?\n/).map((row) => row.trim());
  let line = "";
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i]?.startsWith("{")) {
      line = lines[i] ?? "";
      break;
    }
  }
  if (!line) throw new Error(`画面描述没有 JSON 输出：${output.slice(-400)}`);
  try {
    const parsed = JSON.parse(line) as { observation?: unknown };
    const observation = String(parsed.observation ?? "").trim();
    if (!observation) throw new Error("空观察");
    return { observation };
  } catch (error) {
    if (error instanceof Error && error.message === "空观察") throw error;
    throw new Error(`画面描述输出无法解析：${line.slice(0, 240)}`);
  }
}

export function vlmRuntime(
  root = weaverRoot(),
  env: NodeJS.ProcessEnv = process.env,
): VlmRuntime {
  const { key } = modelbestBackend(root, env);
  const model = (env.LIGHTWEAVER_VLM_MODEL || localConfigValue("vlm_model", root) || DEFAULT_VLM_MODEL).trim();
  if (key && model) return { ready: true, model };
  const missing = [!key ? "ModelBest 密钥（modelbest_api_key / MODELBEST_API_KEY）" : "", !model ? "vlm_model / LIGHTWEAVER_VLM_MODEL" : ""].filter(
    Boolean,
  );
  return {
    ready: false,
    model,
    hint: `画面描述未就绪：缺 ${missing.join("、")}。在 config.local.yaml 或环境变量里显式给出。`,
  };
}

export function describePrompt(frames: { t: number }[], prev?: string): string {
  const times = frames.map((frame) => frame.t.toFixed(2)).join("、");
  const memory = prev?.trim() ? `上一场：${prev.trim()}` : "上一场：无";
  return `${memory}\n这些帧时间（秒）：${times}。只写能看见的画面，一句中文。不要解说、不要推测、不要编号。`;
}

export function runVlm(request: VlmRequest): VlmResult {
  const root = request.root ?? weaverRoot();
  if (!request.frames.length) throw new Error("没有可描述的帧");
  for (const frame of request.frames) {
    if (!fs.existsSync(frame.path) || fs.statSync(frame.path).size === 0) {
      throw new Error(`找不到描述帧 ${frame.path}`);
    }
  }
  const python = path.join(weaverScriptsRoot(), "vlm.py");
  if (!fs.existsSync(python)) throw new Error(`找不到 ${python}`);
  const runtime = vlmRuntime(root);
  if (!runtime.ready) throw new Error(runtime.hint ?? "画面描述未就绪");
  const jobFile = path.join(os.tmpdir(), `weaver-vlm-${process.pid}-${Date.now()}.job.json`);
  fs.writeFileSync(
    jobFile,
    `${JSON.stringify(
      {
        kind: "describe",
        model: runtime.model,
        prompt: request.prompt,
        frames: request.frames,
        configDirs: [root],
      },
      null,
      2,
    )}\n`,
  );
  try {
    const output = execFileSync("python3", [python, "--job", jobFile], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 16 * 1024 * 1024,
    });
    return parseVlmResult(output);
  } catch (error) {
    const err = error as { stderr?: string; stdout?: string; message: string };
    throw new Error([err.stderr, err.stdout, err.message].filter(Boolean).join("\n"));
  } finally {
    fs.rmSync(jobFile, { force: true });
  }
}
