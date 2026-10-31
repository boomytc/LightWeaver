import { useState } from "react";
import { ProjectRevision, WORKFLOWS, z } from "@lightweaver/weaver/contracts";
import { api, requestId } from "../api";
import { Field } from "../ui/Field";
import { SoftPillButton } from "../ui/SoftPillButton";

export function CreateProject({
  onCreated,
  fail,
}: {
  onCreated: (p: z.infer<typeof ProjectRevision>) => Promise<void>;
  fail: (e: unknown) => void;
}) {
  const [title, setTitle] = useState(""),
    [workflow, setWorkflow] = useState("study-explainer");
  return (
    <section className="mx-auto mt-8 max-w-xl rounded-[22px] border border-line bg-panel p-8 shadow-[var(--lw-shadow)]">
      <h1 className="m-0">开始一部片子</h1>
      <p>素材、观察、创作与制作结果保存在同一个项目里。</p>
      <Field label="片名">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="输入片名"
        />
      </Field>
      <Field label="工作流预设">
        <select value={workflow} onChange={(e) => setWorkflow(e.target.value)}>
          {WORKFLOWS.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
      </Field>
      <p>{WORKFLOWS.find((w) => w.id === workflow)?.guidance}</p>
      <SoftPillButton
        className="mt-2"
        onClick={() =>
          api("/projects", ProjectRevision, {
            method: "POST",
            body: { title, workflow, requestId: requestId() },
          })
            .then(onCreated)
            .catch(fail)
        }
      >
        创建草稿
      </SoftPillButton>
    </section>
  );
}
