import { z } from "zod";

export { z };
export const Id = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/);
export const ProjectId = Id.brand<"ProjectId">();
export const RevisionId = Id.brand<"RevisionId">();
export const AssetId = Id.brand<"AssetId">();
export const LibraryId = Id.brand<"LibraryId">();
export const RunId = Id.brand<"RunId">();
export const SceneId = Id.brand<"SceneId">();
export const Digest = z
  .string()
  .regex(/^[a-f0-9]{64}$/)
  .brand<"Digest">();
export const Pixels = z.number().int().positive().max(16384).brand<"Pixels">();
export const Frames = z.number().int().nonnegative().safe().brand<"Frames">();
export const Microseconds = z
  .number()
  .int()
  .nonnegative()
  .safe()
  .brand<"Microseconds">();
export const Samples = z.number().int().nonnegative().safe().brand<"Samples">();
export const Fps = z.strictObject({
  num: z.number().int().positive().max(240000),
  den: z.number().int().positive().max(10000),
});
export const Locale = z.string().regex(/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/);
export const MediaRef = z.strictObject({ assetId: AssetId, version: Digest });
export const LibraryRef = z.strictObject({
  itemId: LibraryId,
  version: Digest,
});
export const SourceRange = z.strictObject({
  startUs: Microseconds,
  durationUs: Microseconds.refine((n) => n > 0, "时长必须大于零"),
});
export const Framing = z.strictObject({
  fit: z.enum(["contain", "cover"]).default("contain"),
  focusX: z.number().min(0).max(1).default(0.5),
  focusY: z.number().min(0).max(1).default(0.5),
});
export const Speech = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("authored"),
    text: z.record(Locale, z.string().min(1)),
    voice: z.record(Locale, LibraryRef),
    style: z.record(Locale, z.string()).optional(),
  }),
  z.strictObject({
    kind: z.literal("imported"),
    audio: z.record(Locale, MediaRef),
    text: z.record(Locale, z.string()).default({}),
  }),
]);
export const ImageTiming = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("fixed"),
    frames: Frames.refine((n) => n > 0),
    speech: Speech.optional(),
  }),
  z.strictObject({
    kind: z.literal("speech"),
    speech: Speech,
    tailFrames: Frames,
  }),
]);
export const SpeechAudio = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("narration"),
    speech: Speech,
    gainDb: z.number().min(-90).max(24).default(0),
  }),
  z.strictObject({
    kind: z.literal("mix"),
    speech: Speech,
    gainDb: z.number().min(-90).max(24).default(0),
    sourceGainDb: z.number().min(-90).max(24).default(-12),
    ducking: z.boolean().default(true),
  }),
]);
export const ClipAudio = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("silent") }),
  z.strictObject({
    kind: z.literal("original"),
    gainDb: z.number().min(-90).max(24).default(0),
  }),
  ...SpeechAudio.options,
]);
export const Overflow = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("reject") }),
  z.strictObject({ kind: z.literal("freeze"), maxFrames: Frames }),
  z.strictObject({
    kind: z.literal("speed"),
    min: z.number().positive().max(1),
    max: z.number().min(1).max(8),
  }),
]);
export const ClipPlayback = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("source"), audio: ClipAudio }),
  z.strictObject({
    kind: z.literal("speech"),
    audio: SpeechAudio,
    tailFrames: Frames,
    overflow: Overflow,
  }),
]);
export const RegisteredCardSpec = z.strictObject({
  template: z.enum(["title", "points", "close"]),
  version: z.literal("2"),
  copy: z.record(
    Locale,
    z.strictObject({
      kicker: z.string().default(""),
      headline: z.string(),
      lede: z.string().default(""),
      points: z.array(z.string()).default([]),
      tags: z.array(z.string()).default([]),
    }),
  ),
  brand: z.string().default("LightWeaver"),
});
const sceneBase = { id: SceneId, label: z.string().default("") };
export const Scene = z.discriminatedUnion("kind", [
  z.strictObject({
    ...sceneBase,
    kind: z.literal("card"),
    cardSpec: RegisteredCardSpec,
    timing: ImageTiming,
  }),
  z.strictObject({
    ...sceneBase,
    kind: z.literal("still"),
    image: MediaRef,
    framing: Framing,
    timing: ImageTiming,
  }),
  z.strictObject({
    ...sceneBase,
    kind: z.literal("clip"),
    source: MediaRef,
    sourceRange: SourceRange,
    framing: Framing,
    playback: ClipPlayback,
  }),
]);
export const CaptionStyle = z.strictObject({
  font: z.string().default("Noto Sans CJK SC"),
  size: z.number().positive().default(48),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default("#FFFFFF"),
  outline: z.number().min(0).max(12).default(2),
  marginV: z.number().min(0).max(1000).default(80),
  maxChars: z.number().int().positive().default(24),
});
export const SourceWord = z.strictObject({
  text: z.string().min(1),
  startUs: Microseconds,
  endUs: Microseconds,
}).refine((w) => w.endUs >= w.startUs, "词时间顺序无效");
export const CaptionCue = z.strictObject({
  id: Id,
  text: z.string().min(1),
  timingQuality: z.enum(["native", "aligned", "manual", "estimated"]),
  provenance: z.string(),
  sourceText: z.string().optional(),
  translationSourceText: z.string().optional(),
  speakerId: Id.optional(),
  words: z.array(SourceWord).optional(),
  time: z.discriminatedUnion("kind", [
    z.strictObject({
      kind: z.literal("timeline"),
      startFrame: Frames,
      durationFrames: Frames.refine((n) => n > 0, "字幕区间必须为正"),
    }),
    z.strictObject({
      kind: z.literal("source"),
      source: MediaRef,
      range: SourceRange,
    }),
    z.strictObject({
      kind: z.literal("speech"),
      sceneId: SceneId,
      range: SourceRange,
    }),
  ]),
}).superRefine((cue, context) => {
  if (!cue.words?.length) return;
  const range = cue.time.kind === "timeline" ? undefined : cue.time.range;
  for (const [i, word] of cue.words.entries()) {
    if ((i > 0 && word.startUs < cue.words[i - 1].startUs) ||
        (range && (word.startUs < range.startUs || word.endUs > range.startUs + range.durationUs)))
      context.addIssue({code: "custom", path: ["words", i], message: "词时间倒序或超出字幕区间"});
  }
});
export const CaptionTrack = z.strictObject({
  locale: Locale,
  translationLocale: Locale.optional(),
  fps: Fps.default({ num: 30, den: 1 }),
  mode: z.enum(["manual", "precise", "estimated", "none"]),
  style: CaptionStyle,
  cues: z.array(CaptionCue),
});
export const OutputProfile = z.strictObject({
  id: Id,
  width: Pixels,
  height: Pixels,
  fps: Fps,
  codec: z.literal("h264"),
  crf: z.number().int().min(0).max(51).default(18),
  pixelFormat: z.literal("yuv420p"),
  color: z.literal("bt709-sdr"),
  hdr: z.literal("reject"),
  sampleRate: z.literal(48000),
  channels: z.literal(2),
  subtitles: z.enum(["sidecar", "burn", "both", "none"]).default("both"),
  loudness: z
    .strictObject({
      integratedLufs: z.number().min(-36).max(-5),
      truePeakDb: z.number().min(-9).max(0),
    })
    .default({ integratedLufs: -16, truePeakDb: -1 }),
});
export const PROFILES = Object.fromEntries(
  [
    ["landscape", 1920, 1080],
    ["portrait", 1080, 1920],
    ["square", 1080, 1080],
  ].map(([id, width, height]) => {
    const p = OutputProfile.parse({
      id,
      width,
      height,
      fps: { num: 30, den: 1 },
      codec: "h264",
      pixelFormat: "yuv420p",
      color: "bt709-sdr",
      hdr: "reject",
      sampleRate: 48000,
      channels: 2,
    });
    return [p.id, p];
  }),
);
export const Bgm = z.strictObject({
  source: MediaRef,
  range: SourceRange,
  loop: z.boolean(),
  gainDb: z.number().min(-90).max(24),
  fadeInFrames: Frames,
  fadeOutFrames: Frames,
  ducking: z.boolean(),
});
export const CreativePlan = z.strictObject({
  title: z.string().trim().min(1),
  summary: z.string(),
  beats: z.array(z.strictObject({
    scene: Scene,
    rationale: z.string(),
    evidence: z.array(z.strictObject({
      analysisId: Id,
      source: MediaRef,
      range: SourceRange,
    })),
  })).min(1),
}).refine((p) => new Set(p.beats.map((b) => b.scene.id)).size === p.beats.length, "创作方案场景标识重复");
export const CardRenderInput = z.strictObject({
  cardSpec: RegisteredCardSpec,
  locale: Locale,
  output: OutputProfile,
  durationFrames: Frames.refine((n) => n > 0),
  adapterFingerprint: Digest.optional(),
});
export const ProjectDocument = z.strictObject({
  schemaVersion: z.literal(2),
  id: ProjectId,
  title: z.string(),
  origin: z.enum(["user", "first-party"]),
  workflow: Id,
  locales: z.array(Locale).min(1),
  assets: z.array(MediaRef),
  bindings: z.array(LibraryRef),
  method: LibraryRef.optional(),
  scenes: z.array(Scene),
  creativePlan: CreativePlan.optional(),
  captions: z.array(CaptionTrack),
  bgm: Bgm.optional(),
  profiles: z.array(OutputProfile).min(1),
  masks: z
    .array(
      z.strictObject({
        sceneId: SceneId,
        x: z.number().min(0).max(1),
        y: z.number().min(0).max(1),
        width: z.number().positive().max(1),
        height: z.number().positive().max(1),
        color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
      }),
    )
    .default([]),
});
export const ProjectRevision = z.strictObject({
  id: RevisionId,
  projectId: ProjectId,
  parent: RevisionId.nullable(),
  document: ProjectDocument,
  digest: Digest,
  createdAt: z.string(),
  requestId: Id,
});
export const MediaProvenance = z.strictObject({
  description: z.string().min(1),
  inputs: z.array(z.strictObject({
    source: MediaRef,
    role: z.enum(["picture", "audio", "captions", "reference"]),
    range: SourceRange.optional(),
  })).min(1),
  captions: z.enum(["embedded", "none", "unknown"]),
});
export const MediaAssetVersion = z.strictObject({
  assetId: AssetId,
  version: Digest,
  digest: Digest,
  kind: z.enum(["video", "image", "audio", "subtitle", "document"]),
  name: z.string(),
  mime: z.string(),
  bytes: z.number().int().nonnegative(),
  provenance: MediaProvenance.optional(),
});
export const VoiceVersion = z.strictObject({
  kind: z.literal("voice"),
  name: z.string(),
  provider: Id,
  reference: Digest,
  referenceText: z.string().min(1),
  style: z.string().default(""),
});
export const MethodVersion = z.strictObject({
  kind: z.literal("method"),
  name: z.string(),
  description: z.string(),
  workflow: Id.optional(),
  needs: z
    .array(z.enum(["transcript", "description", "match-report"]))
    .default([]),
  clipAudio: z.enum(["original", "narration", "mix"]).optional(),
  clipAlignment: z.literal("observed-sequences").optional(),
  sceneTemplate: z.array(Scene).default([]),
  outline: z
    .object({
      expand: z.enum(["fixed", "list"]),
      beats: z.array(
        z.object({
          id: Id,
          role: z.string().optional(),
          fit: z.enum(["contain", "cover"]).optional(),
        }),
      ),
    })
    .optional(),
});
export const LibraryPayload = z.discriminatedUnion("kind", [
  VoiceVersion,
  MethodVersion,
  z.strictObject({
    kind: z.literal("material"),
    name: z.string(),
    digest: Digest,
    mime: z.string(),
  }),
]);
export const LibraryVersion = z.strictObject({
  itemId: LibraryId,
  version: Digest,
  payload: LibraryPayload,
  createdAt: z.string(),
});
export const Issue = z.strictObject({
  code: z.string(),
  severity: z.enum(["error", "warning"]),
  path: z.string(),
  message: z.string(),
  hints: z.array(z.string()).default([]),
});
export const ErrorProtocol = z.strictObject({
  code: z.string(),
  message: z.string(),
  retryable: z.boolean(),
  details: z.unknown().optional(),
  hints: z.array(z.string()),
});
export const ArtifactManifest = z.strictObject({
  id: Id,
  operation: z.string(),
  cacheKey: Digest,
  generation: Id,
  digest: Digest,
  mime: z.string(),
  dependencies: z.array(Digest),
  provenance: z.record(z.string(), z.unknown()),
  verified: z.boolean(),
  createdAt: z.string(),
});
export const ProbeFact = z.strictObject({
  durationUs: Microseconds,
  video: z
    .strictObject({
      width: Pixels,
      height: Pixels,
      fps: Fps,
      frames: Frames.optional(),
      rotation: z.number(),
      sar: z.string(),
      colorTransfer: z.string(),
      timeBase: z.string(),
      startPts: z.number().optional(),
    })
    .optional(),
  audio: z
    .strictObject({
      sampleRate: z.number(),
      channels: z.number(),
      samples: Samples.optional(),
    })
    .optional(),
});
export const SpeechFact = z.strictObject({
  digest: Digest,
  durationSamples: Samples,
  cues: z.array(CaptionCue),
  provider: z.string(),
});
export const VerifiedFacts = z.strictObject({
  media: z.record(z.string(), ProbeFact),
  speech: z.record(z.string(), SpeechFact),
  tools: z.record(z.string(), z.string()),
});
export const RunSnapshot = z.strictObject({
  schemaVersion: z.literal(2),
  projectRevision: ProjectRevision,
  assets: z.array(MediaAssetVersion),
  library: z.array(LibraryVersion),
  locales: z.array(Locale),
  profiles: z.array(OutputProfile),
  providers: z.record(z.string(), z.string()),
  evidenceKinds: z
    .array(z.enum(["transcript", "description", "match-report"]))
    .default([]),
  observations: z
    .array(
      z.strictObject({
        source: MediaRef,
        range: SourceRange,
        evidenceDigest: Digest,
      }),
    )
    .default([]),
  generation: Id,
});
const visualBase = {
  sceneId: SceneId,
  startFrame: Frames,
  durationFrames: Frames,
  sourceEvidence: z.string(),
};
export const VisualSegment = z.discriminatedUnion("kind", [
  z.strictObject({
    ...visualBase,
    kind: z.literal("card"),
    cardSpec: RegisteredCardSpec,
  }),
  z.strictObject({
    ...visualBase,
    kind: z.literal("still"),
    image: MediaRef,
    framing: Framing,
  }),
  z.strictObject({
    ...visualBase,
    kind: z.literal("clip"),
    source: MediaRef,
    sourceRange: SourceRange,
    speed: z.number().positive(),
    freezeFrames: Frames,
    framing: Framing,
  }),
]);
export const AudioSegment = z.strictObject({
  role: z.enum(["source", "speech", "bgm"]),
  digest: Digest,
  startFrame: Frames,
  durationFrames: Frames,
  trimUs: Microseconds,
  sourceDurationUs: Microseconds,
  speed: z.number().positive(),
  loop: z.boolean(),
  gainDb: z.number(),
  fadeInFrames: Frames,
  fadeOutFrames: Frames,
  ducking: z.boolean(),
  sceneId: SceneId.optional(),
});
export const ResolvedCue = z.strictObject({
  id: Id,
  text: z.string(),
  startFrame: Frames,
  durationFrames: Frames,
  timingQuality: z.enum(["native", "aligned", "manual", "estimated"]),
  provenance: z.string(),
  mapping: CaptionCue.shape.time,
});
export const TimelineManifest = z.strictObject({
  schemaVersion: z.literal(2),
  locale: Locale,
  captionLanguage: Locale.optional(),
  output: OutputProfile,
  totalFrames: Frames,
  totalSamples: Samples,
  visuals: z.array(VisualSegment),
  audio: z.array(AudioSegment),
  captions: z.array(ResolvedCue),
  captionStyle: CaptionStyle,
  masks: ProjectDocument.shape.masks,
  tools: z.record(z.string(), z.string()),
});
export const RenderSnapshot = z.strictObject({
  runSnapshotDigest: Digest,
  timelineDigest: Digest,
  verifiedArtifactRefs: z.array(Digest),
  target: z.string(),
});
export const Proposal = z.strictObject({
  id: Id,
  projectId: ProjectId,
  revision: RevisionId,
  kind: z.enum(["script-search", "reference-match"]),
  query: z.string(),
  candidates: z.array(
    z.strictObject({
      id: Id,
      source: MediaRef,
      range: SourceRange,
      scores: z.strictObject({
        text: z.number(),
        visual: z.number(),
        semantic: z.number(),
        rerank: z.number().finite().optional(),
      }),
      evidence: z.array(z.string()),
      method: z.string(),
      limitations: z.array(z.string()),
    }),
  ),
  selections: z.array(Id),
  warnings: z.array(z.string()),
});
export const EditOperation = z.discriminatedUnion("op", [
  z.strictObject({ op: z.literal("title"), value: z.string() }),
  z.strictObject({ op: z.literal("scenes"), value: z.array(Scene) }),
  z.strictObject({ op: z.literal("scene"), value: Scene }),
  z.strictObject({ op: z.literal("remove-scene"), id: SceneId }),
  z.strictObject({ op: z.literal("captions"), value: z.array(CaptionTrack) }),
  z.strictObject({ op: z.literal("creative-plan"), value: CreativePlan.nullable() }),
  z.strictObject({
    op: z.literal("profiles"),
    value: z.array(OutputProfile).min(1),
  }),
  z.strictObject({ op: z.literal("bgm"), value: Bgm.nullable() }),
  z.strictObject({ op: z.literal("rebind"), from: LibraryRef, to: LibraryRef }),
  z.strictObject({ op: z.literal("method"), value: LibraryRef.nullable() }),
]);
export const RunState = z.enum([
  "queued",
  "running",
  "cancelling",
  "succeeded",
  "failed",
  "cancelled",
  "interrupted",
  "partial",
]);
export const RunRecord = z.strictObject({
  id: RunId,
  projectId: ProjectId.nullable(),
  kind: z.string(),
  state: RunState,
  snapshotDigest: Digest,
  cancelRequested: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
  error: ErrorProtocol.nullable(),
});
export const EventRecord = z.strictObject({
  seq: z.number().int(),
  runId: RunId,
  type: z.string(),
  data: z.unknown(),
  createdAt: z.string(),
});
export const Delivery = z.strictObject({
  id: Id,
  projectId: ProjectId,
  revisionId: RevisionId,
  runId: RunId,
  target: z.string(),
  generation: z.number().int(),
  fingerprint: Digest,
  timelineDigest: Digest,
  runSnapshotDigest: Digest,
  artifacts: z.record(z.string(), Digest),
  createdAt: z.string(),
});
export const AnalysisEntry = z.strictObject({
  id: Id,
  projectId: ProjectId,
  source: MediaRef,
  sourceDigest: Digest,
  range: SourceRange,
  kind: z.enum(["asr", "describe", "manual"]),
  locale: z.string().optional(),
  text: z.string(),
  sourceText: z.string().optional(),
  words: z.array(SourceWord).optional(),
  speakerId: Id.optional(),
  evidenceDigest: Digest,
  model: z.string(),
  timingQuality: z.enum(["native", "aligned", "manual", "estimated"]),
  vector: z.array(z.number()).optional(),
  embeddingBinding: z.string().optional(),
});
export const JIAN_YING_PROFILE = z
  .strictObject({
    bundleId: z.literal("com.lemon.lvpro"),
    appVersion: z.literal("11.7.0"),
    schemaVersion: z.literal(360000),
    adapterVersion: z.literal("lightweaver-jianying-mac-v1"),
    draftFile: z.literal("draft_info.json"),
  })
  .parse({
    bundleId: "com.lemon.lvpro",
    appVersion: "11.7.0",
    schemaVersion: 360000,
    adapterVersion: "lightweaver-jianying-mac-v1",
    draftFile: "draft_info.json",
  });
export const WORKFLOWS = [
  {
    id: "study-explainer",
    name: "静帧讲解",
    inputs: ["image"],
    analysis: [],
    guidance: "编写卡片或静帧场景与旁白",
  },
  {
    id: "footage-narration",
    name: "多源剧情解说",
    inputs: ["video"],
    analysis: ["asr", "describe"],
    guidance: "先读证据，再写剧情、旁白和选段",
  },
  {
    id: "observe-narrate",
    name: "观察后配旁白",
    inputs: ["video"],
    analysis: ["describe"],
    guidance: "观察与旁白分开；按镜头证据创作",
  },
  {
    id: "script-search",
    name: "已有文案找镜头",
    inputs: ["video"],
    analysis: ["asr", "describe"],
    guidance: "检索候选，人工或 agent 选择，再应用修订",
  },
  {
    id: "highlight-mix",
    name: "原声高光混剪",
    inputs: ["video"],
    analysis: ["asr"],
    guidance: "选源窗并保留原声，无需音色",
  },
  {
    id: "reference-match",
    name: "参考片反向匹配",
    inputs: ["video"],
    analysis: ["match"],
    guidance: "参考成片与多源候选分别登记，保留候选报告",
  },
];
export function refKey(ref: z.infer<typeof MediaRef>): string {
  return `${ref.assetId}@${ref.version}`;
}
export function speechOf(
  scene: z.infer<typeof Scene>,
): z.infer<typeof Speech> | undefined {
  if (scene.kind !== "clip") return scene.timing.speech;
  const a = scene.playback.audio;
  return a.kind === "narration" || a.kind === "mix" ? a.speech : undefined;
}
export type ProjectDocument = z.infer<typeof ProjectDocument>;
export type ProjectRevision = z.infer<typeof ProjectRevision>;
export type MediaAssetVersion = z.infer<typeof MediaAssetVersion>;
export type LibraryVersion = z.infer<typeof LibraryVersion>;
export type Scene = z.infer<typeof Scene>;
export type Speech = z.infer<typeof Speech>;
export type OutputProfile = z.infer<typeof OutputProfile>;
export type CaptionTrack = z.infer<typeof CaptionTrack>;
export type CaptionCue = z.infer<typeof CaptionCue>;
export type ArtifactManifest = z.infer<typeof ArtifactManifest>;
export type RunSnapshot = z.infer<typeof RunSnapshot>;
export type VerifiedFacts = z.infer<typeof VerifiedFacts>;
export type TimelineManifest = z.infer<typeof TimelineManifest>;
export type Proposal = z.infer<typeof Proposal>;
export type Issue = z.infer<typeof Issue>;

export function reconcileSceneReferences(
  previous: ProjectDocument,
  next: ProjectDocument,
): ProjectDocument {
  const nextScenes = new Map(next.scenes.map((scene) => [scene.id, scene]));
  const nextSceneIds = new Set(nextScenes.keys());
  const removedSceneIds = new Set(
    previous.scenes
      .filter((scene) => !nextSceneIds.has(scene.id))
      .map((scene) => scene.id),
  );
  const previousSpeechRefs = new Map<string, Set<string>>();
  for (const track of previous.captions) {
    previousSpeechRefs.set(
      track.locale,
      new Set(
        track.cues.flatMap((cue) =>
          cue.time.kind === "speech"
            ? [`${cue.id}\0${cue.time.sceneId}`]
            : [],
        ),
      ),
    );
  }
  let changed = false;
  const captions = next.captions.map((track) => {
    const priorRefs = previousSpeechRefs.get(track.locale);
    const cues = track.cues.filter((cue) => {
      if (cue.time.kind !== "speech") return true;
      const scene = nextScenes.get(cue.time.sceneId);
      if (scene && speechOf(scene)) return true;
      return !priorRefs?.has(`${cue.id}\0${cue.time.sceneId}`);
    });
    if (cues.length !== track.cues.length) changed = true;
    return cues.length === track.cues.length ? track : { ...track, cues };
  });
  const masks = next.masks.filter(
    (mask) => !removedSceneIds.has(mask.sceneId),
  );
  if (masks.length !== next.masks.length) changed = true;
  return changed ? { ...next, captions, masks } : next;
}

export const VlmProvider = z.enum(["modelbest-vlm", "deepseek-vlm"]);

export const ProviderDescriptor = z.object({
  id: z.string(),
  name: z.string(),
  capabilities: z.array(
    z.enum([
      "tts",
      "voice-design",
      "describe",
      "asr",
      "alignment",
      "embedding",
      "rerank",
      "translation",
      "diarization",
    ]),
  ),
  model: z.string(),
  version: z.string(),
  endpoint: z.string(),
  ready: z.boolean(),
  remote: z.boolean(),
  idempotency: z.boolean(),
  cancellation: z.string(),
  hint: z.string(),
});

export const ModelSettingSource = z.enum([
  "environment",
  "file",
  "default",
  "unset",
]);
export const ModelSettingsField = z.strictObject({
  value: z.string(),
  source: ModelSettingSource,
});
export const ModelSettingsView = z.strictObject({
  configPath: z.string(),
  revision: Digest,
  downloadRoot: ModelSettingsField,
  values: z.record(z.string(), ModelSettingsField),
  apiKeys: z.record(
    z.string(),
    z.strictObject({
      configured: z.boolean(),
      source: ModelSettingSource,
    }),
  ),
});
export const ModelReleaseFile = z.strictObject({
  path: z.string().min(1),
  size: z.number().int().nonnegative().safe(),
  sha256: Digest,
  executable: z.boolean().default(false),
});
export const ModelBinding = z.discriminatedUnion("target", [
  z.strictObject({
    setting: z.string().min(1),
    target: z.literal("file"),
    file: z.string().min(1),
  }),
  z.strictObject({
    setting: z.string().min(1),
    target: z.literal("directory"),
  }),
  z.strictObject({
    setting: z.string().min(1),
    target: z.literal("literal"),
    value: z.string(),
  }),
]);
export const ModelRuntimeRequirement = z.strictObject({
  setting: z.string().min(1),
  label: z.string().min(1),
  kind: z.enum(["file", "directory", "executable"]),
  documentationUrl: z.string().url().optional(),
});
export const LocalModelCatalogItem = z
  .strictObject({
    id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
    name: z.string().min(1),
    capability: z.enum(["asr", "vad", "alignment", "embedding"]),
    version: z.string().min(1),
    repository: z.string().min(1),
    revision: z.string().min(1),
    platform: z.string().min(1),
    available: z.boolean(),
    unavailableReason: z.string().optional(),
    license: z.string().min(1).optional(),
    files: z.array(ModelReleaseFile),
    bindings: z.array(ModelBinding).min(1),
    runtimeRequirements: z.array(ModelRuntimeRequirement),
  })
  .refine(
    (value) => !value.available || value.files.length > 0,
    "可下载模型必须声明文件",
  );
export const ModelProviderCatalog = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1),
  baseUrl: z.string().url(),
  apiKeyEnv: z.string().min(1),
  apiKeyConfigured: z.boolean(),
  keyUrl: z.string().url(),
  docsUrl: z.string().url(),
  models: z.array(
    z.strictObject({
      id: z.string().min(1),
      name: z.string().min(1),
      capabilities: z.array(z.string()).min(1),
    }),
  ),
});
export const ModelCatalog = z.strictObject({
  schemaVersion: z.literal(1),
  providers: z.array(ModelProviderCatalog),
  localModels: z.array(LocalModelCatalogItem),
});
export const ModelFileState = z.strictObject({
  path: z.string(),
  expectedSize: z.number().int().nonnegative().safe(),
  actualSize: z.number().int().nonnegative().safe().optional(),
  expectedSha256: Digest,
  actualSha256: Digest.optional(),
  state: z.enum(["missing", "invalid", "verified"]),
  reason: z.string().optional(),
});
export const VerifyResult = z.strictObject({
  id: z.string(),
  root: z.string(),
  state: z.enum(["missing", "invalid", "verified"]),
  files: z.array(ModelFileState).min(1),
  verifiedAt: z.string(),
});
export const ModelStatus = z.strictObject({
  id: z.string(),
  root: z.string(),
  directory: z.string(),
  state: z.enum(["missing", "invalid", "unchecked"]),
  files: z.array(
    z.strictObject({
      path: z.string(),
      expectedSize: z.number().int().nonnegative().safe(),
      actualSize: z.number().int().nonnegative().safe().optional(),
      state: z.enum(["missing", "invalid", "metadata-match"]),
    }),
  ),
});
const ActivePathState = z.enum(["unset", "missing", "wrong-type", "unavailable", "present"]);
export const ActiveModelBinding = z.discriminatedUnion("target", [
  ModelSettingsField.extend({
    setting: z.string(), target: z.literal("file"), file: z.string(),
    resolvedPath: z.string(), state: ActivePathState,
  }),
  ModelSettingsField.extend({
    setting: z.string(), target: z.literal("directory"),
    resolvedPath: z.string(), state: ActivePathState,
  }),
  ModelSettingsField.extend({ setting: z.string(), target: z.literal("literal") }),
]);
export const ActiveModelFile = z.strictObject({
  path: z.string(),
  actualPath: z.string(),
  expectedSize: z.number().int().nonnegative().safe(),
  actualSize: z.number().int().nonnegative().safe().optional(),
  signature: z.string().optional(),
  state: z.enum(["unset", "missing", "wrong-type", "unavailable", "size-mismatch", "metadata-match"]),
});
export const ActiveModelSnapshot = z.strictObject({
  bindings: z.array(ActiveModelBinding),
  files: z.array(ActiveModelFile),
});
export const ActiveVerifyResult = z.strictObject({
  id: z.string(),
  snapshot: ActiveModelSnapshot,
  state: z.enum(["missing", "invalid", "verified"]),
  files: z.array(ModelFileState),
  verifiedAt: z.string(),
});
export const ModelsView = z.strictObject({
  catalog: ModelCatalog,
  settings: ModelSettingsView,
  local: z.array(
    z.strictObject({
      id: z.string(),
      status: ModelStatus,
      activeBindings: z.array(ActiveModelBinding),
      activeFiles: z.array(ActiveModelFile),
      runtime: z.array(
        z.strictObject({
          setting: z.string(),
          label: z.string(),
          ready: z.boolean(),
          documentationUrl: z.string().url().optional(),
        }),
      ),
    }),
  ),
  downloads: z.array(z.lazy(() => RunRecord)),
});
export const DownloadInput = z.strictObject({
  id: z.string().min(1),
  root: z.string().min(1),
  requestId: Id,
});
export const ModelInstallSource = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("configured"), snapshot: ActiveModelSnapshot }),
  z.strictObject({ kind: z.literal("downloaded") }),
  z.strictObject({ kind: z.literal("download") }),
]);
export const ModelInstallInput = DownloadInput.extend({
  expectedRevision: Digest,
  source: ModelInstallSource.optional(),
});
const ModelInstallEstimate = z.strictObject({
  id: z.string(),
  source: ModelInstallSource,
  modelBytes: z.number().int().nonnegative().safe(),
  dependencyBytes: z.number().int().nonnegative().safe(),
  components: z.array(z.strictObject({ id: z.string(), name: z.string() })),
});
export const ModelInstallPlan = z.discriminatedUnion("available", [
  ModelInstallEstimate.extend({ available: z.literal(true) }),
  ModelInstallEstimate.extend({ available: z.literal(false), reason: z.string().min(1) }),
]);
export const ModelSettingsPatch = z
  .strictObject({
    expectedRevision: Digest,
    modelbestApiKey: z.string().optional(),
    clearModelbestApiKey: z.boolean().optional(),
    vlmProvider: z.enum(["modelbest-vlm", "deepseek-vlm"]).optional(),
    vlmModel: z.string().optional(),
    ttsModel: z.string().optional(),
    downloadRoot: z.string().optional(),
    asrModel: z.string().optional(),
    visualModel: z.string().optional(),
    visualMmproj: z.string().optional(),
    alignmentModel: z.string().optional(),
  })
  .refine(
    (value) =>
      !(value.modelbestApiKey !== undefined && value.clearModelbestApiKey),
    "API key 设置与清除不能同时进行",
  );

/**
 * 引擎（运行时）安装边界：原生运行库、llama-server 与 Python 环境。
 * 与模型权重分离：引擎产物固定版本和摘要，安装到引擎根目录后自动解析使用。
 */
export const EngineBinding = z.discriminatedUnion("target", [
  z.strictObject({
    setting: z.string().min(1),
    target: z.literal("file"),
    file: z.string().min(1),
  }),
  z.strictObject({
    setting: z.string().min(1),
    target: z.literal("executable"),
    file: z.string().min(1),
  }),
  z.strictObject({
    setting: z.string().min(1),
    target: z.literal("directory"),
  }),
]);
export const EngineSource = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("archive"),
    url: z.string().url(),
    size: z.number().int().positive().safe(),
    sha256: Digest,
    format: z.enum(["tar.gz", "zip"]),
    /** 归档内部顶层目录；空字符串表示成员直接在归档根部。 */
    stripPrefix: z.string(),
    /** 只发布这些前缀的归档成员（如 wheel 只取 transcribe_cpp/）。 */
    include: z.array(z.string().min(1)).optional(),
  }),
  z.strictObject({
    kind: z.literal("file"),
    url: z.string().url(),
    size: z.number().int().positive().safe(),
    sha256: Digest,
    executable: z.boolean(),
  }),
  z.strictObject({
    kind: z.literal("python-env"),
    requirements: z.string().min(1),
  }),
]);
export const EngineCatalogItem = z.strictObject({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  name: z.string().min(1),
  version: z.string().min(1),
  kind: z.enum(["archive", "file", "python-env"]),
  platform: z.string().min(1),
  available: z.boolean(),
  unavailableReason: z.string().optional(),
  summary: z.string().min(1),
  documentationUrl: z.string().url().optional(),
  bindings: z.array(EngineBinding).min(1),
  files: z.array(ModelReleaseFile),
  source: EngineSource,
  /** 一键配置允许失败并继续采用其它组件的可选引擎。 */
  optional: z.boolean(),
  /** 安装后大致需要占用的磁盘字节数，用于下载前空间预检。 */
  estimatedBytes: z.number().int().positive().safe(),
  /** 可执行引擎的就绪探测参数（如 llama-server --version）。 */
  probe: z.array(z.string()).optional(),
});
export const EngineCatalog = z.strictObject({
  schemaVersion: z.literal(1),
  items: z.array(EngineCatalogItem),
});
export const EngineStatus = z.strictObject({
  id: z.string(),
  root: z.string(),
  directory: z.string(),
  state: z.enum(["missing", "invalid", "unchecked", "installed"]),
  version: z.string(),
  files: z.array(
    z.strictObject({
      path: z.string(),
      expectedSize: z.number().int().nonnegative().safe(),
      actualSize: z.number().int().nonnegative().safe().optional(),
      state: z.enum(["missing", "invalid", "metadata-match"]),
    }),
  ),
  reason: z.string().optional(),
});
export const EngineActiveBinding = z.strictObject({
  setting: z.string(),
  target: z.enum(["file", "executable", "directory"]),
  file: z.string().optional(),
  value: ModelSettingsField,
  resolvedPath: z.string(),
  state: ActivePathState,
  ready: z.boolean(),
});
/**
 * 引擎的“使用状态”是单一计算者：本应用管理的安装目录状态（EngineStatus）
 * 与当前运行时绑定是否可用，合成一个用户可读的分类，避免页面各自拼装措辞。
 */
export const EngineUsage = z.enum([
  "bundled",
  "managed",
  "managed-unused",
  "external",
  "unused",
  "partial",
]);
export const BundledEngines = z.strictObject({
  schemaVersion: z.literal(1),
  platform: z.string().min(1),
  components: z.array(z.strictObject({
    id: z.string().min(1),
    version: z.string().min(1),
    directory: z.string().min(1),
    bindings: z.record(z.string(), z.string().min(1)),
  })).min(1),
});
export const EngineItemStatus = z.strictObject({
  id: z.string(),
  status: EngineStatus,
  active: z.array(EngineActiveBinding),
  usage: EngineUsage,
});
export const EngineView = z.strictObject({
  catalog: EngineCatalog,
  settings: ModelSettingsView,
  installRoot: ModelSettingsField,
  /** 一键配置按顺序包含的引擎 ID；语音 Python 环境体积大，默认单独按需创建。 */
  setupComponents: z.array(z.string()).min(1),
  /** 已安装版本与当前发布不同的引擎 ID。 */
  updates: z.array(z.string()),
  /** 可选“同时下载权重”的本地模型与下载字节数。 */
  models: z.array(
    z.strictObject({
      id: z.string(),
      name: z.string(),
      bytes: z.number().int().nonnegative().safe(),
    }),
  ),
  /** 引擎根目录所在卷的可用字节数；读取失败时为 null。 */
  diskFreeBytes: z.number().int().nonnegative().safe().nullable(),
  items: z.array(EngineItemStatus),
  installs: z.array(z.lazy(() => RunRecord)),
});
export const EngineVerifyResult = z.strictObject({
  id: z.string(),
  root: z.string(),
  directory: z.string(),
  state: z.enum(["missing", "invalid", "verified"]),
  version: z.string(),
  files: z.array(ModelFileState),
  detail: z.string().optional(),
  reason: z.string().optional(),
  verifiedAt: z.string(),
});
export const EngineInstallInput = z.strictObject({
  id: z.string().min(1),
  root: z.string().min(1),
  requestId: Id,
});
export const EngineSetupInput = z.strictObject({
  root: z.string().min(1).optional(),
  expectedRevision: Digest,
  requestId: Id,
  /** 同时配置语音 Python 环境（体积大，默认关闭）。 */
  includeSpeech: z.boolean().default(false),
  /** 同时下载并采用本地模型权重（ASR、EmbeddingGemma、ForcedAligner）。 */
  includeModels: z.boolean().default(false),
});
export const EngineSetupResult = z.strictObject({
  adopted: z.array(z.string()),
  skipped: z.array(
    z.strictObject({ id: z.string(), message: z.string() }),
  ),
});
