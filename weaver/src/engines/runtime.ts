import fs from "node:fs";
import path from "node:path";
import { z, ModelSettingsField } from "../contracts/index.ts";
import { currentRuntime } from "../runtime.ts";
import { defaultModelPython, defaultSpeechPython, resolveExecutable } from "../adapters/executable.ts";
import { engineCatalog, engineBindingValue, installDirectory } from "./catalog.ts";
import { bundledBinding } from "./bundled.ts";

const environments: Record<string, string> = {
  asr_library: "TRANSCRIBE_LIBRARY",
  asr_bindings: "LIGHTWEAVER_ASR_BINDINGS",
  vad_library: "LIGHTWEAVER_VAD_LIBRARY",
  llama_server: "LIGHTWEAVER_LLAMA_SERVER",
  visual_server: "LIGHTWEAVER_VISUAL_SERVER",
  translation_server: "LIGHTWEAVER_TRANSLATION_SERVER",
  model_python: "LIGHTWEAVER_MODEL_PYTHON",
  speech_python: "LIGHTWEAVER_SPEECH_PYTHON",
};

export function engineRoot(env: NodeJS.ProcessEnv = process.env): z.infer<typeof ModelSettingsField> {
  const value = env.LIGHTWEAVER_ENGINE_ROOT?.trim();
  return value
    ? { value: path.resolve(currentRuntime().configBase, value), source: "environment" }
    : { value: currentRuntime().engineDir, source: "default" };
}

/** 运行组件只来自显式环境覆盖、受管安装或随包资源，不读取模型配置。 */
export function runtimeBinding(setting: string, env: NodeJS.ProcessEnv = process.env): z.infer<typeof ModelSettingsField> {
  const runtime = currentRuntime();
  const item = engineCatalog().items.find((item) => item.bindings.some((binding) => binding.setting === setting));
  const binding = item?.bindings.find((binding) => binding.setting === setting);
  if (!item || !binding) return { value: "", source: "unset" };
  const override = env[environments[setting]]?.trim();
  if (override) return {
    value: binding.target === "executable" ? resolveExecutable(override, runtime.configBase) : path.resolve(runtime.configBase, override),
    source: "environment",
  };
  const directory = installDirectory(engineRoot(env).value, item.id);
  if (fs.existsSync(directory)) return { value: engineBindingValue(directory, binding), source: "default" };
  const bundled = bundledBinding(setting);
  if (bundled) return { value: bundled, source: "default" };
  if (runtime.mode === "development" && (setting === "model_python" || setting === "speech_python")) {
    const python = path.join(runtime.resourcesDir, setting === "model_python" ? defaultModelPython() : defaultSpeechPython());
    if (fs.existsSync(python)) return { value: python, source: "default" };
  }
  return { value: "", source: "unset" };
}
