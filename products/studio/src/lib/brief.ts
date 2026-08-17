export type OutputHome = "user" | "first-party";

export type BriefInput = {
  projectId?: string;
  title?: string;
  task?: string;
  recipeId?: string;
  recipeTitle?: string;
  requiresKinds?: boolean;
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

function uniqueVoiceRef(voices: Record<string, string>): string | undefined {
  const refs = [...new Set(Object.values(voices).filter(Boolean))];
  return refs.length === 1 ? refs[0] : undefined;
}

export function instanceDir(home: OutputHome, id = "<id>"): string {
  return home === "first-party" ? `data/first-party/${id}` : `data/projects/${id}`;
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
      "产物位置：未指定。开始前先问人写到 data/projects/<id>/ 还是 data/first-party/<id>/。",
      "成片只进该目录的 assets/outputs/。人没另给拷贝位置，就不要拷到仓库外。",
      "不要写到 products/study-films/，不要另开 out/。",
    ];
  }

  const root = instanceDir(input.outputHome, id);
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
    return "产物位置问清后再 weaver project create。data/projects 用 --source user；data/first-party 用 --source first-party。方法、音色、素材没点就不要代点。";
  }
  const source = input.outputHome === "first-party" ? "first-party" : "user";
  return `先 weaver project create <id> --source ${source}。方法、音色、素材没点就不要代点。`;
}

export function buildAgentBrief(input: BriefInput): string {
  const task = input.task || "study-explainer";
  const lines: string[] = [
    "请用 LightWeaver 做后处理出片。方法、音色、素材都是可选增强：点名的按点名用，没点的自己定，不要改已点名的项。",
    "",
  ];

  if (input.projectId) {
    lines.push(`片子：${input.projectId}${input.title ? `（${input.title}）` : ""}`);
  } else {
    lines.push("片子：未指定。按任务新建，或先问人用哪一部已有片子。");
  }

  lines.push(`任务：${task}`);

  if (input.recipeId) {
    lines.push(`方法：${input.recipeTitle || input.recipeId}`);
    if (input.projectId) {
      const kinds = input.requiresKinds ? " --kinds <人给或任务自带的清单，逗号分隔>" : "";
      lines.push(`  weaver recipe apply --project ${input.projectId} --recipe ${input.recipeId}${kinds}`);
    }
    if (input.requiresKinds) {
      lines.push("  一种模型一场，不要合并。kinds 从人给的清单或任务自带清单读，不要去翻别的仓库。");
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
  lines.push("然后按 skill lightweaver-film：校验 → 缺静帧再补 → 写旁白 → tts → render。");
  lines.push("tts 按 VoxCPM2 Hi-Fi clone：ref_audio + 克隆源逐字稿，不要加语言标签。");
  lines.push("不要在 Studio 片子页改组合或出片。说明只在工作台复制。");

  return `${lines.join("\n")}\n`;
}
