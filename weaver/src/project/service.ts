import {
  z,
  ProjectDocument,
  ProjectRevision,
  MediaAssetVersion,
  LibraryVersion,
  EditOperation,
  ProjectId,
  RevisionId,
  WORKFLOWS,
  PROFILES,
  speechOf,
} from "../contracts/index.ts";
import { WeaverError } from "../contracts/errors.ts";
import { Store, digest, newId, now, canonical } from "../store/index.ts";

export class Projects {
  constructor(private readonly store: Store) {}
  list(): ProjectRevision[] {
    return this.store.listJson(
      "SELECT r.json FROM projects p JOIN revisions r ON r.id=p.head WHERE p.deleted=0 ORDER BY p.id",
      [],
      ProjectRevision,
    );
  }
  read(id: string, revision?: string): ProjectRevision {
    ProjectId.parse(id);
    return revision
      ? this.store.readJson(
          "SELECT json FROM revisions WHERE id=? AND project_id=?",
          [revision, id],
          ProjectRevision,
        )
      : this.store.readJson(
          "SELECT r.json FROM projects p JOIN revisions r ON r.id=p.head WHERE p.id=? AND p.deleted=0",
          [id],
          ProjectRevision,
        );
  }
  create(input: {
    title: string;
    workflow: string;
    requestId: string;
    id?: string;
    origin?: "user" | "first-party";
  }): ProjectRevision {
    return this.store.mutate(
      "project-create",
      input.requestId,
      input,
      ProjectRevision,
      () => {
        if (!WORKFLOWS.some((w) => w.id === input.workflow))
          throw new WeaverError("INVALID_INPUT", "未注册工作流", {
            workflows: WORKFLOWS,
          });
        const id = ProjectId.parse(input.id || newId("project"));
        if (this.store.db.prepare("SELECT 1 FROM projects WHERE id=?").get(id))
          throw new WeaverError("INVALID_INPUT", "项目 ID 已存在", { id });
        const document = ProjectDocument.parse({
          schemaVersion: 2,
          id,
          title: input.title,
          origin: input.origin || "user",
          workflow: input.workflow,
          locales: ["zh"],
          assets: [],
          bindings: [],
          scenes: [],
          captions: [],
          profiles: [PROFILES.landscape],
        });
        this.store.db
          .prepare("INSERT INTO projects(id,head) VALUES(?,?)")
          .run(id, "pending");
        return this.insert(document, null, input.requestId);
      },
    );
  }
  private validateRefs(doc: ProjectDocument): void {
    if (new Set(doc.scenes.map((s) => s.id)).size !== doc.scenes.length)
      throw new WeaverError("INVALID_INPUT", "场景 ID 重复");
    if (
      new Set(doc.locales).size !== doc.locales.length ||
      new Set(doc.profiles.map((p) => p.id)).size !== doc.profiles.length ||
      new Set(doc.captions.map((t) => t.locale)).size !== doc.captions.length ||
      doc.captions.some(
        (t) => new Set(t.cues.map((c) => c.id)).size !== t.cues.length,
      )
    )
      throw new WeaverError("INVALID_INPUT", "语言、输出规格或字幕标识重复");
    if (!WORKFLOWS.some((w) => w.id === doc.workflow))
      throw new WeaverError("INVALID_INPUT", "未注册 workflow");
    const media = [...doc.assets];
    const library = [...doc.bindings, ...(doc.method ? [doc.method] : [])];
    for (const scene of doc.scenes) {
      if (scene.kind === "clip") media.push(scene.source);
      if (scene.kind === "still") media.push(scene.image);
      const speech = speechOf(scene);
      if (speech?.kind === "imported")
        media.push(...Object.values(speech.audio));
      if (speech?.kind === "authored")
        library.push(...Object.values(speech.voice));
    }
    if (doc.bgm) media.push(doc.bgm.source);
    for (const track of doc.captions)
      for (const cue of track.cues)
        if (cue.time.kind === "source") media.push(cue.time.source);
    for (const ref of media)
      this.store.readJson(
        "SELECT json FROM assets WHERE asset_id=? AND version=?",
        [ref.assetId, ref.version],
        MediaAssetVersion,
      );
    for (const ref of library)
      this.store.readJson(
        "SELECT json FROM library_versions WHERE item_id=? AND version=?",
        [ref.itemId, ref.version],
        LibraryVersion,
      );
  }
  private insert(
    document: ProjectDocument,
    parent: ProjectRevision | null,
    requestId: string,
  ): ProjectRevision {
    this.validateRefs(document);
    const revision = ProjectRevision.parse({
      id: RevisionId.parse(newId("rev")),
      projectId: document.id,
      parent: parent?.id ?? null,
      document,
      digest: digest(document),
      createdAt: now(),
      requestId,
    });
    this.store.db
      .prepare("INSERT INTO revisions VALUES(?,?,?,?,?)")
      .run(
        revision.id,
        document.id,
        revision.parent,
        revision.digest,
        canonical(revision),
      );
    const result = parent
      ? this.store.db
          .prepare("UPDATE projects SET head=? WHERE id=? AND head=?")
          .run(revision.id, document.id, parent.id)
      : this.store.db
          .prepare("UPDATE projects SET head=? WHERE id=?")
          .run(revision.id, document.id);
    if (!result.changes)
      throw new WeaverError("REVISION_CONFLICT", "项目已被其他入口修改", {
        current: this.read(document.id),
      });
    this.store.pin(`revision:${revision.id}`, {
      ...document,
      assets: this.assetsFor(document),
      library: this.libraryFor(document),
    });
    return revision;
  }
  assetsFor(doc: ProjectDocument): MediaAssetVersion[] {
    const refs = [...doc.assets];
    const scenes = [
      ...doc.scenes,
      ...this.libraryFor(doc).flatMap((v) =>
        v.payload.kind === "method" ? v.payload.sceneTemplate : [],
      ),
    ];
    for (const s of scenes) {
      if (s.kind === "clip") refs.push(s.source);
      if (s.kind === "still") refs.push(s.image);
      const sp = speechOf(s);
      if (sp?.kind === "imported") refs.push(...Object.values(sp.audio));
    }
    if (doc.bgm) refs.push(doc.bgm.source);
    for (const track of doc.captions)
      for (const cue of track.cues)
        if (cue.time.kind === "source") refs.push(cue.time.source);
    return [
      ...new Map(
        refs.map((ref) => [
          `${ref.assetId}@${ref.version}`,
          this.store.readJson(
            "SELECT json FROM assets WHERE asset_id=? AND version=?",
            [ref.assetId, ref.version],
            MediaAssetVersion,
          ),
        ]),
      ).values(),
    ];
  }
  libraryFor(doc: ProjectDocument): LibraryVersion[] {
    const refs = [...doc.bindings, ...(doc.method ? [doc.method] : [])];
    for (const s of doc.scenes) {
      const sp = speechOf(s);
      if (sp?.kind === "authored") refs.push(...Object.values(sp.voice));
    }
    const versions = new Map<string, LibraryVersion>();
    for (let index = 0; index < refs.length; index++) {
      const ref = refs[index],
        key = `${ref.itemId}@${ref.version}`;
      if (versions.has(key)) continue;
      const v = this.store.readJson(
        "SELECT json FROM library_versions WHERE item_id=? AND version=?",
        [ref.itemId, ref.version],
        LibraryVersion,
      );
      versions.set(key, v);
      if (v.payload.kind === "method")
        for (const scene of v.payload.sceneTemplate) {
          const sp = speechOf(scene);
          if (sp?.kind === "authored") refs.push(...Object.values(sp.voice));
        }
    }
    return [...versions.values()];
  }
  update(input: {
    projectId: string;
    expectedRevision: string;
    requestId: string;
    document: unknown;
  }): ProjectRevision {
    const document = ProjectDocument.parse(input.document);
    if (document.id !== input.projectId)
      throw new WeaverError("INVALID_INPUT", "不能修改项目身份");
    return this.store.mutate(
      `project:${input.projectId}`,
      input.requestId,
      input,
      ProjectRevision,
      () => {
        const parent = this.read(input.projectId);
        if (parent.id !== input.expectedRevision)
          throw new WeaverError("REVISION_CONFLICT", "修订冲突，请重读后提交", {
            current: parent,
          });
        return this.insert(document, parent, input.requestId);
      },
    );
  }
  apply(input: {
    projectId: string;
    expectedRevision: string;
    requestId: string;
    ops: unknown;
  }): ProjectRevision {
    const ops = z.array(EditOperation).parse(input.ops);
    return this.store.mutate(
      `project:${input.projectId}`,
      input.requestId,
      input,
      ProjectRevision,
      () => {
        const current = this.read(input.projectId);
        if (current.id !== input.expectedRevision)
          throw new WeaverError("REVISION_CONFLICT", "修订冲突，请重读后提交", {
            current,
          });
        let doc = current.document;
        for (const op of ops) {
          switch (op.op) {
            case "title":
              doc = { ...doc, title: op.value };
              break;
            case "scenes":
              doc = { ...doc, scenes: op.value };
              break;
            case "scene":
              doc = {
                ...doc,
                scenes: doc.scenes.some((s) => s.id === op.value.id)
                  ? doc.scenes.map((s) => (s.id === op.value.id ? op.value : s))
                  : [...doc.scenes, op.value],
              };
              break;
            case "remove-scene":
              doc = {
                ...doc,
                scenes: doc.scenes.filter((s) => s.id !== op.id),
              };
              break;
            case "captions":
              doc = { ...doc, captions: op.value };
              break;
            case "profiles":
              doc = { ...doc, profiles: op.value };
              break;
            case "bgm":
              doc = { ...doc, bgm: op.value ?? undefined };
              break;
            case "method":
              doc = { ...doc, method: op.value ?? undefined };
              break;
            case "rebind": {
              const replace = (v: unknown): unknown => {
                if (Array.isArray(v)) return v.map(replace);
                if (v && typeof v === "object") {
                  if (
                    "itemId" in v &&
                    "version" in v &&
                    v.itemId === op.from.itemId &&
                    v.version === op.from.version
                  )
                    return op.to;
                  return Object.fromEntries(
                    Object.entries(v).map(([k, x]) => [k, replace(x)]),
                  );
                }
                return v;
              };
              doc = ProjectDocument.parse(replace(doc));
              break;
            }
          }
        }
        return this.insert(
          ProjectDocument.parse(doc),
          current,
          input.requestId,
        );
      },
    );
  }
}
