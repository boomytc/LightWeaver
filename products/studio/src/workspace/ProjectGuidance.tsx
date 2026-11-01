import { WORKFLOWS } from "@lightweaver/weaver/contracts";
import { Button } from "../ui/Button";

export type GuidanceTarget =
  | "assets"
  | "evidence"
  | "scenes"
  | "edit"
  | "captions"
  | "sound"
  | "plan"
  | "delivery";

const workflowSteps: Record<string, GuidanceTarget[]> = {
  "study-explainer": ["scenes", "sound", "delivery"],
  "footage-narration": ["assets", "evidence", "scenes", "plan"],
  "observe-narrate": ["assets", "evidence", "scenes", "sound"],
  "script-search": ["assets", "evidence", "scenes", "plan"],
  "highlight-mix": ["assets", "scenes", "sound"],
  "reference-match": ["assets", "evidence", "scenes", "plan"],
};
const defaultWorkflowSteps: GuidanceTarget[] = ["scenes", "sound", "delivery"];

const targetLabels: Record<GuidanceTarget, string> = {
  assets: "导入素材",
  evidence: "查看证据",
  scenes: "添加场景",
  edit: "编辑画面",
  captions: "检查字幕",
  sound: "配音与音乐（可选）",
  plan: "审阅方案",
  delivery: "查看交付",
};

export function ProjectGuidance({
  workflowId,
  onNavigate,
}: {
  workflowId: string;
  onNavigate: (target: GuidanceTarget) => void;
}) {
  const workflow = WORKFLOWS.find((item) => item.id === workflowId);
  const steps = workflowSteps[workflowId] || defaultWorkflowSteps;
  return (
    <section
      className="flex flex-wrap items-center gap-2 border-b border-line bg-subtle-bg px-3 py-2"
      aria-labelledby="workflow-guidance-title"
    >
      <div className="min-w-48 flex-1">
        <b id="workflow-guidance-title" className="text-xs">
          {workflow?.name || "当前工作流"}
        </b>
        <small className="ml-2 text-muted">
          {workflow?.guidance || "按素材、场景和交付顺序完成作品。"}
        </small>
      </div>
      <div className="flex flex-wrap items-center gap-1.5" aria-label="推荐步骤">
        {steps.map((target, index) => (
          <Button
            key={target}
            size="sm"
            variant="ghost"
            onClick={() => onNavigate(target)}
          >
            <span className="numeric text-muted">{index + 1}</span>
            {targetLabels[target]}
          </Button>
        ))}
      </div>
      <small className="basis-full text-muted">
        这些步骤只提供创作顺序，不限制你添加卡片、静帧或视频片段。
      </small>
    </section>
  );
}
