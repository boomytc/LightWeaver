import {
  CreativePlan, ProjectRevision,
} from "../contracts/index.ts";
import { WeaverError } from "../contracts/errors.ts";
import { Store } from "../store/index.ts";
import { Projects } from "../project/service.ts";

export class Authoring {
  constructor(private readonly store: Store, private readonly projects: Projects) {}

  save(input: {projectId: string; expectedRevision: string; requestId: string; plan: unknown}) {
    const plan = CreativePlan.parse(input.plan);
    return this.store.mutate("creative-plan-save", input.requestId, {...input, plan}, ProjectRevision, () => {
      const revision = this.projects.read(input.projectId);
      if (revision.id !== input.expectedRevision)
        throw new WeaverError("REVISION_CONFLICT", "创作方案基于旧修订，请重读项目", {current: revision});
      return this.projects.apply({...input, ops: [{op: "creative-plan", value: plan}]});
    });
  }

  apply(input: {projectId: string; expectedRevision: string; requestId: string; append?: boolean}) {
    return this.store.mutate("creative-plan-apply", input.requestId, input, ProjectRevision, () => {
      const revision = this.projects.read(input.projectId);
      if (revision.id !== input.expectedRevision)
        throw new WeaverError("REVISION_CONFLICT", "项目已修改，请重新审核方案", {current: revision});
      const plan = revision.document.creativePlan;
      if (!plan) throw new WeaverError("INVALID_INPUT", "项目没有创作方案");
      const scenes = [...(input.append ? revision.document.scenes : []), ...plan.beats.map((b) => b.scene)];
      const ids = new Set(scenes.map((s) => s.id));
      if (ids.size !== scenes.length) throw new WeaverError("INVALID_INPUT", "方案与现有场景标识重复");
      return this.projects.update({...input, document: {
        ...revision.document, scenes,
        captions: revision.document.captions.map((t) => ({...t, cues: t.cues.filter((c) => c.time.kind !== "speech" || ids.has(c.time.sceneId))})),
        masks: revision.document.masks.filter((m) => ids.has(m.sceneId)),
      }});
    });
  }
}
