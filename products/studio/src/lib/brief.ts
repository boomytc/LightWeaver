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
  publish?: boolean;
  publishDir?: string;
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

function defaultPublishDir(home: OutputHome | undefined, id: string): string | undefined {
  if (home !== "first-party") return undefined;
  return `studies/${id}/references`;
}

function outputLines(input: BriefInput): string[] {
  const id = input.projectId || (input.outputHome === "first-party" ? "<slug>" : "<id>");
  if (!input.outputHome) {
    return [
      "产物位置：未指定。开始前先问人，问清再 create / render：",
      "  - 用户片写 data/projects/<id>/assets/outputs/",
      "  - LightUI 顾客片写 data/first-party/<slug>/assets/outputs/（film.id === slug），并问要不要再拷到 LightUI studies/<slug>/references/（只 mp4）",
      "不要写到 products/study-films/，不要另开 out/。",
    ];
  }

  const root = instanceDir(input.outputHome, id);
  const names = outputNames(input.outputs);
  const lines = [
    `产物：${root}/assets/outputs/${names ? `（${names}）` : "（文件名以 film.locales.*.output 为准）"}`,
  ];
  const wantPublish =
    input.publish !== undefined ? input.publish : Boolean(input.publishDir) || input.outputHome === "first-party";
  if (wantPublish) {
    const dest = input.publishDir || defaultPublishDir(input.outputHome, id);
    if (dest) {
      lines.push(`发布：render 之后才 publish，只拷 mp4 到 ${dest}。`);
    } else {
      lines.push("发布：要发布但还没路径。开始前先问人 LightUI 的 references 目录。");
    }
  } else {
    lines.push("发布：不要 publish。只留片子目录。");
  }
  lines.push("不要写到 products/study-films/，不要另开 out/。");
  return lines;
}

function createLine(input: BriefInput): string {
  if (input.projectId) {
    return `先 weaver project show ${input.projectId} --json，核对 voices / kit / recipe / 产物路径。`;
  }
  if (!input.outputHome) {
    return "产物位置问清后再 weaver project create。用户片加 --source user；顾客片加 --source first-party --study-slug <slug>。";
  }
  if (input.outputHome === "first-party") {
    return "先 weaver project create <slug> --source first-party --study-slug <slug>，再 langs set / voice set / kit set / recipe apply。";
  }
  return "先 weaver project create <id> --source user，再 langs set / voice set / kit set / recipe apply。";
}

export function buildAgentBrief(input: BriefInput): string {
  const task = input.task || "study-explainer";
  const lines: string[] = [
    "请用 LightWeaver 按下面这组组合出片，不要改组合。",
    "",
  ];

  if (input.projectId) {
    lines.push(`片子：${input.projectId}${input.title ? `（${input.title}）` : ""}`);
  } else {
    lines.push("片子：未指定。agent 按任务新建，或选用已有片子后再绑定这组。");
  }

  lines.push(`任务：${task}`);

  if (input.recipeId) {
    const title = input.recipeTitle ? `（${input.recipeTitle}）` : "";
    lines.push(`方法卡：${input.recipeId}${title}`);
    if (input.projectId) {
      const kinds = input.requiresKinds
        ? " --kinds <从该 study 的 kinds.ts 读，逗号分隔>"
        : "";
      lines.push(`  weaver recipe apply --project ${input.projectId} --recipe ${input.recipeId}${kinds}`);
    } else {
      lines.push(`  建片后：weaver recipe apply --project <id> --recipe ${input.recipeId}`);
    }
    if (input.requiresKinds) {
      lines.push("  kinds 从 study 的 kinds.ts 读，一种 kind 一场，不要合并。");
    }
  } else {
    lines.push("方法卡：未点名。先选定一张成片方法卡（对照表阅兵 / 问题然后规则）。");
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

  const packRef =
    input.voiceSet?.ref ??
    uniqueVoiceRef(input.voices);
  if (packRef) {
    const name = input.voiceSet?.label ?? input.voiceLabels?.[packRef];
    lines.push(`音色套：${name || packRef}。出片 Hi-Fi clone（克隆源 + 文本）。`);
    if (input.projectId) {
      lines.push(`  weaver voice set --project ${input.projectId} --ref ${packRef}`);
    }
  } else if (Object.values(input.voices).some(Boolean)) {
    lines.push("音色套：几种语言还没绑成一套。先收成同一引用，再点名。");
  } else {
    lines.push("音色套：未点名。");
  }

  if (input.kit.length) {
    lines.push("素材（只准用这些，不要加清单外的）：");
    for (const ref of input.kit) {
      lines.push(`  - ${named(ref, input.kitLabels)}`);
    }
    if (input.projectId) {
      lines.push(`  weaver kit set --project ${input.projectId} --refs ${input.kit.join(",")}`);
    }
  } else {
    lines.push("素材：未点名。不要自己加 library 外的元素。");
  }

  lines.push(...outputLines(input));

  lines.push("");
  lines.push(createLine(input));
  lines.push("然后按 skill lightweaver-film：校验 → 缺静帧再截 → 写旁白 → tts → render。");
  lines.push("tts 按 VoxCPM2 Hi-Fi clone：ref_audio + 克隆源逐字稿，不要加语言标签。");
  lines.push("不要换声，不要加 kit 外元素，不要在 Studio 里排场或出片。");

  return `${lines.join("\n")}\n`;
}
