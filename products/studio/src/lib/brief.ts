export type OutputHome = "user" | "first-party";

export type BriefInput = {
  projectId?: string;
  title?: string;
  task?: string;
  recipeId?: string;
  recipeTitle?: string;
  requiresList?: boolean;
  voices: Record<string, string>;
  voiceLabels?: Record<string, string>;
  voiceSet?: { ref: string; label?: string };
  langs?: string[];
  langLabels?: Record<string, string>;
  kit: string[];
  kitLabels?: Record<string, string>;
  outputHome?: OutputHome;
  outputs?: Record<string, string>;
};

function named(ref: string, labels?: Record<string, string>): string {
  const label = labels?.[ref];
  return label ? `${ref}（${label}）` : ref;
}

function recipeKey(recipeId?: string): string {
  const id = (recipeId ?? "").trim();
  const dotted = id.includes(".") ? id.slice(id.lastIndexOf(".") + 1) : id;
  return dotted;
}

export function isCloneFromEdit(recipeId?: string): boolean {
  return recipeKey(recipeId) === "clone-from-edit";
}

export function isSeeThenNarrate(recipeId?: string): boolean {
  return recipeKey(recipeId) === "see-then-narrate";
}

export function isHighlightMix(recipeId?: string): boolean {
  return recipeKey(recipeId) === "highlight-mix";
}

export function isCopyThenMatch(recipeId?: string): boolean {
  return recipeKey(recipeId) === "copy-then-match";
}

function skipsRecipeApply(recipeId?: string): boolean {
  return isCloneFromEdit(recipeId) || isSeeThenNarrate(recipeId) || isHighlightMix(recipeId);
}

function uniqueVoiceRef(voices: Record<string, string>): string | undefined {
  const refs = [...new Set(Object.values(voices).filter(Boolean))];
  return refs.length === 1 ? refs[0] : undefined;
}

export function instanceDir(home: OutputHome, id = "<id>", task = "<task>", recipe = "<recipe>"): string {
  const slot = task.trim() || "<task>";
  const method = recipe.trim() || "<recipe>";
  return home === "first-party" ? `data/first-party/${slot}/${method}/${id}` : `data/projects/${slot}/${method}/${id}`;
}

function outputNames(outputs?: Record<string, string>): string {
  if (!outputs) return "";
  return Object.entries(outputs)
    .filter(([, name]) => name)
    .map(([locale, name]) => `${name}（${locale}）`)
    .join("、");
}

function outputLines(input: BriefInput): string[] {
  const id = input.projectId || "<id>";
  if (!input.outputHome) {
    return [
      "产物位置：未指定。开始前先问人写到 data/projects/<task>/<recipe>/<id>/ 还是 data/first-party/<task>/<recipe>/<id>/。",
      "成片只进该目录的 assets/outputs/。人没另给拷贝位置，就不要拷到仓库外。",
      "不要写到 products/study-films/，不要另开 out/。",
    ];
  }

  const root = instanceDir(input.outputHome, id, input.task, recipeKey(input.recipeId) || "<recipe>");
  const names = outputNames(input.outputs);
  return [
    `产物：${root}/assets/outputs/${names ? `（${names}）` : "（文件名以 film.locales.*.output 为准）"}`,
    "人没另给拷贝位置，就不要拷到仓库外。",
    "不要写到 products/study-films/，不要另开 out/。",
  ];
}

function createLine(input: BriefInput): string {
  if (input.projectId) {
    return `先 weaver project show ${input.projectId} --json，核对已点名的增强和产物路径。`;
  }
  if (!input.outputHome) {
    const task = input.task ? `--task ${input.task}` : "--task <task>";
    return `产物位置问清后再 weaver project create。data/projects 用 --source user；data/first-party 用 --source first-party。create 带 ${task}。方法、音色、素材没点就不要代点。`;
  }
  const source = input.outputHome === "first-party" ? "first-party" : "user";
  const task = input.task ? ` --task ${input.task}` : " --task <task>";
  return `先 weaver project create <id> --source ${source}${task}。方法、音色、素材没点就不要代点。`;
}

export function buildAgentBrief(input: BriefInput): string {
  const lines: string[] = [
    "请用 LightWeaver 做后处理出片。方法、音色、素材都是可选增强：点名的按点名用，没点的自己定，不要改已点名的项。",
    "",
  ];

  if (input.projectId) {
    lines.push(`片子：${input.projectId}${input.title ? `（${input.title}）` : ""}`);
  } else {
    lines.push("片子：未指定。按任务新建，或先问人用哪一部已有片子。");
  }

  if (input.task) lines.push(`任务：${input.task}`);
  else lines.push("任务：未点。工作台点任务后再复制；create 必须带 --task。");

  if (input.recipeId) {
    lines.push(`方法：${input.recipeTitle || input.recipeId}`);
    if (isCloneFromEdit(input.recipeId)) {
      lines.push("  不要 recipe apply 铺场。登记视频后 weaver match。");
    } else if (isSeeThenNarrate(input.recipeId)) {
      lines.push("  不要 recipe apply 铺时间轴。登记视频后 weaver describe，按描述树一场一 clip。");
    } else if (isHighlightMix(input.recipeId)) {
      lines.push("  不要 recipe apply 铺场。转写后写 ost: original 的 clip。");
    } else if (input.projectId) {
      const items = input.requiresList ? " --items <人给或任务自带的清单，逗号分隔>" : "";
      lines.push(`  weaver recipe apply --project ${input.projectId} --recipe ${input.recipeId}${items}`);
    }
    if (input.requiresList && !skipsRecipeApply(input.recipeId)) {
      lines.push("  清单一项一场，不要合并。清单从人给或任务自带读，不要去翻别的仓库。");
    }
  } else {
    lines.push("方法：未点。可选增强，自行铺场，不要停下来先选卡。");
  }

  const langs = [...new Set((input.langs ?? []).filter(Boolean))];
  if (langs.length) {
    lines.push(`要出的语言：${langs.map((locale) => input.langLabels?.[locale] ?? locale).join("、")}`);
    if (input.projectId) {
      lines.push(`  weaver langs set --project ${input.projectId} --langs ${langs.join(",")}`);
    }
  } else {
    lines.push("要出的语言：未点名。");
  }

  const packRef = input.voiceSet?.ref ?? uniqueVoiceRef(input.voices);
  if (packRef) {
    const name = input.voiceSet?.label ?? input.voiceLabels?.[packRef];
    lines.push(`音色：${name || packRef}。出片 Hi-Fi clone（克隆源 + 文本）。`);
    if (input.projectId) {
      lines.push(`  weaver voice set --project ${input.projectId} --ref ${packRef}`);
    }
  } else if (Object.values(input.voices).some(Boolean)) {
    lines.push("音色：几种语言还没绑成一套。先收成同一引用，再点。");
  } else {
    lines.push("音色：未点。可选增强。要 tts 而片子还没有克隆源时，先问人。");
  }

  if (input.kit.length) {
    lines.push("素材（可选增强，按需用；有自己想法可以不用或另找）：");
    for (const ref of input.kit) {
      lines.push(`  - ${named(ref, input.kitLabels)}`);
    }
    if (input.projectId) {
      lines.push(`  weaver kit set --project ${input.projectId} --refs ${input.kit.join(",")}`);
    }
  } else {
    lines.push("素材：未点。可选增强，不强制。");
  }

  lines.push(...outputLines(input));

  lines.push("");
  lines.push(createLine(input));
  if (isCloneFromEdit(input.recipeId)) {
    const project = input.projectId ? `--project ${input.projectId}` : "--project <id>";
    lines.push(
      `然后按 skill lightweaver-film：校验 → 把已剪片和原片拷进 assets/source/ → weaver asset add --kind video → weaver match ${project} --edited asset:video.edited → validate → render。`,
    );
    lines.push("不要手填 clip 的 in/out，不要 tts。render 按时间轴 ffmpeg 合成，不要走 Remotion。");
  } else if (isSeeThenNarrate(input.recipeId)) {
    const project = input.projectId ? `--project ${input.projectId}` : "--project <id>";
    lines.push(
      `然后按 skill lightweaver-film：校验 → 登记源视频到 assets/source/ → weaver describe ${project} --ref asset:video.origin → 按 sequences 一场一 clip → 写旁白（观察只当素材）→ tts → validate → render。`,
    );
    lines.push("没有描述树禁止写解说。不要用观察原文当旁白。render 按时间轴 ffmpeg 合成，不要走 Remotion。");
    lines.push("tts 按 VoxCPM2 Hi-Fi clone：ref_audio + 克隆源逐字稿，不要加语言标签。");
  } else if (isHighlightMix(input.recipeId)) {
    const project = input.projectId ? `--project ${input.projectId}` : "--project <id>";
    lines.push(
      `然后按 skill lightweaver-film：校验 → 登记源视频 → weaver transcribe ${project} → 从句子时间抽点写成 ost: original 的 clip → validate → render。`,
    );
    lines.push("不要 tts。静音场需要看见时再 weaver describe。render 按时间轴 ffmpeg 合成，不要走 Remotion。");
  } else if (input.task === "footage-narration") {
    lines.push("然后按 skill lightweaver-film：校验 → 登记源视频到 assets/source/ → 写 clip 的 in/out/ost 与旁白 → tts（跳过 original）→ render。");
    if (isCopyThenMatch(input.recipeId)) {
      lines.push("先过解说再对画面。原片占比是铺场目标，需要原声的场用 ost: original。");
    }
    lines.push("无对白或静音场先 weaver describe，不要空树写旁白。");
    lines.push("render 按时间轴 ffmpeg 合成，不要走 Remotion。");
    lines.push("tts 按 VoxCPM2 Hi-Fi clone：ref_audio + 克隆源逐字稿，不要加语言标签。");
  } else {
    lines.push("然后按 skill lightweaver-film：校验 → 缺静帧再补 → 写旁白 → tts → render。");
    lines.push("tts 按 VoxCPM2 Hi-Fi clone：ref_audio + 克隆源逐字稿，不要加语言标签。");
  }
  lines.push("不要在 Studio 片子页改组合或出片。说明只在工作台复制。");

  return `${lines.join("\n")}\n`;
}
