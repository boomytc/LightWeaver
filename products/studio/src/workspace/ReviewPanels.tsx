import {
  ProjectDocument,
  Issue,
  Scene,
  speechOf,
  z,
} from "@lightweaver/weaver/contracts";
import { Badge } from "../ui/Badge";
import { Modal } from "../ui/Modal";

type SummaryRow = {
  label: string;
  value: string;
  signature: string;
  changed: boolean;
};

const BuildPlanStep = z.object({
  key: z.string(),
  operation: z.string(),
  dependencies: z.array(z.string()).default([]),
  provider: z.string(),
  cache: z.string(),
  cacheKey: z.string().optional(),
});

const BuildPlanReview = z.object({
  steps: z.array(BuildPlanStep),
  issues: z.array(Issue),
  reads: z.array(z.string()),
  writes: z.array(z.string()),
  executesMediaOrModels: z.boolean(),
  revision: z.string(),
});

const ImpactReview = z.object({
  affectedTargets: z.array(z.string()),
  note: z.string(),
});

const ReviewOutput = z.union([BuildPlanReview, ImpactReview]);

const sceneNames: Record<Scene["kind"], string> = {
  card: "卡片",
  still: "静帧",
  clip: "视频",
};

const operationNames: Record<string, string> = {
  probe: "探测媒体",
  speech: "准备旁白",
  compile: "编译时间轴",
  render: "渲染版本",
};

const cacheNames: Record<string, string> = {
  hit: "复用缓存",
  miss: "需要生成",
  input: "直接使用输入",
  "pending-facts": "等待探测",
};

export function ConflictReviewDialog({
  open,
  onOpenChange,
  local,
  server,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  local: ProjectDocument | null;
  server: ProjectDocument | null;
}) {
  const localRows = local ? summarizeDocument(local) : [];
  const serverRows = server ? summarizeDocument(server) : [];
  const mergedLabels = [
    ...localRows.map((row) => row.label),
    ...serverRows.map((row) => row.label).filter((label) => !localRows.some((row) => row.label === label)),
  ];
  const rows = mergedLabels.map((label) => {
    const localRow = localRows.find((row) => row.label === label);
    const serverRow = serverRows.find((row) => row.label === label);
    return {
      label,
      localValue: localRow?.value ?? "—",
      serverValue: serverRow?.value ?? "—",
      changed: !localRow || !serverRow || localRow.signature !== serverRow.signature,
    };
  });
  const changedCount = rows.filter((row) => row.changed).length;
  return (
    <Modal open={open} title="对照我的草稿与服务器内容" onOpenChange={onOpenChange}>
      <div className="scroll-region min-h-0 max-h-[70vh] overflow-auto pr-1">
        <p className="hint m-0 text-xs">
          灰色项目表示内容相同，“已变化”表示这一部分需要你确认。服务器内容不会自动覆盖本地草稿。
        </p>
        <div className="mt-3 flex items-center gap-2">
          <Badge tone={changedCount ? "warn" : "ok"}>
            {changedCount ? `${changedCount} 个部分有变化` : "没有可摘要的差异"}
          </Badge>
        </div>
        <section className="panel-card mt-3 overflow-hidden" aria-label="草稿与服务器内容对照">
          <div className="grid grid-cols-2 border-b border-line bg-subtle-bg">
            <div className="flex items-center justify-between gap-2 px-3 py-2">
              <b className="text-xs">我的本地草稿</b>
              <small className="numeric">{localRows.length}</small>
            </div>
            <div className="flex items-center justify-between gap-2 border-l border-line px-3 py-2">
              <b className="text-xs">服务器当前内容</b>
              <small className="numeric">{serverRows.length}</small>
            </div>
          </div>
          <dl className="m-0">
            {rows.map((row) => (
              <div className="border-b border-line last:border-0" key={row.label}>
                <dt className="flex items-center justify-between gap-2 px-3 pt-2">
                  <span className="text-xs font-semibold">{row.label}</span>
                  {row.changed ? <Badge tone="warn">已变化</Badge> : <Badge>相同</Badge>}
                </dt>
                <dd className="m-0 grid grid-cols-2">
                  <span className="whitespace-pre-line break-words px-3 pb-2 pt-1 text-xs text-muted">{row.localValue}</span>
                  <span className="whitespace-pre-line break-words border-l border-line px-3 pb-2 pt-1 text-xs text-muted">{row.serverValue}</span>
                </dd>
              </div>
            ))}
          </dl>
        </section>
        <details className="mt-4">
          <summary>展开原始诊断详情</summary>
          <div className="mt-2 grid gap-2 md:grid-cols-2">
            <pre className="code-block max-h-72">{JSON.stringify(local, null, 2)}</pre>
            <pre className="code-block max-h-72">{JSON.stringify(server, null, 2)}</pre>
          </div>
        </details>
      </div>
    </Modal>
  );
}

export function ProjectReviewDialog({
  open,
  onOpenChange,
  value,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: unknown;
}) {
  const parsed = value === null ? null : ReviewOutput.safeParse(value);
  return (
    <Modal open={open && value !== null} title="制作计划与影响" onOpenChange={onOpenChange}>
      <div className="scroll-region min-h-0 max-h-[70vh] overflow-auto pr-1">
        {parsed?.success && "steps" in parsed.data && (
          <BuildPlanSummary value={parsed.data} />
        )}
        {parsed?.success && "affectedTargets" in parsed.data && (
          <ImpactSummary value={parsed.data} />
        )}
        {parsed && !parsed.success && (
          <p className="error m-0">
            这次响应暂时无法按当前计划结构读取。原始详情仍保留在下方，可交给技术支持定位。
          </p>
        )}
        <details className="mt-4">
          <summary>展开原始诊断详情</summary>
          <pre className="code-block mt-2 max-h-80">{JSON.stringify(value, null, 2)}</pre>
        </details>
      </div>
    </Modal>
  );
}

function summarizeDocument(document: ProjectDocument): SummaryRow[] {
  const sceneCounts = document.scenes.reduce(
    (counts, scene) => {
      counts[scene.kind] += 1;
      return counts;
    },
    { card: 0, still: 0, clip: 0 },
  );
  const clipDurationUs = document.scenes.reduce(
    (total, scene) => total + (scene.kind === "clip" ? scene.sourceRange.durationUs : 0),
    0,
  );
  const clipSelections = document.scenes.flatMap((scene) =>
    scene.kind === "clip"
      ? [{
          source: scene.source,
          range: scene.sourceRange,
        }]
      : [],
  );
  const narrationCount = document.scenes.filter((scene) => speechOf(scene)).length;
  const narrations = document.scenes.flatMap((scene) => {
    const speech = speechOf(scene);
    return speech ? [{ sceneId: scene.id, speech }] : [];
  });
  const cueCount = document.captions.reduce(
    (total, track) => total + track.cues.length,
    0,
  );
  const planValue = document.creativePlan
    ? `${document.creativePlan.title || "未命名方案"} · ${document.creativePlan.beats.length} 个节拍`
    : "没有创作方案";
  const order = document.scenes.length
    ? document.scenes
        .map((scene, index) => `${index + 1}. ${scene.label || sceneNames[scene.kind]}`)
        .join(" / ")
    : "尚无场景";
  const rows: Omit<SummaryRow, "changed">[] = [
    {
      label: "标题",
      value: document.title || "未命名项目",
      signature: JSON.stringify(document.title),
    },
    {
      label: "场景顺序",
      value: order,
      signature: JSON.stringify(document.scenes.map((scene) => ({
        id: scene.id,
        label: scene.label,
      }))),
    },
    {
      label: "画面构成",
      value: `卡片 ${sceneCounts.card} 张 · 静帧 ${sceneCounts.still} 个 · 视频片段 ${sceneCounts.clip} 个`,
      signature: JSON.stringify(document.scenes.map((scene) => scene.kind)),
    },
    {
      label: "场景内容与时长",
      value: document.scenes.map((scene, index) => {
        const content = scene.kind === "card"
          ? Object.values(scene.cardSpec.copy).map((copy) => [copy.headline, ...copy.points].join("；")).join(" / ")
          : scene.kind === "still" ? `图片 ${scene.image.assetId}` : `视频 ${scene.source.assetId}`;
        const timing = scene.kind === "clip"
          ? `${(scene.sourceRange.startUs / 1e6).toFixed(2)} 秒起，截取 ${(scene.sourceRange.durationUs / 1e6).toFixed(2)} 秒`
          : scene.timing.kind === "fixed" ? `${scene.timing.frames} 帧` : "按真实旁白计时";
        return `${index + 1}. ${content} · ${timing}`;
      }).join("\n") || "尚无场景",
      signature: JSON.stringify(document.scenes),
    },
    {
      label: "选段",
      value: clipDurationUs ? `视频选段合计 ${(clipDurationUs / 1_000_000).toFixed(2)} 秒` : "没有视频选段",
      signature: JSON.stringify(clipSelections),
    },
    {
      label: "旁白",
      value: narrationCount ? narrations.map(({ sceneId, speech }) =>
        `${sceneId}：${Object.values(speech.text).filter(Boolean).join(" / ") || (speech.kind === "imported" ? "上传的旁白音频" : "尚未填写文案")}`,
      ).join("\n") : "没有旁白",
      signature: JSON.stringify(narrations),
    },
    {
      label: "字幕",
      value: document.captions.length
        ? `${document.captions.length} 条字幕轨 · ${cueCount} 条字幕`
        : "没有字幕",
      signature: JSON.stringify(document.captions),
    },
    {
      label: "遮罩",
      value: document.masks.length ? `${document.masks.length} 个遮罩` : "没有遮罩",
      signature: JSON.stringify(document.masks),
    },
    {
      label: "方案",
      value: planValue,
      signature: JSON.stringify(document.creativePlan || null),
    },
    {
      label: "背景音乐",
      value: document.bgm ? "已设置" : "未设置",
      signature: JSON.stringify(document.bgm || null),
    },
    {
      label: "素材与方法",
      value: `${document.assets.length} 项素材 · ${document.method ? document.method.itemId : "未指定方法"}`,
      signature: JSON.stringify({ assets: document.assets, method: document.method, bindings: document.bindings, workflow: document.workflow }),
    },
    {
      label: "输出规格",
      value: `${document.locales.join(" / ")} · ${document.profiles.map((profile) => `${profile.id} ${profile.width}×${profile.height}`).join(" / ")}`,
      signature: JSON.stringify({
        locales: document.locales,
        profiles: document.profiles,
      }),
    },
  ];
  return rows.map((row) => ({ ...row, changed: false }));
}

function BuildPlanSummary({
  value,
}: {
  value: z.infer<typeof BuildPlanReview>;
}) {
  const groups = new Map<string, z.infer<typeof BuildPlanStep>[]>();
  for (const step of value.steps) {
    const group = groups.get(step.operation) || [];
    group.push(step);
    groups.set(step.operation, group);
  }
  const cacheCounts = value.steps.reduce((counts, step) => {
    counts.set(step.cache, (counts.get(step.cache) || 0) + 1);
    return counts;
  }, new Map<string, number>());
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-2 sm:grid-cols-3">
        <Metric label="计划步骤" value={String(value.steps.length)} />
        <Metric label="需处理问题" value={String(value.issues.length)} tone={value.issues.length ? "warn" : "ok"} />
        <Metric
          label="执行范围"
          value={value.executesMediaOrModels ? "包含媒体或模型" : "只做静态检查"}
        />
      </div>
      <section className="panel-card p-3">
        <h3 className="m-0 text-xs font-semibold">步骤与缓存</h3>
        <div className="mt-2 flex flex-col gap-2">
          {[...groups.entries()].map(([operation, steps]) => (
            <div key={operation} className="flex flex-wrap items-center gap-2 border-b border-line pb-2 last:border-0 last:pb-0">
              <b className="min-w-24 text-xs">{operationNames[operation] || operation}</b>
              <Badge>{steps.length} 步</Badge>
              {[...new Set(steps.map((step) => step.cache))].map((cache) => (
                <span key={cache} className="text-xs text-muted">
                  {cacheNames[cache] || cache}
                </span>
              ))}
            </div>
          ))}
          {!groups.size && <small className="text-muted">当前没有需要执行的步骤。</small>}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {[...cacheCounts.entries()].map(([cache, count]) => (
            <Badge key={cache} tone={cache === "hit" ? "ok" : cache === "miss" ? "warn" : "neutral"}>
              {cacheNames[cache] || cache} {count}
            </Badge>
          ))}
        </div>
      </section>
      <section className="panel-card p-3">
        <h3 className="m-0 text-xs font-semibold">检查结果</h3>
        {value.issues.length ? (
          <div className="mt-2 flex flex-col gap-2">
            {value.issues.map((issue, index) => (
              <article key={`${issue.code}-${index}`} className="subtle-card p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={issue.severity === "error" ? "danger" : "warn"}>
                    {issue.severity === "error" ? "需要处理" : "提示"}
                  </Badge>
                  <b className="text-xs">{issue.message}</b>
                  <small className="numeric text-muted">{issue.path}</small>
                </div>
                {issue.hints.length > 0 && (
                  <ul className="mb-0 mt-2 pl-5 text-xs text-muted">
                    {issue.hints.map((hint) => <li key={hint}>{hint}</li>)}
                  </ul>
                )}
              </article>
            ))}
          </div>
        ) : (
          <p className="mb-0 mt-2 text-xs text-ok">当前计划没有发现阻断制作的问题。</p>
        )}
      </section>
      <section className="panel-card p-3 text-xs">
        <b>读取</b>
        <p className="mb-2 mt-1 text-muted">{value.reads.join(" · ") || "无"}</p>
        <b>写入</b>
        <p className="m-0 mt-1 text-muted">{value.writes.join(" · ") || "无"}</p>
      </section>
    </div>
  );
}

function ImpactSummary({
  value,
}: {
  value: z.infer<typeof ImpactReview>;
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="hint m-0 text-xs">{value.note}</p>
      {value.affectedTargets.length ? (
        <div className="flex flex-wrap gap-2">
          {value.affectedTargets.map((target) => <Badge key={target} tone="warn">{target}</Badge>)}
        </div>
      ) : (
        <p className="m-0 text-xs text-ok">当前草稿没有改变已登记的输出目标。</p>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "ok" | "warn";
}) {
  return (
    <div className="subtle-card p-3">
      <small className="text-muted">{label}</small>
      <b className="mt-1 block text-sm">
        {tone === "neutral" ? value : <Badge tone={tone}>{value}</Badge>}
      </b>
    </div>
  );
}
