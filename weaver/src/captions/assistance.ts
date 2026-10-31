import {
  z, CaptionTrack, Locale, ProjectRevision,
} from "../contracts/index.ts";
import { WeaverError } from "../contracts/errors.ts";
import { Store, digest } from "../store/index.ts";
import { Projects } from "../project/service.ts";
import { Jobs, type NodeContext } from "../jobs/index.ts";
import { Providers } from "../adapters/providers.ts";
import { Artifacts } from "../artifacts/index.ts";

const Result = z.object({
  projectId: z.string(), revision: z.string(), sourceLocale: Locale,
  targetLocale: Locale, sourceTrackDigest: z.string(), track: CaptionTrack,
});

export class CaptionAssistance {
  private readonly artifacts: Artifacts;
  constructor(private readonly store: Store, private readonly projects: Projects,
    private readonly jobs: Jobs, private readonly providers: Providers) {
    this.artifacts = new Artifacts(store);
    jobs.register("caption-translate", (c) => this.translate(c));
  }

  async submit(raw: {projectId: string; expectedRevision: string; requestId: string; locale: string; targetLocale: string}) {
    const input = z.object({projectId: z.string().min(1), expectedRevision: z.string().min(1),
      requestId: z.string().min(1), locale: Locale, targetLocale: Locale}).parse(raw);
    if (input.locale === input.targetLocale)
      throw new WeaverError("INVALID_INPUT", "目标语言必须不同于原字幕语言");
    const prior = this.jobs.prior("caption-translate", input.requestId, input, input.projectId);
    if (prior) return prior;
    const revision = this.projects.read(input.projectId);
    if (revision.id !== input.expectedRevision)
      throw new WeaverError("REVISION_CONFLICT", "字幕已修改，请重新提交", {current: revision});
    const track = revision.document.captions.find((t) => t.locale === input.locale);
    if (!track?.cues.length) throw new WeaverError("INVALID_INPUT", "当前语言没有可翻译字幕");
    this.providers.require("hy-mt2");
    const binding = (await this.providers.freeze(["hy-mt2"]))["hy-mt2"];
    const frozen = {...input, track, binding};
    return this.jobs.submit({projectId: input.projectId, kind: "caption-translate", requestId: input.requestId,
      requestInput: input, snapshot: frozen, nodes: [{key: "caption-translate", operation: "caption-translate", input: frozen}]});
  }

  private async translate(c: NodeContext) {
    const i = z.object({projectId: z.string(), expectedRevision: z.string(), locale: Locale,
      targetLocale: Locale, track: CaptionTrack, binding: z.string()}).parse(c.input);
    const sourceTrackDigest = digest(i.track);
    const key = this.artifacts.key("caption-translate-v2", {track: sourceTrackDigest,
      targetLocale: i.targetLocale, binding: i.binding});
    const cached = this.artifacts.lookup(key);
    let track: z.infer<typeof CaptionTrack>;
    if (cached) track = this.store.jsonBlob(cached.digest, CaptionTrack);
    else {
      c.event("provider-request", {provider: "hy-mt2", count: i.track.cues.length});
      const result = await this.providers.translate({
        texts: i.track.cues.map((cue) => ({id: cue.id,
          text: i.track.translationLocale ? cue.translationSourceText ?? cue.sourceText ?? cue.text : cue.text})),
        targetLocale: i.targetLocale, workDir: c.workDir, signal: c.signal, binding: i.binding,
      });
      c.signal.throwIfAborted();
      const translated = new Map(result.items.map((item) => [item.id, item.text]));
      track = CaptionTrack.parse({...i.track, translationLocale: i.targetLocale,
        cues: i.track.cues.map((cue) => ({...cue, text: translated.get(cue.id),
          translationSourceText: i.track.translationLocale ? cue.translationSourceText ?? cue.sourceText ?? cue.text : cue.text,
          sourceText: cue.sourceText ?? cue.text, words: undefined,
          provenance: `${cue.provenance}; hy-mt2/${i.targetLocale}; 译文沿用原句界`}))});
      this.artifacts.record({operation: "caption-translate-v2", cacheKey: key, generation: "default",
        digest: this.store.putJson(track), mime: "application/json", dependencies: [],
        provenance: {binding: i.binding, sourceTrackDigest}, verified: true});
    }
    c.signal.throwIfAborted();
    return Result.parse({projectId: i.projectId, revision: i.expectedRevision,
      sourceLocale: i.locale, targetLocale: i.targetLocale, sourceTrackDigest, track});
  }

  apply(input: {projectId: string; expectedRevision: string; requestId: string; runId: string}) {
    return this.store.mutate("caption-translate-apply", input.requestId, input, ProjectRevision, () => {
      const run = this.jobs.read(input.runId);
      if (run.projectId !== input.projectId || run.kind !== "caption-translate" || run.state !== "succeeded")
        throw new WeaverError("INVALID_INPUT", "字幕翻译作业尚未成功或不属于此项目");
      const result = Result.parse(this.jobs.nodes(run.id)[0]?.result);
      const revision = this.projects.read(input.projectId);
      const current = revision.document.captions.find((t) => t.locale === result.sourceLocale);
      if (result.revision !== input.expectedRevision || revision.id !== input.expectedRevision ||
          !current || digest(current) !== result.sourceTrackDigest)
        throw new WeaverError("REVISION_CONFLICT", "字幕翻译基于旧修订，请重新翻译", {current: revision});
      return this.projects.apply({...input, ops: [{op: "captions", value: revision.document.captions.map((t) =>
        t.locale === result.sourceLocale ? result.track : t)}]});
    });
  }
}
