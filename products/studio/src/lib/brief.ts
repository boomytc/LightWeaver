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
  kit: string[];
  kitLabels?: Record<string, string>;
};

function named(ref: string, labels?: Record<string, string>): string {
  const label = labels?.[ref];
  return label ? `${ref}（${label}）` : ref;
}

function uniqueVoiceRef(voices: Record<string, string>): string | undefined {
  const refs = [...new Set(Object.values(voices).filter(Boolean))];
  return refs.length === 1 ? refs[0] : undefined;
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

  const packRef =
    input.voiceSet?.ref ??
    uniqueVoiceRef(input.voices);
  if (packRef) {
    const pack = input.voiceSet?.label
      ? `${packRef}（${input.voiceSet.label}）`
      : named(packRef, input.voiceLabels);
    lines.push(`音色套：${pack}。中英成对，不要拆开换。`);
    if (input.projectId) {
      lines.push(`  weaver voice set --project ${input.projectId} --ref ${packRef}`);
    }
  } else if (Object.values(input.voices).some(Boolean)) {
    lines.push("音色套：中英未绑成一套。先收成同一引用，再点名。");
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

  lines.push("");
  if (input.projectId) {
    lines.push(`先 weaver project show ${input.projectId} --json，核对 voices / kit / recipe。`);
  } else {
    lines.push("先 weaver project create，再 voice set / kit set / recipe apply。");
  }
  lines.push("然后按 skill lightweaver-film：校验 → 缺静帧再截 → 写旁白 → tts → render。");
  lines.push("不要换声，不要加 kit 外元素，不要在 Studio 里排场或出片。");

  return `${lines.join("\n")}\n`;
}
