import { useRef, useState } from "react";
import { ProjectRevision, WORKFLOWS, z } from "@lightweaver/weaver/contracts";
import { api, requestId } from "../api";
import { Field } from "../ui/Field";
import { Button } from "../ui/Button";
import { Badge } from "../ui/Badge";
import { MethodIcon, PlusIcon } from "../ui/Icons";
import { NativeSelect } from "../ui/NativeSelect";

export function CreateProject({
  onCreated,
  fail,
}: {
  onCreated: (project: z.infer<typeof ProjectRevision>) => Promise<void>;
  fail: (reason: unknown) => void;
}) {
  const [title, setTitle] = useState("");
  const [titleTouched, setTitleTouched] = useState(false);
  const [workflow, setWorkflow] = useState("study-explainer");
  const [pending, setPending] = useState<"manual" | "starter" | null>(null);
  const creating = useRef(false);
  const retry = useRef<{ key: string; requestId: string; project?: z.infer<typeof ProjectRevision> } | null>(null);
  const current = WORKFLOWS.find((item) => item.id === workflow);
  const titleError = titleTouched && !title.trim() ? "片名不能为空" : "";
  const create = async (kind: "manual" | "starter") => {
    if (creating.current) return;
    creating.current = true;
    setPending(kind);
    const payload = kind === "starter"
      ? { title: "我的第一支视频", workflow: "study-explainer", template: "starter" as const }
      : { title, workflow };
    const key = JSON.stringify(payload);
    const attempt = retry.current?.key === key ? retry.current : { key, requestId: requestId() };
    retry.current = attempt;
    try {
      const project = attempt.project || await api("/projects", ProjectRevision, {
        method: "POST",
        body: { ...payload, requestId: attempt.requestId },
      });
      attempt.project = project;
      await onCreated(project);
      if (retry.current === attempt) retry.current = null;
    } catch (reason) {
      fail(reason);
    } finally {
      creating.current = false;
      setPending(null);
    }
  };
  return (
    <section className="panel-card p-5" aria-labelledby="create-project-title">
      <div className="section-title mb-4">
        <div>
          <span className="dropzone-icon size-8"><MethodIcon /></span>
          <div>
            <h2 id="create-project-title" className="m-0">新建项目草稿</h2>
            <small>先确定片名与创作工作流</small>
          </div>
        </div>
        <Badge tone="accent">快速开始</Badge>
      </div>
      <div className="flex flex-col gap-2 border-b border-line pb-4">
        <div>
          <b className="text-sm">我的第一支视频</b>
          <p className="hint mb-0 mt-1 text-xs">
            打开三张文字卡片组成的示例，即可开始制作。
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Badge tone="ok">无需模型</Badge>
          <Badge tone="ok">无需自备素材</Badge>
        </div>
        <Button
          className="w-full"
          variant="primary"
          disabled={pending !== null}
          onClick={() => void create("starter")}
        >
          {pending === "starter" ? "正在打开示例…" : "打开示例"}
        </Button>
      </div>
      <form
        className="mt-4 flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!title.trim()) {
            setTitleTouched(true);
            return;
          }
          void create("manual");
        }}
      >
        <Field label="片名" required error={titleError}>
          <input
            value={title}
            aria-invalid={titleError ? true : undefined}
            onBlur={() => setTitleTouched(true)}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="输入片名"
          />
        </Field>
        <Field
          label="工作流"
          hint={current ? `${current.name}：${current.guidance}` : "选择适合本次创作的工作流。"}
        >
          <NativeSelect value={workflow} onChange={(event) => setWorkflow(event.target.value)}>
            {WORKFLOWS.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </NativeSelect>
        </Field>
        <Button type="submit" disabled={pending !== null || !title.trim()}>
          <PlusIcon />
          {pending === "manual" ? "正在创建…" : "创建空白草稿"}
        </Button>
      </form>
    </section>
  );
}
