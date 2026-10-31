import fs from "node:fs";
import path from "node:path";
import {
  z,
  AnalysisEntry,
  Proposal,
  Issue,
  Digest,
  RunSnapshot,
  OutputProfile,
  PROFILES,
  speechOf,
  refKey,
  ProbeFact,
  VerifiedFacts,
  SpeechFact,
  CaptionCue,
  Frames,
  Samples,
  Microseconds,
  TimelineManifest,
  RenderSnapshot,
  Delivery,
  ArtifactManifest,
  type ProjectDocument,
  type Scene,
} from "../contracts/index.ts";
import { WeaverError } from "../contracts/errors.ts";
import { Store, digest, newId, now, canonical } from "../store/index.ts";
import { Projects } from "../project/service.ts";
import { Jobs, NodeSpec, type NodeContext } from "../jobs/index.ts";
import { ttsKey } from "../artifacts/keys.ts";
import { Artifacts } from "../artifacts/index.ts";
import { toolVersion, fileDigest } from "../adapters/toolchain.ts";
import {
  Providers,
  workspaceRoot,
  parseLastJson,
  AlignmentResult,
  ALIGNMENT_PROVIDER,
} from "../adapters/providers.ts";
import { probe } from "../media/probe.ts";
import { processRun } from "../media/process.ts";
import { renderTimeline, RENDER_ALGORITHM } from "../media/render.ts";
import { compileTimeline } from "../timeline/compiler.ts";

const BUILD_ALGORITHM = "build-v3";

const ProbeInput = z.object({
  digest: Digest,
  ref: z.string(),
  generation: z.string(),
  toolVersion: z.string(),
});
const SpeechInput = z.object({
  snapshotDigest: Digest,
  scene: z.string(),
  locale: z.string(),
  precise: z.boolean(),
});
const CompileInput = z.object({
  snapshotDigest: Digest,
  locale: z.string(),
  profile: OutputProfile,
  target: z.string(),
  fingerprint: z.string(),
});
const ProbeResult = z.object({
  kind: z.literal("probe"),
  ref: z.string(),
  fact: ProbeFact,
});
const SpeechResult = z.object({
  kind: z.literal("speech"),
  ref: z.string(),
  fact: SpeechFact,
});
const CompileResult = z.object({
  manifestDigest: z.string(),
  renderSnapshotDigest: z.string(),
  runSnapshotDigest: z.string(),
  target: z.string(),
  fingerprint: z.string(),
});

function localeScene(scene: Scene, locale: string): unknown {
  const visit = (v: unknown, key = ""): unknown => {
    if (
      ["text", "voice", "audio", "copy"].includes(key) &&
      v &&
      typeof v === "object" &&
      !Array.isArray(v) &&
      !("kind" in v)
    )
      return { [locale]: Reflect.get(v, locale) };
    if (Array.isArray(v)) return v.map((x) => visit(x));
    if (v && typeof v === "object")
      return Object.fromEntries(
        Object.entries(v).map(([k, x]) => [k, visit(x, k)]),
      );
    return v;
  };
  return visit(scene);
}
function needsAlignment(
  doc: ProjectDocument,
  locale: string,
  sceneId?: string,
): boolean {
  const track = doc.captions.find(
    (c) => c.locale === locale && c.mode === "precise",
  );
  return (
    !!track &&
    doc.scenes.some(
      (scene) =>
        (!sceneId || scene.id === sceneId) &&
        !!speechOf(scene) &&
        !track.cues.some(
          (cue) => cue.time.kind === "speech" && cue.time.sceneId === scene.id,
        ),
    )
  );
}
export function targetFingerprint(
  doc: ProjectDocument,
  locale: string,
  profile: z.infer<typeof OutputProfile>,
  providers?: Record<string, string>,
): string {
  return digest({
    toolBindings: {
      build: providers?.["tool:build"],
      ffmpeg: providers?.["tool:ffmpeg"],
      renderer: providers?.["tool:renderer"],
      font: providers?.[`tool:font:${locale}`],
      card: doc.scenes.some((s) => s.kind === "card")
        ? providers?.["tool:card"]
        : undefined,
    },
    providerBindings: {
      tts: doc.scenes.some((s) => speechOf(s)?.kind === "authored")
        ? providers?.["modelbest-voxcpm2"]
        : undefined,
      alignment: needsAlignment(doc, locale)
        ? providers?.[ALIGNMENT_PROVIDER]
        : undefined,
    },
    scenes: doc.scenes.map((s) => localeScene(s, locale)),
    captions: doc.captions.filter((c) => c.locale === locale),
    bgm: doc.bgm,
    masks: doc.masks,
    method: doc.method,
    profile,
  });
}

export class Builds {
  readonly artifacts: Artifacts;
  constructor(
    private readonly store: Store,
    readonly projects: Projects,
    readonly jobs: Jobs,
    readonly providers: Providers,
  ) {
    this.artifacts = new Artifacts(store);
    jobs.register("probe", (context) => this.probeNode(context));
    jobs.register("speech", (context) => this.speechNode(context));
    jobs.register("compile", (context) => this.compileNode(context));
    jobs.register(
      "render",
      (context) => this.renderNode(context),
      (context, result) => this.publish(context, result),
    );
  }
  private async toolsFor(
    doc: ProjectDocument,
  ): Promise<Record<string, string>> {
    const tools: Record<string, string> = {
      "tool:ffmpeg": await toolVersion("ffmpeg"),
      "tool:ffprobe": await toolVersion("ffprobe"),
      "tool:renderer": RENDER_ALGORITHM,
      "tool:build": BUILD_ALGORITHM,
    };
    if (doc.scenes.some((s) => s.kind === "card"))
      tools["tool:card"] = JSON.stringify(
        parseLastJson(
          (
            await processRun(
              process.env.LIGHTWEAVER_CARD_RENDERER ||
                path.join(workspaceRoot, "node_modules/.bin/weaver-card"),
              ["--describe"],
            )
          ).stdout,
        ),
      );
    for (const locale of doc.locales) {
      tools[`tool:font:${locale}`] = "system-fontconfig";
      try {
        const file = (
          await processRun("fc-match", [
            "-f",
            "%{file}",
            doc.captions.find((t) => t.locale === locale)?.style.font ||
              "Noto Sans CJK SC",
          ])
        ).stdout.trim();
        tools[`tool:font:${locale}`] =
          `${path.basename(file)}:${await fileDigest(file)}`;
      } catch {
        /* Fontconfig is optional; renderer records the system fallback. */
      }
    }
    return tools;
  }
  private frozenSnapshot(value: string) {
    const snapshot = this.store.jsonBlob(value, RunSnapshot);
    if (snapshot.providers["tool:build"] !== BUILD_ALGORITHM)
      throw new WeaverError("TOOL_CHANGED", "制作算法已改变，请重新构建");
    return snapshot;
  }
  async snapshot(input: {
    projectId: string;
    locales?: string[];
    profiles?: string[];
    regenerate?: boolean;
    requestId: string;
  }): Promise<z.infer<typeof RunSnapshot>> {
    const revision = this.projects.read(input.projectId),
      doc = revision.document;
    const profiles = input.profiles?.length
      ? input.profiles.map((id) => {
          const p = doc.profiles.find((p) => p.id === id) || PROFILES[id];
          if (!p)
            throw new WeaverError("INVALID_INPUT", `未知输出 profile ${id}`);
          return p;
        })
      : doc.profiles;
    const locales = input.locales?.length
      ? [...new Set(input.locales)]
      : doc.locales;
    const library = this.projects.libraryFor(doc),
      ids: string[] = [];
    for (const scene of doc.scenes) {
      const speech = speechOf(scene);
      if (speech?.kind === "authored")
        for (const ref of Object.values(speech.voice)) {
          const v = library.find(
            (v) => v.itemId === ref.itemId && v.version === ref.version,
          );
          if (v?.payload.kind === "voice") ids.push(v.payload.provider);
        }
    }
    const alignmentLocales = locales.filter((locale) =>
      needsAlignment(doc, locale),
    );
    if (alignmentLocales.length) {
      await this.providers.requireAlignment(alignmentLocales);
      ids.push(ALIGNMENT_PROVIDER);
    }
    const providers = await this.providers.freeze(ids);
    Object.assign(providers, await this.toolsFor(doc));
    const sourceKeys = new Set(doc.assets.map(refKey)),
      analysis = this.store
        .listJson(
          "SELECT json FROM analysis WHERE project_id=?",
          [doc.id],
          AnalysisEntry,
        )
        .filter((e) => sourceKeys.has(refKey(e.source))),
      proposals = this.store.listJson(
        "SELECT json FROM proposals WHERE project_id=?",
        [doc.id],
        Proposal,
      );
    const evidenceKinds = [
      ...(analysis.some((e) => e.kind === "asr") ||
      doc.captions.some((t) => t.cues.some((c) => c.time.kind === "source"))
        ? ["transcript"]
        : []),
      ...(analysis.some((e) => e.kind === "describe" || e.kind === "manual")
        ? ["description"]
        : []),
      ...(proposals.some(
        (p) =>
          p.kind === "reference-match" &&
          p.candidates.some((c) => sourceKeys.has(refKey(c.source))),
      )
        ? ["match-report"]
        : []),
    ];
    const observations = analysis
      .filter((e) => e.kind === "describe" || e.kind === "manual")
      .map((e) => ({
        source: e.source,
        range: e.range,
        evidenceDigest: e.evidenceDigest,
      }));
    return RunSnapshot.parse({
      schemaVersion: 2,
      projectRevision: revision,
      assets: this.projects.assetsFor(doc),
      library: this.projects.libraryFor(doc),
      locales,
      profiles,
      providers,
      evidenceKinds,
      observations,
      generation: input.regenerate ? input.requestId : "default",
    });
  }
  async plan(input: {
    projectId: string;
    locales?: string[];
    profiles?: string[];
    regenerate?: boolean;
    requestId: string;
  }) {
    const snapshot = await this.snapshot(input),
      nodes: z.input<typeof NodeSpec>[] = [],
      doc = snapshot.projectRevision.document,
      issues: z.infer<typeof Issue>[] = [];
    const probes: string[] = [];
    const required = new Set<string>();
    for (const scene of doc.scenes) {
      if (scene.kind === "clip") required.add(refKey(scene.source));
      if (scene.kind === "still") required.add(refKey(scene.image));
      const speech = speechOf(scene);
      if (speech?.kind === "imported")
        for (const l of snapshot.locales)
          if (speech.audio[l]) required.add(refKey(speech.audio[l]));
    }
    if (doc.bgm) required.add(refKey(doc.bgm.source));
    const probeAssets = snapshot.assets.filter(
      (a) =>
        required.has(refKey(a)) && ["image", "video", "audio"].includes(a.kind),
    );
    for (const a of probeAssets) {
      const key = `probe:${a.assetId}@${a.version}`;
      probes.push(key);
      nodes.push({
        key,
        operation: "probe",
        input: {
          digest: a.digest,
          ref: `${a.assetId}@${a.version}`,
          generation: "default",
          toolVersion: snapshot.providers["tool:ffprobe"],
        },
      });
    }
    for (const locale of snapshot.locales) {
      const speechKeys: string[] = [];
      for (const scene of doc.scenes) {
        const speech = speechOf(scene);
        if (!speech) continue;
        const key = `speech:${locale}:${scene.id}`;
        speechKeys.push(key);
        if (speech.kind === "authored") {
          const voice = speech.voice[locale],
            text = speech.text[locale];
          if (!voice || !text)
            issues.push(
              Issue.parse({
                code: "SPEECH_INPUT_MISSING",
                severity: "error",
                path: `scenes.${scene.id}.${locale}`,
                message: "缺少该语言文案或音色版本",
              }),
            );
          const v = snapshot.library.find(
            (v) => v.itemId === voice?.itemId && v.version === voice?.version,
          );
          if (v?.payload.kind !== "voice")
            issues.push(
              Issue.parse({
                code: "VOICE_MISSING",
                severity: "error",
                path: `scenes.${scene.id}.${locale}`,
                message: "缺少该语言音色版本",
              }),
            );
        } else if (!speech.audio[locale])
          issues.push(
            Issue.parse({
              code: "SPEECH_INPUT_MISSING",
              severity: "error",
              path: `scenes.${scene.id}.${locale}`,
              message: "缺少导入旁白音频",
            }),
          );
        nodes.push({
          key,
          operation: "speech",
          input: {
            snapshotDigest: digest(snapshot),
            scene: scene.id,
            locale,
            precise: needsAlignment(doc, locale, scene.id),
          },
          dependencies: probes,
        });
      }
      for (const profile of snapshot.profiles) {
        const target = `${locale}/${profile.id}`,
          fingerprint = targetFingerprint(
            doc,
            locale,
            profile,
            snapshot.providers,
          );
        nodes.push({
          key: `compile:${target}`,
          operation: "compile",
          input: {
            snapshotDigest: digest(snapshot),
            locale,
            profile,
            target,
            fingerprint,
          },
          dependencies: [...probes, ...speechKeys],
        });
        nodes.push({
          key: `render:${target}`,
          operation: "render",
          input: {
            snapshotDigest: digest(snapshot),
            locale,
            profile,
            target,
            fingerprint,
          },
          dependencies: [`compile:${target}`],
        });
      }
    }
    const method = snapshot.library.find(
      (v) =>
        v.itemId === doc.method?.itemId && v.version === doc.method.version,
    );
    if (method?.payload.kind === "method")
      for (const need of method.payload.needs)
        if (!snapshot.evidenceKinds.includes(need))
          issues.push(
            Issue.parse({
              code: "METHOD_INPUT_MISSING",
              severity: "error",
              path: "method",
              message: `方法需要 ${need} 证据`,
              hints: ["先分析源片或显式导入人工源字幕/观察"],
            }),
          );
    if (!doc.scenes.length)
      issues.push(
        Issue.parse({
          code: "EMPTY_PROJECT",
          severity: "error",
          path: "scenes",
          message: "先添加创作场景",
        }),
      );
    const steps = nodes.map((n) => {
      let cache = "pending-facts",
        provider = "local",
        cacheKey: string | undefined;
      if (n.operation === "probe") {
        const p = ProbeInput.parse(n.input);
        cacheKey = this.artifacts.key("probe-v3", {
          digest: p.digest,
          version: p.toolVersion,
        });
        cache = this.artifacts.lookup(cacheKey) ? "hit" : "miss";
      }
      if (n.operation === "speech") {
        const i = SpeechInput.parse(n.input),
          scene = doc.scenes.find((s) => s.id === i.scene),
          speech = scene ? speechOf(scene) : undefined;
        if (speech?.kind === "imported") {
          provider = "imported-audio";
          cache = "input";
        }
        if (speech?.kind === "authored") {
          const ref = speech.voice[i.locale],
            v = snapshot.library.find(
              (v) => v.itemId === ref?.itemId && v.version === ref?.version,
            );
          if (v?.payload.kind === "voice" && speech.text[i.locale]) {
            provider = v.payload.provider;
            cacheKey = ttsKey({
              text: speech.text[i.locale],
              style: v.payload.style,
              locale: i.locale,
              voiceVersion: v.version,
              reference: v.payload.reference,
              referenceText: v.payload.referenceText,
              binding: snapshot.providers[provider],
              ffmpeg: snapshot.providers["tool:ffmpeg"],
            });
            cache = this.artifacts.lookup(cacheKey, snapshot.generation)
              ? "hit"
              : "miss";
            const descriptor = this.providers
              .descriptors()
              .find((p) => p.id === provider);
            if (cache === "miss" && !descriptor?.ready)
              issues.push(
                Issue.parse({
                  code: descriptor
                    ? "CONFIG_MISSING"
                    : "CAPABILITY_UNAVAILABLE",
                  severity: "error",
                  path: `scenes.${i.scene}.${i.locale}`,
                  message: `${provider} 尚未就绪`,
                  hints: [descriptor?.hint || "注册相应协议适配器"],
                }),
              );
          }
        }
      }
      return {
        key: n.key,
        operation: n.operation,
        dependencies: n.dependencies || [],
        provider,
        cache,
        cacheKey,
      };
    });
    return {
      snapshot,
      nodes,
      steps,
      issues,
      reads: ["SQLite immutable revisions", "SHA-256 blobs"],
      writes: [
        "attempt work",
        "CAS artifacts",
        "SQLite events/current delivery",
      ],
      executesMediaOrModels: false,
    };
  }
  async submit(input: {
    projectId: string;
    locales?: string[];
    profiles?: string[];
    regenerate?: boolean;
    requestId: string;
  }) {
    const prior = this.jobs.prior(
      "build",
      input.requestId,
      input,
      input.projectId,
    );
    if (prior) return prior;
    const plan = await this.plan(input);
    if (plan.issues.length)
      throw new WeaverError(
        "BUILD_ISSUES",
        "草稿尚不满足制作合同",
        plan.issues,
      );
    const run = this.jobs.submit(
      {
        projectId: input.projectId,
        kind: "build",
        snapshot: plan.snapshot,
        nodes: plan.nodes,
        requestId: input.requestId,
        requestInput: input,
      },
      (runId) => {
        const current = this.projects.read(input.projectId);
        if (current.id !== plan.snapshot.projectRevision.id)
          throw new WeaverError(
            "REVISION_CONFLICT",
            "制作计划准备期间作者修订已改变",
            { current },
          );
        for (const locale of plan.snapshot.locales)
          for (const p of plan.snapshot.profiles) {
            const target = `${locale}/${p.id}`,
              fingerprint = targetFingerprint(
                plan.snapshot.projectRevision.document,
                locale,
                p,
                plan.snapshot.providers,
              );
            this.store.db
              .prepare(
                "INSERT INTO targets VALUES(?,?,1,?,?) ON CONFLICT(project_id,target) DO UPDATE SET generation=generation+1,fingerprint=excluded.fingerprint,run_id=excluded.run_id",
              )
              .run(input.projectId, target, fingerprint, runId);
          }
      },
    );
    return run;
  }
  private async probeNode(c: NodeContext) {
    const input = ProbeInput.parse(c.input),
      key = this.artifacts.key("probe-v3", {
        digest: input.digest,
        version: input.toolVersion,
      });
    if ((await toolVersion("ffprobe")) !== input.toolVersion)
      throw new WeaverError("TOOL_CHANGED", "ffprobe 版本已改变，请重新构建");
    const cached = this.artifacts.lookup(key);
    const fact = cached
      ? this.store.jsonBlob(cached.digest, ProbeFact)
      : await probe(this.store.blobPath(input.digest), c.signal);
    if (!cached)
      this.artifacts.record({
        operation: "probe-v3",
        cacheKey: key,
        generation: "default",
        digest: this.store.putJson(fact),
        mime: "application/json",
        dependencies: [input.digest],
        provenance: { runId: c.runId },
        verified: true,
      });
    return ProbeResult.parse({ kind: "probe", ref: input.ref, fact });
  }
  private async speechNode(c: NodeContext) {
    const input = SpeechInput.parse(c.input),
      snap = this.frozenSnapshot(input.snapshotDigest),
      scene = snap.projectRevision.document.scenes.find(
        (s) => s.id === input.scene,
      );
    if (!scene) throw new WeaverError("INVALID_INPUT", "找不到冻结场景");
    if (input.precise && !snap.providers[ALIGNMENT_PROVIDER])
      throw new WeaverError(
        "PROVIDER_CHANGED",
        "精确对齐协议已升级，请重新构建",
      );
    const speech = speechOf(scene);
    if (!speech) throw new WeaverError("INVALID_INPUT", "场景没有旁白");
    if (input.precise && !speech.text[input.locale]?.trim())
      throw new WeaverError(
        "ALIGNMENT_REQUIRED",
        "精确对齐需要实际语音对应的原文",
      );
    let audioDigest: ReturnType<typeof digest>,
      provider = "imported",
      text = "";
    if (speech.kind === "authored") {
      const ref = speech.voice[input.locale],
        v = snap.library.find(
          (v) => v.itemId === ref?.itemId && v.version === ref?.version,
        );
      if (!v || v.payload.kind !== "voice" || !speech.text[input.locale])
        throw new WeaverError("BUILD_ISSUES", "缺少精确音色版本或文案");
      const voice = v.payload;
      provider = voice.provider;
      text = speech.text[input.locale];
      if (provider !== "modelbest-voxcpm2")
        throw new WeaverError(
          "CAPABILITY_UNAVAILABLE",
          "音色协议没有对应 TTS 适配器",
          { provider },
        );
      const ttsInputs = {
        text,
        style: voice.style,
        locale: input.locale,
        voiceVersion: v.version,
        reference: voice.reference,
        referenceText: voice.referenceText,
        binding: snap.providers[provider],
        ffmpeg: snap.providers["tool:ffmpeg"],
      };
      const cacheKey = ttsKey(ttsInputs);
      const cached = this.artifacts.lookup(cacheKey, snap.generation);
      if (cached) {
        audioDigest = cached.digest;
        c.event("cache-hit", {
          scene: scene.id,
          locale: input.locale,
          operation: "tts",
        });
      } else {
        const raw = path.join(c.workDir, "tts-raw.wav"),
          normalized = path.join(c.workDir, "speech.wav");
        c.event("provider-request", {
          provider,
          binding: snap.providers[provider],
          remoteIdempotency: false,
          remoteCancellation: false,
        });
        await this.providers.tts({
          text,
          style: voice.style,
          reference: voice.reference,
          referenceText: voice.referenceText,
          binding: snap.providers[provider],
          dest: raw,
          workDir: c.workDir,
          signal: c.signal,
        });
        await processRun(
          "ffmpeg",
          [
            "-v",
            "error",
            "-y",
            "-i",
            raw,
            "-ar",
            "48000",
            "-ac",
            "2",
            "-c:a",
            "pcm_s24le",
            normalized,
          ],
          { signal: c.signal },
        );
        const fact = await probe(normalized, c.signal);
        if (!fact.audio || !fact.durationUs)
          throw new WeaverError("PROVIDER_FORMAT", "TTS 未返回有效音频");
        audioDigest = await this.store.importFile(normalized, "audio/wav");
        this.artifacts.record({
          operation: "tts-v3",
          cacheKey,
          generation: snap.generation,
          digest: audioDigest,
          mime: "audio/wav",
          dependencies: [voice.reference],
          provenance: {
            inputs: ttsInputs,
            runId: c.runId,
            scene: scene.id,
            locale: input.locale,
            binding: snap.providers[provider],
          },
          verified: true,
        });
      }
    } else {
      const ref = speech.audio[input.locale],
        a = snap.assets.find(
          (a) => a.assetId === ref?.assetId && a.version === ref?.version,
        );
      if (!a) throw new WeaverError("BUILD_ISSUES", "导入旁白的精确版本缺失");
      const key = this.artifacts.key("speech-normalize-v1", {
        digest: a.digest,
        ffmpeg: snap.providers["tool:ffmpeg"],
      });
      const cached = this.artifacts.lookup(key);
      if (cached) audioDigest = cached.digest;
      else {
        const normalized = path.join(c.workDir, "imported-speech.wav");
        await processRun(
          "ffmpeg",
          [
            "-v",
            "error",
            "-y",
            "-i",
            this.store.blobPath(a.digest),
            "-map",
            "0:a:0",
            "-vn",
            "-ar",
            "48000",
            "-ac",
            "2",
            "-c:a",
            "pcm_s24le",
            normalized,
          ],
          { signal: c.signal },
        );
        audioDigest = await this.store.importFile(normalized, "audio/wav");
        this.artifacts.record({
          operation: "speech-normalize-v1",
          cacheKey: key,
          generation: "default",
          digest: audioDigest,
          mime: "audio/wav",
          dependencies: [a.digest],
          provenance: { ffmpeg: snap.providers["tool:ffmpeg"] },
          verified: true,
        });
      }
      text = speech.text[input.locale] || "";
    }
    const fact = await probe(this.store.blobPath(audioDigest), c.signal);
    if (!fact.audio || !fact.durationUs)
      throw new WeaverError("INVALID_MEDIA", "旁白没有有效音轨");
    let cues: z.infer<typeof CaptionCue>[] = [];
    if (input.precise) {
      if (!text)
        throw new WeaverError(
          "ALIGNMENT_REQUIRED",
          "精确对齐需要实际语音对应的文本",
        );
      const key = this.artifacts.key("alignment-v2", {
        audioDigest,
        text,
        locale: input.locale,
        binding: snap.providers[ALIGNMENT_PROVIDER],
      });
      const cached = this.artifacts.lookup(key);
      let aligned: z.infer<typeof AlignmentResult>;
      if (cached) aligned = this.store.jsonBlob(cached.digest, AlignmentResult);
      else {
        this.providers.require(
          ALIGNMENT_PROVIDER,
          snap.providers[ALIGNMENT_PROVIDER],
        );
        if (
          (await this.providers.freeze([ALIGNMENT_PROVIDER]))[
            ALIGNMENT_PROVIDER
          ] !== snap.providers[ALIGNMENT_PROVIDER]
        )
          throw new WeaverError("PROVIDER_CHANGED", "对齐模型字节已改变");
        aligned = await this.providers.align({
          binding: snap.providers[ALIGNMENT_PROVIDER],
          audio: this.store.blobPath(audioDigest),
          text,
          locale: input.locale,
          duration: fact.durationUs / 1e6,
          workDir: c.workDir,
          signal: c.signal,
        });
        this.artifacts.record({
          operation: "alignment-v2",
          cacheKey: key,
          generation: "default",
          digest: this.store.putJson(aligned),
          mime: "application/json",
          dependencies: [audioDigest],
          provenance: aligned,
          verified: true,
        });
      }
      cues = aligned.segments.map((s, i) =>
        CaptionCue.parse({
          id: `${scene.id}-aligned-${i}`,
          text: s.text,
          timingQuality: "aligned",
          provenance: `${aligned.backend}/${aligned.version}/${aligned.model}`,
          time: {
            kind: "speech",
            sceneId: scene.id,
            range: {
              startUs: Math.round(s.start * 1e6),
              durationUs: Math.round((s.end - s.start) * 1e6),
            },
          },
        }),
      );
    }
    return SpeechResult.parse({
      kind: "speech",
      ref: `${input.locale}:${scene.id}`,
      fact: {
        digest: audioDigest,
        durationSamples: Math.round((fact.durationUs / 1e6) * 48000),
        cues,
        provider,
      },
    });
  }
  private async compileNode(c: NodeContext) {
    const input = CompileInput.parse(c.input),
      snapshot = this.frozenSnapshot(input.snapshotDigest),
      media: z.infer<typeof VerifiedFacts>["media"] = {},
      speech: z.infer<typeof VerifiedFacts>["speech"] = {};
    for (const value of Object.values(c.dependencies)) {
      const p = ProbeResult.safeParse(value);
      if (p.success) media[p.data.ref] = p.data.fact;
      const s = SpeechResult.safeParse(value);
      if (s.success) speech[s.data.ref] = s.data.fact;
    }
    const ffmpeg = await toolVersion("ffmpeg");
    if (snapshot.providers["tool:ffmpeg"] !== ffmpeg)
      throw new WeaverError("TOOL_CHANGED", "FFmpeg 版本已改变，请重新构建");
    const font =
      snapshot.providers[`tool:font:${input.locale}`] || "system-fontconfig";
    const result = compileTimeline(
      snapshot,
      VerifiedFacts.parse({
        media,
        speech,
        tools: {
          ffmpeg,
          font,
          renderer: RENDER_ALGORITHM,
          build: BUILD_ALGORITHM,
          cardAdapter: snapshot.providers["tool:card"] || "unused",
        },
      }),
      input.locale,
      input.profile,
    );
    if (!result.ok)
      throw new WeaverError(
        "BUILD_ISSUES",
        "最终时间轴无法编译",
        result.issues,
      );
    const manifestDigest = this.store.putJson(result.manifest),
      runSnapshotDigest = this.store.putJson(snapshot);
    const renderSnapshot = RenderSnapshot.parse({
      runSnapshotDigest,
      timelineDigest: manifestDigest,
      verifiedArtifactRefs: Object.values(speech).map((s) => s.digest),
      target: input.target,
    });
    const renderSnapshotDigest = this.store.putJson(renderSnapshot);
    c.event("timeline-compiled", {
      target: input.target,
      frames: result.manifest.totalFrames,
      manifestDigest,
    });
    return CompileResult.parse({
      manifestDigest,
      renderSnapshotDigest,
      runSnapshotDigest,
      target: input.target,
      fingerprint: input.fingerprint,
    });
  }
  private async renderNode(c: NodeContext) {
    const input = CompileInput.parse(c.input),
      snapshot = this.frozenSnapshot(input.snapshotDigest),
      compiled = CompileResult.parse(Object.values(c.dependencies)[0]);
    const m = this.store.jsonBlob(compiled.manifestDigest, TimelineManifest);
    for (const [key, value] of Object.entries(
      await this.toolsFor(snapshot.projectRevision.document),
    ))
      if (snapshot.providers[key] !== value)
        throw new WeaverError(
          "TOOL_CHANGED",
          "制作工具、模板或字体已改变，请重新构建",
          { tool: key },
        );

    const cacheKey = this.artifacts.key("render-v2", {
      timelineDigest: compiled.manifestDigest,
      renderAlgorithm: RENDER_ALGORITHM,
    });
    const cached = this.artifacts.lookup(cacheKey);
    const cachedSet = cached
      ? this.store.jsonBlob(cached.digest, z.record(z.string(), z.string()))
      : undefined;
    let files: Record<string, ReturnType<typeof digest>>;
    if (
      cachedSet &&
      Object.values(cachedSet).every((d) => this.store.verifyBlob(d))
    )
      files = z.record(z.string(), Digest).parse(cachedSet);
    else {
      const rendered = await renderTimeline({
        store: this.store,
        manifest: m,
        snapshot,
        workDir: c.workDir,
        signal: c.signal,
      });
      files = {};
      for (const [name, file] of Object.entries(rendered.files))
        files[name] = await this.store.importFile(
          file,
          name === "video" || name === "proxy" || name.startsWith("segment")
            ? "video/mp4"
            : name === "audio"
              ? "audio/wav"
              : name === "srt"
                ? "application/x-subrip"
                : "application/json",
        );
      this.artifacts.record({
        operation: "render-v2",
        cacheKey,
        generation: "default",
        digest: this.store.putJson(files),
        mime: "application/json",
        dependencies: Object.values(files),
        provenance: {
          runId: c.runId,
          renderSnapshotDigest: compiled.renderSnapshotDigest,
        },
        verified: true,
      });
    }
    return {
      compiled,
      files,
      providerBindings: snapshot.providers,
      projectId: snapshot.projectRevision.projectId,
      revisionId: snapshot.projectRevision.id,
    };
  }
  private publish(c: NodeContext, raw: unknown): void {
    const r = z
      .object({
        compiled: CompileResult,
        files: z.record(z.string(), z.string()),
        providerBindings: z.record(z.string(), z.string()),
        projectId: z.string(),
        revisionId: z.string(),
      })
      .parse(raw);
    if (r.providerBindings["tool:build"] !== BUILD_ALGORITHM)
      throw new WeaverError("TOOL_CHANGED", "制作算法已改变，请重新构建");
    for (const d of Object.values(r.files))
      if (!this.store.verifyBlob(d))
        throw new WeaverError("INTEGRITY_FAILED", "交付集合不完整");
    const target = z
      .object({
        generation: z.number(),
        fingerprint: z.string(),
        run_id: z.string(),
      })
      .parse(
        this.store.db
          .prepare("SELECT * FROM targets WHERE project_id=? AND target=?")
          .get(r.projectId, r.compiled.target),
      );
    if (
      target.run_id !== c.runId ||
      target.fingerprint !== r.compiled.fingerprint
    )
      throw new WeaverError("FENCED", "旧目标请求不能提升 current");
    const currentDoc = this.projects.read(r.projectId).document,
      [locale, profileId] = r.compiled.target.split("/");
    const profile =
      currentDoc.profiles.find((p) => p.id === profileId) ||
      PROFILES[profileId];
    if (
      !profile ||
      !currentDoc.locales.includes(locale) ||
      targetFingerprint(currentDoc, locale, profile, r.providerBindings) !==
        r.compiled.fingerprint
    )
      throw new WeaverError(
        "FENCED",
        "作者内容或有效 provider 已改变，本次结果不能提升 current",
      );
    for (const id of ["modelbest-voxcpm2", ALIGNMENT_PROVIDER])
      if (r.providerBindings[id]) {
        const old = z
          .object({
            id: z.string(),
            model: z.string(),
            version: z.string(),
            endpoint: z.string(),
          })
          .parse(JSON.parse(r.providerBindings[id]));
        if (JSON.stringify(old) !== this.providers.binding(id))
          throw new WeaverError("FENCED", "有效 provider 已改变");
      }
    const delivery = Delivery.parse({
      id: newId("delivery"),
      projectId: r.projectId,
      revisionId: r.revisionId,
      runId: c.runId,
      target: r.compiled.target,
      generation: target.generation,
      fingerprint: target.fingerprint,
      timelineDigest: r.compiled.manifestDigest,
      runSnapshotDigest: r.compiled.runSnapshotDigest,
      artifacts: r.files,
      createdAt: now(),
    });
    this.store.db
      .prepare("INSERT INTO deliveries VALUES(?,?,?,?,?,?,?,?,?)")
      .run(
        delivery.id,
        delivery.projectId,
        delivery.revisionId,
        delivery.runId,
        delivery.target,
        delivery.generation,
        delivery.fingerprint,
        canonical(delivery),
        delivery.createdAt,
      );
    this.store.db
      .prepare(
        "INSERT INTO current_deliveries VALUES(?,?,?) ON CONFLICT(project_id,target) DO UPDATE SET delivery_id=excluded.delivery_id",
      )
      .run(delivery.projectId, delivery.target, delivery.id);
    this.store.pin(`delivery:${delivery.id}`, delivery);
    this.jobs.event(c.runId, "delivery-published", {
      deliveryId: delivery.id,
      target: delivery.target,
    });
  }
  async deliveries(
    projectId: string,
    doc = this.projects.read(projectId).document,
  ) {
    const providers = await this.providers.freeze(
      doc.locales.some((locale) => needsAlignment(doc, locale))
        ? ["modelbest-voxcpm2", ALIGNMENT_PROVIDER]
        : ["modelbest-voxcpm2"],
    );
    Object.assign(providers, await this.toolsFor(doc));
    const currentIds = new Set(
      z
        .array(z.object({ delivery_id: z.string() }))
        .parse(
          this.store.db
            .prepare(
              "SELECT delivery_id FROM current_deliveries WHERE project_id=?",
            )
            .all(projectId),
        )
        .map((r) => r.delivery_id),
    );
    return this.store
      .listJson(
        "SELECT json FROM deliveries WHERE project_id=? ORDER BY created_at DESC",
        [projectId],
        Delivery,
      )
      .map((d) => {
        const [locale, profileId] = d.target.split("/"),
          p =
            doc.profiles.find((p) => p.id === profileId) || PROFILES[profileId];
        const complete = Object.values(d.artifacts).every((x) =>
          this.store.verifyBlob(x),
        );
        return {
          ...d,
          state: !complete
            ? "missing"
            : !currentIds.has(d.id)
              ? "historical"
              : p &&
                  doc.locales.includes(locale) &&
                  targetFingerprint(doc, locale, p, providers) === d.fingerprint
                ? "current"
                : "stale",
        };
      });
  }
}
