import { useState } from "react";
import { ProjectRevision, WORKFLOWS, z } from "@lightweaver/weaver/contracts";
import { api, requestId } from "../api";
import { Field } from "../ui/Field";
import { Button } from "../ui/Button";
import { Badge } from "../ui/Badge";
import { MethodIcon, PlusIcon } from "../ui/Icons";

export function CreateProject({
  onCreated,
  fail,
}: {
  onCreated: (project: z.infer<typeof ProjectRevision>) => Promise<void>;
  fail: (reason: unknown) => void;
}) {
  const [title, setTitle] = useState("");
  const [workflow, setWorkflow] = useState("study-explainer");
  const [creating, setCreating] = useState(false);
  const current = WORKFLOWS.find((item) => item.id === workflow);
  const create = async () => {
    if (creating) return;
    setCreating(true);
    try {
      const project = await api("/projects", ProjectRevision, {
        method: "POST",
        body: { title, workflow, requestId: requestId() },
      });
      await onCreated(project);
    } catch (reason) {
      fail(reason);
    } finally {
      setCreating(false);
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
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          void create();
        }}
      >
        <Field label="片名">
          <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="输入片名" />
        </Field>
        <Field label="工作流">
          <select value={workflow} onChange={(event) => setWorkflow(event.target.value)}>
            {WORKFLOWS.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </Field>
        <div className="subtle-card p-3">
          <b className="text-xs">{current?.name || "当前工作流"}</b>
          <p className="hint m-0 mt-1 text-xs">{current?.guidance || "选择适合本次创作的工作流。"}</p>
        </div>
        <Button type="submit" variant="primary" disabled={creating}>
          <PlusIcon />
          {creating ? "正在创建…" : "创建草稿"}
        </Button>
      </form>
    </section>
  );
}
