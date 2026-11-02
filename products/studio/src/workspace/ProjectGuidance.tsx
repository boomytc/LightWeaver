import { useState } from "react";
import { WORKFLOWS } from "@lightweaver/weaver/contracts";
import { Button } from "../ui/Button";
import { CheckIcon, ChevronRightIcon, CloseIcon } from "../ui/Icons";

export type GuidanceTarget = "assets" | "storyboard" | "delivery";

type GuidanceStep = {
  target: GuidanceTarget;
  label: string;
  count: number;
  done: boolean;
};

export function ProjectGuidance({
  workflowId,
  scenes,
  assets,
  deliveries,
  onNavigate,
}: {
  workflowId: string;
  scenes: number;
  assets: number;
  deliveries: number;
  onNavigate: (target: GuidanceTarget) => void;
}) {
  const [dismissed, setDismissed] = useState(false);
  const workflow = WORKFLOWS.find((item) => item.id === workflowId);
  const steps: GuidanceStep[] = [
    { target: "storyboard", label: "场景", count: scenes, done: scenes > 0 },
    { target: "assets", label: "素材", count: assets, done: assets > 0 },
    { target: "delivery", label: "交付", count: deliveries, done: deliveries > 0 },
  ];
  const next = steps.find((step) => !step.done);
  if (dismissed || !next) return null;
  const nextLabel = next.target === "storyboard" ? "添加第一个场景" : next.target === "assets" ? "导入素材" : "查看交付";
  return (
    <section
      className="flex items-center gap-3 border-b border-line bg-subtle-bg px-3 py-1.5"
      aria-label="创作引导"
    >
      <span className="shrink-0 text-xs font-semibold text-ink">{workflow?.name || "创作引导"}</span>
      <ul className="m-0 flex min-w-0 flex-wrap items-center gap-3 p-0" aria-label="完成度">
        {steps.map((step) => (
          <li key={step.target}>
            <button
              type="button"
              className="inline-flex items-center gap-1 text-xs text-muted hover:text-ink"
              onClick={() => onNavigate(step.target)}
            >
              {step.done ? <CheckIcon className="size-3.5 text-ok" /> : <span className="size-3.5 rounded-full border border-line-strong" aria-hidden="true" />}
              <span className={step.done ? "text-ink" : undefined}>{step.label}</span>
              <b className="numeric font-normal text-muted">{step.count}</b>
              <span className="sr-only">{step.done ? "已完成" : "未完成"}</span>
            </button>
          </li>
        ))}
      </ul>
      <span className="min-w-2 flex-1" />
      <Button size="sm" onClick={() => onNavigate(next.target)}>
        下一步：{nextLabel}
        <ChevronRightIcon />
      </Button>
      <Button size="icon" compact variant="ghost" aria-label="关闭创作引导" onClick={() => setDismissed(true)}>
        <CloseIcon />
      </Button>
    </section>
  );
}
