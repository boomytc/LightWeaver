import path from "node:path";
import {
  z,
  AssetId,
  CaptionCue,
  CaptionStyle,
  CaptionTrack,
  Id,
  Locale,
  MediaAssetVersion,
  MediaRef,
  Microseconds,
  ProjectId,
  ProjectRevision,
  RevisionId,
  RunId,
  SourceRange,
  refKey,
} from "../contracts/index.ts";
import { WeaverError } from "../contracts/errors.ts";
import { Store, digest } from "../store/index.ts";
import { Projects } from "../project/service.ts";
import { Jobs, type NodeContext } from "../jobs/index.ts";
import { Artifacts } from "../artifacts/index.ts";
import { processRun } from "../media/process.ts";
import { probe } from "../media/probe.ts";
import { mergeSourceCaptionTrack } from "../search/source-captions.ts";
import {
  SPEAKER_MAX_WINDOW_SECONDS,
  SPEAKER_PROVIDER,
  SpeakerModels,
  SpeakerTranscript,
  speakerLanguage,
  type SpeakerTranscriptValue,
} from "../adapters/speaker-models.ts";

export const SPEAKER_JOB_KIND = "caption-speakers";
const SPEAKER_WINDOW_US = SPEAKER_MAX_WINDOW_SECONDS * 1_000_000;

const PositiveMicroseconds = Microseconds.refine(
  (value) => value > 0,
  "时长必须大于零",
);

const SubmitInput = z.strictObject({
  projectId: ProjectId,
  sourceId: AssetId,
  locale: Locale,
  requestId: Id,
  fromUs: Microseconds.optional(),
  durationUs: PositiveMicroseconds.optional(),
});

const ApplyInput = z.strictObject({
  projectId: ProjectId,
  runId: RunId,
  expectedRevision: RevisionId,
  requestId: Id,
});

const SpeakerSnapshot = z
  .strictObject({
    revision: ProjectRevision,
    source: MediaAssetVersion,
    locale: Locale,
    range: SourceRange,
    sourceDurationUs: Microseconds,
    binding: z.string().min(1),
  })
  .refine(
    (snapshot) =>
      snapshot.range.startUs + snapshot.range.durationUs <=
      snapshot.sourceDurationUs,
    "说话人窗口超出源媒体",
  );

export const SpeakerAssistResult = z.strictObject({
  projectId: ProjectId,
  revision: RevisionId,
  source: MediaRef,
  locale: Locale,
  track: CaptionTrack,
});

export class SpeakerAssistance {
  private readonly artifacts: Artifacts;

  constructor(
    private readonly store: Store,
    private readonly projects: Projects,
    private readonly jobs: Jobs,
    private readonly models: SpeakerModels,
  ) {
    this.artifacts = new Artifacts(store);
    jobs.register(SPEAKER_JOB_KIND, (context) => this.assist(context));
  }

  async submit(input: {
    projectId: string;
    sourceId: string;
    locale: string;
    requestId: string;
    fromUs?: number;
    durationUs?: number;
  }) {
    const parsed = SubmitInput.parse(input);
    const prior = this.jobs.prior(
      SPEAKER_JOB_KIND,
      parsed.requestId,
      parsed,
      parsed.projectId,
    );
    if (prior) return prior;

    speakerLanguage(parsed.locale);
    const revision = this.projects.read(parsed.projectId);
    const sourceRef = revision.document.assets.find(
      (candidate) => candidate.assetId === parsed.sourceId,
    );
    if (!sourceRef)
      throw new WeaverError(
        "INVALID_INPUT",
        "项目没有所选源版本",
        { sourceId: parsed.sourceId },
      );
    const source = this.projects
      .assetsFor(revision.document)
      .find((candidate) => refKey(candidate) === refKey(sourceRef));
    if (!source || !["video", "audio"].includes(source.kind))
      throw new WeaverError(
        "INVALID_INPUT",
        "说话人分段需要当前项目中的视频或音频源",
        { sourceId: parsed.sourceId },
      );
    if (!this.store.verifyBlob(source.digest))
      throw new WeaverError(
        "INTEGRITY_FAILED",
        "源媒体内容缺失或摘要不匹配",
        { sourceId: source.assetId, version: source.version },
      );
    const fact = await probe(this.store.blobPath(source.digest));
    if (!fact.audio)
      throw new WeaverError(
        "INVALID_MEDIA",
        "所选源没有音轨，不能检测说话人",
        { sourceId: source.assetId },
      );
    const startUs = parsed.fromUs ?? 0;
    const durationUs = parsed.durationUs ?? fact.durationUs - startUs;
    const endUs = startUs + durationUs;
    if (
      !Number.isSafeInteger(durationUs) ||
      !Number.isSafeInteger(endUs) ||
      durationUs <= 0 ||
      endUs > fact.durationUs
    )
      throw new WeaverError(
        "INVALID_INPUT",
        "说话人分段窗口超出源媒体",
        {
          fromUs: startUs,
          durationUs,
          sourceDurationUs: fact.durationUs,
        },
      );

    await this.models.require();
    const binding = await this.models.freeze();
    const snapshot = SpeakerSnapshot.parse({
      revision,
      source,
      locale: parsed.locale,
      range: { startUs, durationUs },
      sourceDurationUs: fact.durationUs,
      binding,
    });
    return this.jobs.submit({
      projectId: parsed.projectId,
      kind: SPEAKER_JOB_KIND,
      requestId: parsed.requestId,
      requestInput: parsed,
      snapshot,
      nodes: [
        {
          key: "speaker-windows",
          operation: SPEAKER_JOB_KIND,
          input: snapshot,
        },
      ],
    });
  }

  private async assist(context: NodeContext) {
    const input = SpeakerSnapshot.parse(context.input);
    const cues: z.infer<typeof CaptionCue>[] = [];
    let offsetUs = 0;
    let windowIndex = 0;
    while (offsetUs < input.range.durationUs) {
      context.signal.throwIfAborted();
      const durationUs = Math.min(
        SPEAKER_WINDOW_US,
        input.range.durationUs - offsetUs,
      );
      const startUs = input.range.startUs + offsetUs;
      const key = this.artifacts.key("speaker-window-v1", {
        sourceDigest: input.source.digest,
        startUs,
        durationUs,
        locale: input.locale,
        binding: input.binding,
        maximumSeconds: SPEAKER_MAX_WINDOW_SECONDS,
      });
      const cached = this.artifacts.lookup(key);
      let transcript: SpeakerTranscriptValue;
      if (cached) {
        transcript = this.store.jsonBlob(cached.digest, SpeakerTranscript);
      } else {
        const audio = path.join(
          context.workDir,
          `speaker-${windowIndex}-${startUs}-${durationUs}.wav`,
        );
        await this.models.require(input.binding);
        await processRun(
          this.models.settings().ffmpeg,
          [
            "-v",
            "error",
            "-y",
            "-ss",
            seconds(startUs),
            "-i",
            this.store.blobPath(input.source.digest),
            "-t",
            seconds(durationUs),
            "-map",
            "0:a:0",
            "-vn",
            "-af",
            "apad",
            "-ac",
            "1",
            "-ar",
            "16000",
            "-c:a",
            "pcm_s16le",
            audio,
          ],
          { signal: context.signal, timeoutMs: 120000 },
        );
        context.signal.throwIfAborted();
        context.event("provider-request", {
          provider: SPEAKER_PROVIDER,
          sourceDigest: input.source.digest,
          startUs,
          durationUs,
          binding: input.binding,
        });
        transcript = await this.models.transcribe({
          audio,
          locale: input.locale,
          workDir: context.workDir,
          signal: context.signal,
          binding: input.binding,
        });
        context.signal.throwIfAborted();
        this.artifacts.record({
          operation: "speaker-window-v1",
          cacheKey: key,
          generation: "default",
          digest: this.store.putJson(transcript),
          mime: "application/json",
          dependencies: [input.source.digest],
          provenance: {
            runId: context.runId,
            source: {
              assetId: input.source.assetId,
              version: input.source.version,
            },
            sourceRange: { startUs, durationUs },
            locale: input.locale,
            binding: input.binding,
            labels: "provisional-window-local",
          },
          verified: true,
        });
      }

      cues.push(
        ...this.cuesForWindow({
          runId: context.runId,
          source: {
            assetId: input.source.assetId,
            version: input.source.version,
          },
          locale: input.locale,
          windowIndex,
          startUs,
          durationUs,
          transcript,
        }),
      );
      context.event("speaker-window", {
        startUs,
        durationUs,
        segments: transcript.segments.length,
        speakerLabels: new Set(
          transcript.segments.map((segment) => segment.speakerId),
        ).size,
        provisional: true,
      });
      offsetUs += durationUs;
      windowIndex++;
    }
    context.signal.throwIfAborted();
    if (!cues.length)
      throw new WeaverError(
        "PROVIDER_FORMAT",
        "MOSS 没有返回可采用的说话人分段",
      );
    const track = CaptionTrack.parse({
      locale: input.locale,
      fps: input.revision.document.profiles[0].fps,
      mode: "precise",
      style: CaptionStyle.parse({}),
      cues,
    });
    return SpeakerAssistResult.parse({
      projectId: input.revision.projectId,
      revision: input.revision.id,
      source: {
        assetId: input.source.assetId,
        version: input.source.version,
      },
      locale: input.locale,
      track,
    });
  }

  private cuesForWindow(input: {
    runId: string;
    source: { assetId: string; version: string };
    locale: string;
    windowIndex: number;
    startUs: number;
    durationUs: number;
    transcript: SpeakerTranscriptValue;
  }): z.infer<typeof CaptionCue>[] {
    const source = MediaRef.parse(input.source);
    const windowEndUs = input.startUs + input.durationUs;
    return input.transcript.segments.map((segment, segmentIndex) => {
      const startUs = Math.min(
        windowEndUs - 1,
        Math.max(input.startUs, input.startUs + Math.round(segment.start * 1e6)),
      );
      const endUs = Math.min(
        windowEndUs,
        Math.max(startUs + 1, input.startUs + Math.round(segment.end * 1e6)),
      );
      const speakerId = Id.parse(
        `speaker-${digest({
          runId: input.runId,
          startUs: input.startUs,
          durationUs: input.durationUs,
          nativeSpeakerId: segment.speakerId,
        }).slice(0, 24)}`,
      );
      return CaptionCue.parse({
        id: `cue-speakers-${digest({
          runId: input.runId,
          windowIndex: input.windowIndex,
          segmentIndex,
          source,
          startUs,
          endUs,
          speakerId,
          text: segment.text,
        }).slice(0, 32)}`,
        text: segment.text,
        sourceText: segment.text,
        speakerId,
        timingQuality: "native",
        provenance:
          "moss-speakers; provisional window-local speaker label; native structured timing",
        time: {
          kind: "source",
          source,
          range: {
            startUs,
            durationUs: endUs - startUs,
          },
        },
      });
    });
  }

  apply(input: {
    projectId: string;
    runId: string;
    expectedRevision: string;
    requestId: string;
  }) {
    const parsed = ApplyInput.parse(input);
    return this.store.mutate(
      "caption-speakers-apply",
      parsed.requestId,
      parsed,
      ProjectRevision,
      () => {
        const run = this.jobs.read(parsed.runId);
        if (
          run.projectId !== parsed.projectId ||
          run.kind !== SPEAKER_JOB_KIND ||
          run.state !== "succeeded"
        )
          throw new WeaverError(
            "INVALID_INPUT",
            "说话人分段作业尚未成功或不属于此项目",
            { runId: parsed.runId },
          );
        const snapshot = this.store.jsonBlob(
          run.snapshotDigest,
          SpeakerSnapshot,
        );
        const nodes = this.jobs.nodes(run.id);
        if (
          nodes.length !== 1 ||
          nodes[0]?.key !== "speaker-windows" ||
          nodes[0]?.state !== "succeeded"
        )
          throw new WeaverError(
            "INVALID_INPUT",
            "说话人分段作业结果不完整",
            { runId: parsed.runId },
          );
        const result = SpeakerAssistResult.parse(nodes[0].result);
        const sourceKey = refKey(result.source);
        if (
          result.projectId !== parsed.projectId ||
          result.revision !== parsed.expectedRevision ||
          snapshot.revision.projectId !== parsed.projectId ||
          snapshot.revision.id !== result.revision ||
          snapshot.locale !== result.locale ||
          refKey(snapshot.source) !== sourceKey ||
          result.track.locale !== result.locale ||
          result.track.cues.some(
            (cue) =>
              cue.time.kind !== "source" ||
              refKey(cue.time.source) !== sourceKey,
          )
        )
          throw new WeaverError(
            "INVALID_INPUT",
            "说话人分段作业快照、结果或源版本不一致",
            { runId: parsed.runId },
          );

        const current = this.projects.read(parsed.projectId);
        const currentRef = current.document.assets.find(
          (candidate) => refKey(candidate) === sourceKey,
        );
        const currentSource = currentRef
          ? this.projects
              .assetsFor(current.document)
              .find((candidate) => refKey(candidate) === sourceKey)
          : undefined;
        if (
          current.id !== parsed.expectedRevision ||
          snapshot.revision.id !== current.id ||
          !currentRef ||
          !currentSource ||
          currentSource.version !== result.source.version ||
          currentSource.digest !== snapshot.source.digest
        )
          throw new WeaverError(
            "REVISION_CONFLICT",
            "说话人分段基于旧修订或旧源版本，请重新检测",
            { current },
          );
        if (!this.store.verifyBlob(currentSource.digest))
          throw new WeaverError(
            "INTEGRITY_FAILED",
            "当前源媒体内容缺失或摘要不匹配",
            { sourceId: currentSource.assetId, version: currentSource.version },
          );

        const currentTrack = current.document.captions.find(
          (track) => track.locale === result.locale,
        );
        const track = mergeSourceCaptionTrack({
          track: currentTrack, locale: result.locale,
          fps: current.document.profiles[0].fps,
          sourceKeys: new Set([sourceKey]), cues: result.track.cues,
          replaceWindows: [{source: sourceKey, startUs: snapshot.range.startUs,
            endUs: snapshot.range.startUs + snapshot.range.durationUs}],
        });
        const captions = currentTrack
          ? current.document.captions.map((candidate) =>
              candidate.locale === result.locale ? track : candidate,
            )
          : [...current.document.captions, track];
        return this.projects.apply({
          projectId: parsed.projectId,
          expectedRevision: parsed.expectedRevision,
          requestId: parsed.requestId,
          ops: [{ op: "captions", value: captions }],
        });
      },
    );
  }
}

function seconds(microseconds: number): string {
  return (microseconds / 1_000_000).toFixed(6);
}
