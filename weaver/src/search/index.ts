import fs from "node:fs";
import path from "node:path";
import {
  z,
  VlmProvider,
  Digest,
  MediaAssetVersion,
  ProjectRevision,
  AnalysisEntry,
  Proposal,
  Scene,
  refKey,
} from "../contracts/index.ts";
import { WeaverError } from "../contracts/errors.ts";
import { Store, digest, newId, canonical } from "../store/index.ts";
import { Projects } from "../project/service.ts";
import { Jobs, type NodeContext } from "../jobs/index.ts";
import { fileURLToPath } from "node:url";
import {
  Providers,
  AsrResult,
  EMBEDDING_PROVIDER,
  RERANK_PROVIDER,
} from "../adapters/providers.ts";
import { EmbeddingInput, RerankResult } from "../adapters/local-models.ts";
import { Artifacts } from "../artifacts/index.ts";
import { probe } from "../media/probe.ts";
import { processRun } from "../media/process.ts";
import { visualFacts } from "../media/visual.ts";
import { windowsFor, stitchAsrResults } from "../asr-chunk.ts";
import {
  buildSequences,
  sequenceNeedsVision,
  pickFrameTimes,
  mergeByObservation,
} from "../describe-group.ts";
import { sequenceRatio, alignEditedToSources } from "../match-align.ts";
import { coreText } from "../sentences.ts";
import {
  cutsFromVisualScenes,
  rankCandidates,
  fillSilentGaps,
  type VisualCut,
  type FrameHash,
} from "../match-visual.ts";
import { MATCH_SETTINGS } from "../match-settings.ts";
import {
  splitAndSnapCuts,
  applyPadding,
  stabilizeCuts,
  enforceDuration,
  mergeAdjacentCuts,
  dropCrumbs,
  dropIslands,
  dropRewinds,
  coalesceSourceRuns,
  type SceneIndex,
  type TimedCut,
} from "../match-scene.ts";

const AnalysisInput = z.object({
  revision: ProjectRevision,
  asset: MediaAssetVersion,
  kinds: z.array(z.enum(["asr", "describe"])),
  locale: z.string(),
  binding: z.record(z.string(), z.string()),
  vlmProvider: VlmProvider.default("modelbest-vlm"),
  fromUs: z.number().int().nonnegative().default(0),
  durationUs: z.number().int().positive().optional(),
  generation: z.string(),
});
const ObservationTree = z.object({
  source: z.string(),
  window: z.object({ startUs: z.number(), durationUs: z.number() }),
  sequences: z.array(
    z.object({
      id: z.string(),
      in: z.number(),
      out: z.number(),
      observation: z.string().optional(),
      shots: z.array(
        z.object({
          in: z.number(),
          out: z.number(),
          t: z.number(),
          observation: z.string().optional(),
          skip: z.string().optional(),
        }),
      ),
      lines: z.array(
        z.object({ text: z.string(), start: z.number(), end: z.number() }),
      ),
    }),
  ),
});

export class Analysis {
  readonly artifacts: Artifacts;
  constructor(
    private readonly store: Store,
    readonly projects: Projects,
    readonly jobs: Jobs,
    readonly providers: Providers,
  ) {
    this.artifacts = new Artifacts(store);
    jobs.register("analyze", (c) => this.analyzeNode(c));
    jobs.register("reference-match", (c) => this.matchNode(c));
    jobs.register(
      "semantic-search",
      (c) => this.semanticNode(c),
      (_c, result) => {
        this.saveProposal(Proposal.parse(result));
      },
    );
    jobs.register("standalone-asr", (c) => this.standaloneAsr(c));
    jobs.register("voice-mint", (c) => this.mint(c));
    jobs.register("import-proposal", (c) => this.importProposalNode(c));
    jobs.register("capture", (c) => this.captureNode(c));
    jobs.register("import-analysis", (c) => this.importAnalysisNode(c));
  }
  private evidence(projectId: string) {
    return this.store.listJson(
      "SELECT json FROM analysis WHERE project_id=? ORDER BY source_key,start_us",
      [projectId],
      AnalysisEntry,
    );
  }
  list(projectId: string) {
    const p = this.projects.read(projectId);
    return this.evidence(projectId).map((e) => ({
      ...e,
      state: p.document.assets.some((r) => refKey(r) === refKey(e.source))
        ? "current"
        : "historical",
    }));
  }
  async submit(input: {
    projectId: string;
    kinds: string[];
    requestId: string;
    sourceId?: string;
    locale?: string;
    fromUs?: number;
    durationUs?: number;
    regenerate?: boolean;
    vlmProvider?: string;
  }) {
    const prior = this.jobs.prior(
      "analyze",
      input.requestId,
      input,
      input.projectId,
    );
    if (prior) return prior;
    const revision = this.projects.read(input.projectId),
      assets = this.projects
        .assetsFor(revision.document)
        .filter(
          (a) =>
            (a.kind === "video" || a.kind === "audio") &&
            (!input.sourceId || a.assetId === input.sourceId),
        );
    if (!assets.length)
      throw new WeaverError("INVALID_INPUT", "项目没有所选媒体");
    const vlmProvider = this.providers.selectedVlm(input.vlmProvider);
    const binding = await this.providers.freeze(
      input.kinds.map((k) => (k === "asr" ? "qwen3-asr" : vlmProvider)),
    );
    const nodes = assets.map((a) => ({
      key: `analyze:${a.assetId}@${a.version}`,
      operation: "analyze",
      input: AnalysisInput.parse({
        revision,
        asset: a,
        kinds: input.kinds,
        locale: input.locale || revision.document.locales[0],
        binding,
        vlmProvider,
        fromUs: input.fromUs,
        durationUs: input.durationUs,
        generation: input.regenerate ? input.requestId : "default",
      }),
    }));
    return this.jobs.submit({
      requestInput: input,
      projectId: input.projectId,
      kind: "analyze",
      snapshot: { revision, assets, binding },
      nodes,
      requestId: input.requestId,
    });
  }
  private index(entry: z.infer<typeof AnalysisEntry>): void {
    this.store.transaction(() => {
      this.store.db
        .prepare("INSERT OR REPLACE INTO analysis VALUES(?,?,?,?,?,?,?,?)")
        .run(
          entry.id,
          entry.projectId,
          refKey(entry.source),
          entry.kind,
          entry.range.startUs,
          entry.range.durationUs,
          entry.model,
          canonical(entry),
        );
      this.store.pin(`analysis:${entry.id}`, entry);
    });
  }
  private async transcribe(
    input: {
      digest: z.infer<typeof Digest>;
      locale: string;
      binding: string;
      startUs: number;
      durationUs: number;
      generation: string;
    },
    c: NodeContext,
    depth = 0,
  ): Promise<z.infer<typeof AsrResult>> {
    const key = this.artifacts.key("asr-window-v3", {
        ...input,
        algorithm: "qwen-overlap-stitch-v2",
      }),
      cached = this.artifacts.lookup(key, input.generation);
    if (cached) return this.store.jsonBlob(cached.digest, AsrResult);
    const dest = path.join(
      c.workDir,
      `asr-${input.startUs}-${input.durationUs}.wav`,
    );
    await processRun(
      "ffmpeg",
      [
        "-v",
        "error",
        "-y",
        "-ss",
        String(input.startUs / 1e6),
        "-t",
        String(input.durationUs / 1e6),
        "-i",
        this.store.blobPath(input.digest),
        "-vn",
        "-ac",
        "1",
        "-ar",
        "16000",
        dest,
      ],
      { signal: c.signal },
    );
    let result: z.infer<typeof AsrResult>;
    c.event("provider-request", {
      provider: "qwen3-asr",
      sourceDigest: input.digest,
      startUs: input.startUs,
      durationUs: input.durationUs,
      binding: input.binding,
    });
    try {
      result = await this.providers.asr({
        audio: dest,
        locale: input.locale,
        binding: input.binding,
        workDir: c.workDir,
        signal: c.signal,
      });
    } catch (e) {
      if (
        !(e instanceof WeaverError) ||
        e.code !== "ASR_TRUNCATED" ||
        depth >= 1
      )
        throw e;
      const half = Math.floor(input.durationUs / 2),
        left = await this.transcribe(
          { ...input, durationUs: half },
          c,
          depth + 1,
        ),
        right = await this.transcribe(
          {
            ...input,
            startUs: input.startUs + half,
            durationUs: input.durationUs - half,
          },
          c,
          depth + 1,
        );
      result = AsrResult.parse(
        stitchAsrResults([
          { start: 0, end: half / 1e6, result: left },
          { start: half / 1e6, end: input.durationUs / 1e6, result: right },
        ]),
      );
    }
    this.artifacts.record({
      operation: "asr-window-v3",
      cacheKey: key,
      generation: input.generation,
      digest: this.store.putJson(result),
      mime: "application/json",
      dependencies: [input.digest],
      provenance: {
        runId: c.runId,
        sourceRange: { startUs: input.startUs, durationUs: input.durationUs },
        binding: input.binding,
      },
      verified: true,
    });
    return result;
  }
  private async analyzeNode(c: NodeContext) {
    const i = AnalysisInput.parse(c.input),
      a = i.asset,
      fact = await probe(this.store.blobPath(a.digest), c.signal),
      end = i.durationUs ? i.fromUs + i.durationUs : fact.durationUs;
    if (end > fact.durationUs || end <= i.fromUs)
      throw new WeaverError("INVALID_INPUT", "分析窗口超出源媒体");
    const source = { assetId: a.assetId, version: a.version },
      entries: z.infer<typeof AnalysisEntry>[] = [],
      transcripts: { text: string; start: number; end: number }[] = [];
    if (i.kinds.includes("asr")) {
      if (!fact.audio)
        throw new WeaverError("INVALID_MEDIA", "源媒体无音轨，选择画面观察");
      for (const w of windowsFor((end - i.fromUs) / 1e6)) {
        c.signal.throwIfAborted();
        const startUs = i.fromUs + Math.round(w.start * 1e6),
          durationUs = Math.round((w.end - w.start) * 1e6);
        const result = await this.transcribe(
            {
              digest: a.digest,
              locale: i.locale,
              binding: i.binding["qwen3-asr"],
              startUs,
              durationUs,
              generation: i.generation,
            },
            c,
          ),
          evidenceDigest = this.store.putJson(result);
        const sentences = result.sentences?.length
          ? result.sentences
          : result.text
            ? [{ text: result.text, start: 0, end: durationUs / 1e6 }]
            : [];
        for (const [index, s] of sentences.entries()) {
          const start = startUs + Math.round(s.start * 1e6),
            stop = Math.min(end, startUs + Math.round(s.end * 1e6));
          if (
            stop <= start ||
            entries.some(
              (e) =>
                e.range.startUs <= start &&
                e.range.startUs + e.range.durationUs >= stop,
            )
          )
            continue;
          const entry = AnalysisEntry.parse({
            id: `analysis-${digest({ projectId: i.revision.projectId, source, kind: "asr", start, stop, binding: i.binding["qwen3-asr"] })}`,
            projectId: i.revision.projectId,
            source,
            sourceDigest: a.digest,
            range: { startUs: start, durationUs: stop - start },
            kind: "asr",
            text: s.text,
            evidenceDigest,
            model: i.binding["qwen3-asr"],
            timingQuality: result.timingQuality,
          });
          this.index(entry);
          entries.push(entry);
          transcripts.push({
            text: s.text,
            start: start / 1e6,
            end: stop / 1e6,
          });
        }
        c.event("analysis-window", {
          source,
          kind: "asr",
          startUs,
          durationUs,
          entries: entries.length,
        });
      }
    }
    if (i.kinds.includes("describe")) {
      if (!fact.video)
        throw new WeaverError("INVALID_MEDIA", "画面观察需要视频流");
      const visual = await visualFacts(
        this.store,
        a.digest,
        c.workDir,
        c.signal,
        { startUs: i.fromUs, durationUs: end - i.fromUs },
      );
      if (!transcripts.length)
        for (const e of this.list(i.revision.projectId).filter(
          (e) => e.kind === "asr" && e.sourceDigest === a.digest,
        ))
          transcripts.push({
            text: e.text,
            start: e.range.startUs / 1e6,
            end: (e.range.startUs + e.range.durationUs) / 1e6,
          });
      const sequences = buildSequences(
        visual.scenes,
        visual.hashes,
        transcripts,
        { window: { from: i.fromUs / 1e6, to: end / 1e6 } },
      );
      for (const seq of sequences) {
        c.signal.throwIfAborted();
        const key = this.artifacts.key("describe-window-v3", {
            sourceDigest: a.digest,
            startUs: Math.round(seq.in * 1e6),
            endUs: Math.round(seq.out * 1e6),
            binding: i.binding[i.vlmProvider],
            prompt: "observation-only-v2",
            settings: "scene-tree-v1",
          }),
          cached = this.artifacts.lookup(key, i.generation);
        if (cached)
          seq.observation = this.store.jsonBlob(
            cached.digest,
            z.object({ observation: z.string() }),
          ).observation;
        else if (sequenceNeedsVision(seq)) {
          const frames: string[] = [];
          for (const t of pickFrameTimes(seq)) {
            const dest = path.join(
              c.workDir,
              `frame-${Math.round(t * 1e6)}.jpg`,
            );
            await processRun(
              "ffmpeg",
              [
                "-v",
                "error",
                "-y",
                "-ss",
                String(t),
                "-i",
                this.store.blobPath(a.digest),
                "-frames:v",
                "1",
                "-vf",
                "scale=640:-2",
                dest,
              ],
              { signal: c.signal },
            );
            frames.push(dest);
          }
          c.event("provider-request", {
            provider: i.vlmProvider,
            sourceDigest: a.digest,
            startUs: Math.round(seq.in * 1e6),
            endUs: Math.round(seq.out * 1e6),
            binding: i.binding[i.vlmProvider],
          });
          const result = await this.providers.describe({
            frames,
            provider: i.vlmProvider,
            prompt:
              "只记录可见的人物、动作、场景与变化。不要编写旁白，不推断不可见动机。",
            binding: i.binding[i.vlmProvider],
            signal: c.signal,
          });
          seq.observation = result.observation;
          this.artifacts.record({
            operation: "describe-window-v3",
            cacheKey: key,
            generation: i.generation,
            digest: this.store.putJson(result),
            mime: "application/json",
            dependencies: [a.digest],
            provenance: {
              runId: c.runId,
              source,
              startUs: seq.in * 1e6,
              endUs: seq.out * 1e6,
            },
            verified: true,
          });
        }
        if (seq.observation) {
          const evidenceDigest = this.store.putJson({ source, sequence: seq });
          const entry = AnalysisEntry.parse({
            id: `analysis-${digest({ projectId: i.revision.projectId, source, kind: "describe", in: seq.in, out: seq.out, binding: i.binding[i.vlmProvider] })}`,
            projectId: i.revision.projectId,
            source,
            sourceDigest: a.digest,
            range: {
              startUs: Math.round(seq.in * 1e6),
              durationUs: Math.round((seq.out - seq.in) * 1e6),
            },
            kind: "describe",
            text: seq.observation,
            evidenceDigest,
            model: i.binding[i.vlmProvider],
            timingQuality: "native",
          });
          this.index(entry);
          entries.push(entry);
        }
        c.event("analysis-window", {
          source,
          kind: "describe",
          startUs: Math.round(seq.in * 1e6),
          durationUs: Math.round((seq.out - seq.in) * 1e6),
        });
      }
      const tree = ObservationTree.parse({
        source: refKey(source),
        window: { startUs: i.fromUs, durationUs: end - i.fromUs },
        sequences: mergeByObservation(sequences),
      });
      const treeDigest = this.store.putJson(tree);
      this.store.pin(`analysis-tree:${c.nodeId}`, treeDigest);
    }
    return {
      entries: entries.sort(
        (a, b) => a.range.startUs - b.range.startUs || a.id.localeCompare(b.id),
      ),
    };
  }
  search(input: {
    projectId: string;
    query: string;
    requestId: string;
    sourceIds?: string[];
    fromUs?: number;
    toUs?: number;
    limit?: number;
  }) {
    const p = this.projects.read(input.projectId);
    return this.store.mutate("search", input.requestId, input, Proposal, () => {
      const query = coreText(input.query),
        entries = this.list(input.projectId).filter(
          (e) =>
            e.state === "current" &&
            (!input.sourceIds?.length ||
              input.sourceIds.includes(e.source.assetId)) &&
            (input.fromUs === undefined || e.range.startUs >= input.fromUs) &&
            (input.toUs === undefined ||
              e.range.startUs + e.range.durationUs <= input.toUs),
        );
      const candidates = entries
        .map((e) => {
          const text = coreText(e.text),
            score = !query
              ? 0
              : text.includes(query)
                ? 1
                : sequenceRatio(query, text);
          return {
            id: e.id,
            source: e.source,
            range: e.range,
            scores: { text: score, visual: 0, semantic: 0 },
            evidence: [e.text, e.evidenceDigest],
            method: "text",
            limitations: [
              "文本相似度不保证语义或画面正确",
              ...(e.timingQuality === "estimated" ? ["证据时间为估算"] : []),
            ],
          };
        })
        .filter((c) => c.scores.text > 0)
        .sort((a, b) => b.scores.text - a.scores.text)
        .slice(0, input.limit || 20);
      const proposal = Proposal.parse({
        id: newId("proposal"),
        projectId: p.projectId,
        revision: p.id,
        kind: "script-search",
        query: input.query,
        candidates,
        selections: [],
        warnings: candidates.length
          ? candidates[0].scores.text < 0.6
            ? ["最高候选分数偏低"]
            : []
          : ["无候选，请先分析素材或导入证据"],
      });
      this.saveProposal(proposal);
      return proposal;
    });
  }
  proposals(projectId: string) {
    return this.store.listJson(
      "SELECT json FROM proposals WHERE project_id=? ORDER BY rowid DESC",
      [projectId],
      Proposal,
    );
  }
  private saveProposal(p: Proposal): void {
    this.store.db
      .prepare("INSERT INTO proposals VALUES(?,?,?)")
      .run(p.id, p.projectId, canonical(p));
    this.store.pin(`proposal:${p.id}`, p);
  }
  apply(input: {
    projectId: string;
    proposalId: string;
    selection: string[];
    expectedRevision: string;
    requestId: string;
    allowReuse?: boolean;
  }) {
    return this.store.mutate(
      "proposal-apply",
      input.requestId,
      input,
      ProjectRevision,
      () => {
        const proposal = this.store.readJson(
            "SELECT json FROM proposals WHERE id=? AND project_id=?",
            [input.proposalId, input.projectId],
            Proposal,
          ),
          p = this.projects.read(input.projectId);
        if (
          proposal.revision !== input.expectedRevision ||
          p.id !== input.expectedRevision
        )
          throw new WeaverError(
            "REVISION_CONFLICT",
            "候选基于旧修订，请重新查询",
            {
              current: p,
            },
          );
        const selected = input.selection.map((id) => {
          const c = proposal.candidates.find((c) => c.id === id);
          if (!c)
            throw new WeaverError("INVALID_INPUT", "候选选择不存在", { id });
          return c;
        });
        if (!selected.length)
          throw new WeaverError("INVALID_INPUT", "至少选择一个候选");
        const ranges = [
          ...p.document.scenes.flatMap((s) =>
            s.kind === "clip"
              ? [{ source: s.source, range: s.sourceRange }]
              : [],
          ),
        ];
        for (const c of selected) {
          if (
            !input.allowReuse &&
            ranges.some(
              (s) =>
                refKey(s.source) === refKey(c.source) &&
                Math.max(s.range.startUs, c.range.startUs) <
                  Math.min(
                    s.range.startUs + s.range.durationUs,
                    c.range.startUs + c.range.durationUs,
                  ),
            )
          )
            throw new WeaverError(
              "REUSE_CONFLICT",
              "选段与已用源窗重叠，需显式允许重用",
            );
          ranges.push(c);
        }
        const revision = this.projects.apply({
          projectId: p.projectId,
          expectedRevision: input.expectedRevision,
          requestId: input.requestId,
          ops: [
            {
              op: "scenes",
              value: [
                ...p.document.scenes,
                ...selected.map((c) =>
                  Scene.parse({
                    id: newId("scene"),
                    label: proposal.query,
                    kind: "clip",
                    source: c.source,
                    sourceRange: c.range,
                    framing: { fit: "contain" },
                    playback: { kind: "source", audio: { kind: "original" } },
                  }),
                ),
              ],
            },
          ],
        });
        const updated = Proposal.parse({
          ...proposal,
          selections: input.selection,
        });
        this.store.db
          .prepare("UPDATE proposals SET json=? WHERE id=?")
          .run(canonical(updated), proposal.id);
        return revision;
      },
    );
  }
  submitMatch(input: {
    projectId: string;
    editedId: string;
    sourceIds?: string[];
    requestId: string;
  }) {
    const prior = this.jobs.prior(
      "reference-match",
      input.requestId,
      input,
      input.projectId,
    );
    if (prior) return prior;
    const revision = this.projects.read(input.projectId),
      assets = this.projects
        .assetsFor(revision.document)
        .filter((a) => a.kind === "video");
    return this.jobs.submit({
      requestInput: input,
      projectId: input.projectId,
      kind: "reference-match",
      snapshot: { revision, assets },
      nodes: [
        {
          key: "match",
          operation: "reference-match",
          input: {
            revision,
            assets,
            editedId: input.editedId,
            sourceIds: input.sourceIds,
          },
        },
      ],
      requestId: input.requestId,
    });
  }
  private async matchNode(c: NodeContext) {
    const i = z
        .object({
          revision: ProjectRevision,
          assets: z.array(MediaAssetVersion),
          editedId: z.string(),
          sourceIds: z.array(z.string()).optional(),
        })
        .parse(c.input),
      edited = i.assets.find((a) => a.assetId === i.editedId),
      sources = i.assets.filter(
        (a) =>
          a.assetId !== i.editedId &&
          (!i.sourceIds?.length || i.sourceIds.includes(a.assetId)),
      );
    if (!edited || !sources.length)
      throw new WeaverError("INVALID_INPUT", "需要一条参考成片和至少一条源片");
    const e = await visualFacts(this.store, edited.digest, c.workDir, c.signal),
      hashes = new Map<string, FrameHash[]>(),
      scenes = new Map<string, SceneIndex>(),
      durations = new Map<string, number>();
    for (const a of sources) {
      const v = await visualFacts(this.store, a.digest, c.workDir, c.signal);
      const key = refKey(a);
      hashes.set(key, v.hashes);
      scenes.set(key, v.scenes);
      durations.set(key, v.scenes.duration);
    }
    let rawCuts: VisualCut[] = cutsFromVisualScenes(e.scenes, e.hashes, hashes);
    const allEvidence = this.list(i.revision.projectId).filter(
        (e) => e.kind === "asr" && e.state === "current",
      ),
      warnings: string[] = [];
    const transcript = (
      a: z.infer<typeof MediaAssetVersion>,
      duration: number,
    ) => {
      const rows = allEvidence.filter((e) => e.sourceDigest === a.digest);
      return {
        source_path: refKey(a),
        duration,
        full_text: rows.map((e) => e.text).join(" "),
        language: "",
        sentences: rows.map((e) => ({
          text: e.text,
          start: e.range.startUs / 1e6,
          end: (e.range.startUs + e.range.durationUs) / 1e6,
          words: [],
        })),
      };
    };
    const editedText = transcript(edited, e.scenes.duration),
      sourceText = sources
        .map((a) => ({
          ref: refKey(a),
          transcript: transcript(a, durations.get(refKey(a)) || 0),
        }))
        .filter((s) => s.transcript.full_text);
    if (editedText.full_text && sourceText.length) {
      const mismatch =
        sourceText.length === 1 &&
        sequenceRatio(
          coreText(editedText.full_text),
          coreText(sourceText[0].transcript.full_text),
        ) < MATCH_SETTINGS.speechMismatchMax;
      if (mismatch) warnings.push("对白差异过大，按显式视觉策略匹配");
      else {
        const rows = alignEditedToSources(editedText, sourceText),
          textCuts: VisualCut[] = [];
        for (const row of rows) {
          const ranked = rankCandidates(
              row.candidates,
              e.hashes,
              hashes,
              row.start,
              row.end,
            ),
            best = ranked[0];
          if (best)
            textCuts.push({
              sceneId: "text",
              sourceRef: best.sourceRef,
              in: best.tStart,
              out: best.tEnd,
              editedStart: row.start,
              editedEnd: row.end,
              text: row.text,
              score: best.combinedScore,
              textScore: best.score,
              visualScore: best.visualScore,
              matchMethod: "text",
              sceneSnapped: false,
              warnings: [],
            });
        }
        const coverage =
          textCuts.reduce((sum, c) => sum + c.editedEnd - c.editedStart, 0) /
          Math.max(0.001, e.scenes.duration);
        if (coverage >= MATCH_SETTINGS.textCoverageMin)
          rawCuts = fillSilentGaps(
            textCuts,
            e.scenes.duration,
            e.hashes,
            hashes,
          );
        else warnings.push("文本覆盖不足，保留视觉候选");
      }
    } else warnings.push("没有已转写的对白证据，本次仅运行视觉匹配");
    let cuts: TimedCut[] = rawCuts.map((c) => ({
      ...c,
      originalIn: c.in,
      originalOut: c.out,
    }));
    cuts = splitAndSnapCuts(cuts, e.scenes, scenes);
    cuts = applyPadding(cuts, durations);
    cuts = stabilizeCuts(cuts);
    cuts = enforceDuration(cuts, durations);
    cuts = stabilizeCuts(cuts);
    cuts = mergeAdjacentCuts(cuts);
    cuts = dropCrumbs(cuts);
    cuts = dropIslands(cuts);
    cuts = dropRewinds(cuts);
    cuts = coalesceSourceRuns(cuts);
    cuts = mergeAdjacentCuts(cuts);
    const proposal = Proposal.parse({
      id: newId("proposal"),
      projectId: i.revision.projectId,
      revision: i.revision.id,
      kind: "reference-match",
      query: `参考 ${edited.name}`,
      candidates: cuts.map((cut, index) => {
        const a = sources.find((a) => refKey(a) === cut.sourceRef);
        if (!a) throw new WeaverError("INVALID_INPUT", "匹配引用不存在");
        return {
          id: `candidate-${index}`,
          source: { assetId: a.assetId, version: a.version },
          range: {
            startUs: Math.round(cut.in * 1e6),
            durationUs: Math.round((cut.out - cut.in) * 1e6),
          },
          scores: { text: cut.textScore, visual: cut.visualScore, semantic: 0 },
          evidence: [
            `参考区间 ${cut.editedStart}–${cut.editedEnd}s`,
            `切镜吸附 ${cut.sceneSnapped}`,
            cut.text || "画面证据",
          ],
          method: cut.matchMethod,
          limitations: cut.warnings,
        };
      }),
      selections: [],
      warnings: [
        ...warnings,
        "连续性、防回跳与防闪切策略已执行；分数不保证内容一致",
        ...(cuts.length ? [] : ["无候选"]),
      ],
    });
    this.saveProposal(proposal);
    return proposal;
  }
  async submitSemantic(input: {
    projectId: string;
    query: string;
    requestId: string;
    rerank?: boolean;
    sourceIds?: string[];
    fromUs?: number;
    toUs?: number;
    limit?: number;
  }) {
    const request = z
      .object({
        projectId: z.string().min(1),
        query: z.string().trim().min(1),
        requestId: z.string().min(1),
        rerank: z.boolean().default(false),
        sourceIds: z.array(z.string().min(1)).optional(),
        fromUs: z.number().int().nonnegative().safe().optional(),
        toUs: z.number().int().positive().safe().optional(),
        limit: z.number().int().min(1).max(50).default(20),
      })
      .refine(
        (v) =>
          v.fromUs === undefined || v.toUs === undefined || v.toUs > v.fromUs,
        "检索结束时间必须晚于开始时间",
      )
      .parse(input);
    const prior = this.jobs.prior(
      "semantic-search",
      request.requestId,
      request,
      request.projectId,
    );
    if (prior) return prior;
    const revision = this.projects.read(request.projectId);
    const sources = new Set(revision.document.assets.map(refKey));
    const entries = this.evidence(request.projectId).filter(
      (e) =>
        sources.has(refKey(e.source)) &&
        e.text.trim() &&
        (!request.sourceIds?.length ||
          request.sourceIds.includes(e.source.assetId)) &&
        (request.fromUs === undefined || e.range.startUs >= request.fromUs) &&
        (request.toUs === undefined ||
          e.range.startUs + e.range.durationUs <= request.toUs),
    );
    const ids = [
      EMBEDDING_PROVIDER,
      ...(request.rerank ? [RERANK_PROVIDER] : []),
    ];
    for (const id of ids) this.providers.require(id);
    const bindings = await this.providers.freeze(ids);
    const frozen = {
      ...request,
      revision,
      entries,
      binding: bindings[EMBEDDING_PROVIDER],
      rerankerBinding: request.rerank ? bindings[RERANK_PROVIDER] : undefined,
    };
    return this.jobs.submit({
      requestInput: request,
      projectId: request.projectId,
      kind: "semantic-search",
      snapshot: frozen,
      nodes: [
        { key: "semantic-search", operation: "semantic-search", input: frozen },
      ],
      requestId: request.requestId,
    });
  }
  private async semanticNode(c: NodeContext) {
    const i = z
      .object({
        projectId: z.string(),
        query: z.string(),
        revision: ProjectRevision,
        entries: z.array(AnalysisEntry),
        binding: z.string(),
        rerankerBinding: z.string().optional(),
        limit: z.number().int().positive().max(50),
      })
      .parse(c.input);
    const inputs: z.infer<typeof EmbeddingInput>[] = [
      { role: "query", text: i.query },
      ...i.entries.map<z.infer<typeof EmbeddingInput>>((e) => ({
        role: "document",
        text: e.text.trim(),
      })),
    ];
    const Vector = z.object({
      vector: z.array(z.number().finite()).min(1),
      model: z.string(),
    });
    const keys = inputs.map((input) =>
      this.artifacts.key("embedding-text-v2", { input, binding: i.binding }),
    );
    const values = keys.map((key) => {
      const cached = this.artifacts.lookup(key);
      return cached ? this.store.jsonBlob(cached.digest, Vector) : undefined;
    });
    const missing = i.entries.length
      ? values.flatMap((v, index) => (v ? [] : [index]))
      : [];
    for (let offset = 0; offset < missing.length; offset += 128) {
      const batch = missing.slice(offset, offset + 128);
      c.event("provider-request", {
        provider: EMBEDDING_PROVIDER,
        count: batch.length,
      });
      const result = await this.providers.embed(
        batch.map((index) => inputs[index]),
        c.workDir,
        c.signal,
        i.binding,
      );
      c.signal.throwIfAborted();
      for (const [position, index] of batch.entries()) {
        const value = Vector.parse({
          vector: result.vectors[position],
          model: result.model,
        });
        values[index] = value;
        this.artifacts.record({
          operation: "embedding-text-v2",
          cacheKey: keys[index],
          generation: "default",
          digest: this.store.putJson(value),
          mime: "application/json",
          dependencies: [],
          provenance: {
            binding: i.binding,
            role: inputs[index].role,
            model: result.model,
          },
          verified: true,
        });
      }
    }
    const query = values[0]?.vector;
    if (i.entries.length && !query)
      throw new WeaverError("PROVIDER_FORMAT", "查询向量缺失");
    let candidates: z.infer<typeof Proposal>["candidates"] = i.entries
      .map((e, index) => {
        const vector = values[index + 1]?.vector;
        if (!query || !vector || vector.length !== query.length)
          throw new WeaverError("PROVIDER_FORMAT", "向量缺失或维度不一致");
        return {
          id: e.id,
          source: e.source,
          range: e.range,
          scores: {
            text: sequenceRatio(coreText(i.query), coreText(e.text)),
            visual: 0,
            semantic: vector.reduce((sum, x, j) => sum + x * query[j], 0),
          },
          evidence: [e.text, e.evidenceDigest, i.binding],
          method: "qwen3-embedding",
          limitations: [
            "检索依据是字幕和画面观察文本，候选需确认",
            ...(e.timingQuality === "estimated" ? ["证据时间为估算"] : []),
          ],
        };
      })
      .sort(
        (a, b) =>
          b.scores.semantic - a.scores.semantic || a.id.localeCompare(b.id),
      )
      .slice(0, 50);
    if (i.rerankerBinding && candidates.length) {
      const rerankerBinding = i.rerankerBinding;
      const documents = candidates.map((v) => v.evidence[0]);
      const key = this.artifacts.key("rerank-text-v1", {
        query: i.query,
        documents,
        binding: i.rerankerBinding,
      });
      const cached = this.artifacts.lookup(key);
      let result: z.infer<typeof RerankResult>;
      if (cached) result = this.store.jsonBlob(cached.digest, RerankResult);
      else {
        c.event("provider-request", {
          provider: RERANK_PROVIDER,
          count: documents.length,
        });
        result = await this.providers.rerank({
          query: i.query,
          documents,
          workDir: c.workDir,
          signal: c.signal,
          binding: i.rerankerBinding,
        });
        c.signal.throwIfAborted();
        this.artifacts.record({
          operation: "rerank-text-v1",
          cacheKey: key,
          generation: "default",
          digest: this.store.putJson(result),
          mime: "application/json",
          dependencies: [],
          provenance: { binding: i.rerankerBinding },
          verified: true,
        });
      }
      if (result.scores.length !== candidates.length)
        throw new WeaverError("PROVIDER_FORMAT", "重排响应数量错误");
      candidates = candidates
        .map((v, index) => ({
          ...v,
          scores: { ...v.scores, rerank: result.scores[index] },
          evidence: [...v.evidence, rerankerBinding],
          method: "qwen3-embedding-rerank",
        }))
        .sort(
          (a, b) =>
            (b.scores.rerank ?? 0) - (a.scores.rerank ?? 0) ||
            b.scores.semantic - a.scores.semantic,
        );
    }
    c.signal.throwIfAborted();
    const proposal = Proposal.parse({
      id: newId("proposal"),
      projectId: i.projectId,
      revision: i.revision.id,
      kind: "script-search",
      query: i.query,
      candidates: candidates.slice(0, i.limit),
      selections: [],
      warnings: candidates.length ? [] : ["无候选，请先分析素材或导入证据"],
    });
    return proposal;
  }
  async standalone(input: {
    kind: "asr" | "tts" | "voice-design";
    file?: string;
    text?: string;
    style?: string;
    voiceId?: string;
    voiceVersion?: string;
    locale?: string;
    requestId: string;
  }) {
    return this.store.owned("standalone-submit", async () => {
      const sourceDigest = input.file
        ? await this.store.importFile(input.file)
        : undefined;
      const requestInput = { ...input, file: undefined, sourceDigest };
      const prior = this.jobs.prior(input.kind, input.requestId, requestInput);
      if (prior) return prior;
      const voice = input.voiceId
        ? this.store.readJson(
            "SELECT json FROM library_versions WHERE item_id=? AND version=?",
            [input.voiceId, input.voiceVersion],
            z.object({
              payload: z.object({
                reference: Digest,
                referenceText: z.string(),
                style: z.string().optional(),
                provider: z.string(),
              }),
            }),
          )
        : undefined;
      const provider = input.kind === "asr" ? "qwen3-asr" : "modelbest-voxcpm2";
      const frozen = {
        ...input,
        file: undefined,
        sourceDigest,
        voice,
        binding: (await this.providers.freeze([provider]))[provider],
      };
      return this.jobs.submit({
        requestInput,
        kind: input.kind,
        snapshot: frozen,
        nodes: [
          {
            key: input.kind,
            operation: input.kind === "asr" ? "standalone-asr" : "voice-mint",
            input: frozen,
          },
        ],
        requestId: input.requestId,
      });
    });
  }
  private async standaloneAsr(c: NodeContext) {
    const i = z
        .object({
          sourceDigest: Digest,
          locale: z.string().optional(),
          binding: z.string(),
        })
        .parse(c.input),
      f = await probe(this.store.blobPath(i.sourceDigest), c.signal);
    if (!f.audio) throw new WeaverError("INVALID_MEDIA", "媒体没有音轨");
    const parts = [];
    for (const w of windowsFor(f.durationUs / 1e6))
      parts.push({
        ...w,
        result: await this.transcribe(
          {
            digest: i.sourceDigest,
            locale: i.locale || "",
            binding: i.binding,
            startUs: Math.round(w.start * 1e6),
            durationUs: Math.round((w.end - w.start) * 1e6),
            generation: "default",
          },
          c,
        ),
      });
    return AsrResult.parse(stitchAsrResults(parts));
  }
  private async mint(c: NodeContext) {
    const i = z
      .object({
        text: z.string().min(1),
        style: z.string().optional(),
        binding: z.string(),
        voice: z
          .object({
            payload: z.object({
              reference: Digest,
              referenceText: z.string(),
              style: z.string().optional(),
              provider: z.string(),
            }),
          })
          .optional(),
      })
      .parse(c.input);
    if (i.voice && i.voice.payload.provider !== "modelbest-voxcpm2")
      throw new WeaverError("CAPABILITY_UNAVAILABLE", "该音色协议未注册适配器");
    const dest = path.join(c.workDir, "preview.wav");
    await this.providers.tts({
      text: i.text,
      style: i.style ?? i.voice?.payload.style,
      reference: i.voice?.payload.reference,
      referenceText: i.voice?.payload.referenceText,
      binding: i.binding,
      dest,
      workDir: c.workDir,
      signal: c.signal,
    });
    const fact = await probe(dest, c.signal);
    if (!fact.audio) throw new WeaverError("PROVIDER_FORMAT", "语音响应无音轨");
    return {
      digest: await this.store.importFile(dest, "audio/wav"),
      text: i.text,
      style: i.style ?? i.voice?.payload.style ?? "",
      provider: "modelbest-voxcpm2",
      durationUs: fact.durationUs,
    };
  }
  capture(input: {
    projectId?: string;
    url: string;
    width: number;
    height: number;
    selector?: string;
    requestId: string;
  }) {
    const parsed = z
      .object({
        projectId: z.string().optional(),
        url: z.url(),
        width: z.number().int().positive().max(8192),
        height: z.number().int().positive().max(8192),
        selector: z.string().optional(),
        requestId: z.string(),
      })
      .parse(input);
    const url = new URL(parsed.url);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      [...url.searchParams.keys()].some((k) =>
        /token|api.?key|secret|password/i.test(k),
      )
    )
      throw new WeaverError("INVALID_INPUT", "截图 URL 不能含凭据");
    return this.jobs.submit({
      requestInput: input,
      projectId: input.projectId,
      kind: "capture",
      snapshot: parsed,
      nodes: [{ key: "capture", operation: "capture", input: parsed }],
      requestId: input.requestId,
    });
  }
  private async captureNode(c: NodeContext) {
    const input = z
        .object({
          url: z.string(),
          width: z.number(),
          height: z.number(),
          selector: z.string().optional(),
        })
        .parse(c.input),
      dest = path.join(c.workDir, "capture.png"),
      job = path.join(c.workDir, "capture-job.json");
    fs.writeFileSync(job, canonical({ ...input, dest }));
    await processRun(
      process.execPath,
      [
        fileURLToPath(new URL("../../scripts/capture.mjs", import.meta.url)),
        job,
      ],
      { signal: c.signal },
    );
    const fact = await probe(dest, c.signal);
    if (!fact.video) throw new WeaverError("INVALID_MEDIA", "截图无法解码");
    return {
      digest: await this.store.importFile(dest, "image/png"),
      mime: "image/png",
      width: fact.video.width,
      height: fact.video.height,
    };
  }
  importProposal(input: {
    projectId: string;
    expectedRevision: string;
    proposal: unknown;
    requestId: string;
  }) {
    const prior = this.jobs.prior(
      "import-proposal",
      input.requestId,
      input,
      input.projectId,
    );
    if (prior) return prior;
    const revision = this.projects.read(input.projectId),
      proposal = Proposal.parse(input.proposal);
    if (
      revision.id !== input.expectedRevision ||
      proposal.revision !== revision.id ||
      proposal.projectId !== input.projectId
    )
      throw new WeaverError(
        "REVISION_CONFLICT",
        "导入候选基于旧修订或其他项目",
        { current: revision },
      );
    return this.jobs.submit({
      requestInput: input,
      projectId: input.projectId,
      kind: "import-proposal",
      snapshot: { revision, proposal },
      nodes: [
        {
          key: "import-proposal",
          operation: "import-proposal",
          input: { revision, proposal },
        },
      ],
      requestId: input.requestId,
    });
  }
  private async importProposalNode(c: NodeContext) {
    const { revision, proposal } = z
        .object({ revision: ProjectRevision, proposal: Proposal })
        .parse(c.input),
      assets = this.projects.assetsFor(revision.document);
    for (const candidate of proposal.candidates) {
      const asset = assets.find((a) => refKey(a) === refKey(candidate.source));
      if (!asset || asset.kind !== "video")
        throw new WeaverError("INVALID_INPUT", "候选引用了项目外视频版本");
      const fact = await probe(this.store.blobPath(asset.digest), c.signal);
      if (
        candidate.range.startUs + candidate.range.durationUs >
        fact.durationUs
      )
        throw new WeaverError("SOURCE_RANGE", "候选超出真实源时长");
    }
    const imported = Proposal.parse({
      ...proposal,
      id: newId("proposal"),
      selections: [],
    });
    this.saveProposal(imported);
    return imported;
  }
  importEvidence(input: {
    projectId: string;
    expectedRevision: string;
    entries: unknown;
    requestId: string;
  }) {
    const prior = this.jobs.prior(
      "import-analysis",
      input.requestId,
      input,
      input.projectId,
    );
    if (prior) return prior;
    const revision = this.projects.read(input.projectId);
    if (revision.id !== input.expectedRevision)
      throw new WeaverError("REVISION_CONFLICT", "人工证据基于旧修订", {
        current: revision,
      });
    const entries = z
      .array(
        z.object({
          sourceId: z.string(),
          startUs: z.number().int().nonnegative(),
          durationUs: z.number().int().positive(),
          text: z.string().min(1),
        }),
      )
      .parse(input.entries);
    const assets = this.projects.assetsFor(revision.document);
    return this.jobs.submit({
      requestInput: input,
      projectId: input.projectId,
      kind: "import-analysis",
      snapshot: { revision, assets, entries },
      nodes: [
        {
          key: "import-analysis",
          operation: "import-analysis",
          input: { revision, assets, entries },
        },
      ],
      requestId: input.requestId,
    });
  }
  private async importAnalysisNode(c: NodeContext) {
    const i = z
        .object({
          revision: ProjectRevision,
          assets: z.array(MediaAssetVersion),
          entries: z.array(
            z.object({
              sourceId: z.string(),
              startUs: z.number().int().nonnegative(),
              durationUs: z.number().int().positive(),
              text: z.string().min(1),
            }),
          ),
        })
        .parse(c.input),
      out = [];
    for (const e of i.entries) {
      const a = i.assets.find((a) => a.assetId === e.sourceId);
      if (!a) throw new WeaverError("INVALID_INPUT", "人工证据源版本不存在");
      const f = await probe(this.store.blobPath(a.digest), c.signal);
      if (e.startUs + e.durationUs > f.durationUs)
        throw new WeaverError("SOURCE_RANGE", "人工证据超出真实源窗");
      const entry = AnalysisEntry.parse({
        id: `analysis-${digest({ projectId: i.revision.projectId, source: a.digest, text: e.text, startUs: e.startUs, durationUs: e.durationUs })}`,
        projectId: i.revision.projectId,
        source: { assetId: a.assetId, version: a.version },
        sourceDigest: a.digest,
        range: { startUs: e.startUs, durationUs: e.durationUs },
        kind: "manual",
        text: e.text,
        evidenceDigest: this.store.putJson({
          ...e,
          provenance: "user-imported-evidence",
        }),
        model: "manual",
        timingQuality: "manual",
      });
      this.index(entry);
      out.push(entry);
    }
    return { entries: out };
  }
}
