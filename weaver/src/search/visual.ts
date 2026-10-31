import fs from "node:fs";
import path from "node:path";
import {
  z,
  AssetId,
  Digest,
  Id,
  MediaAssetVersion,
  MediaRef,
  Microseconds,
  ProjectRevision,
  Proposal,
  SourceRange,
} from "../contracts/index.ts";
import { WeaverError } from "../contracts/errors.ts";
import { Store, digest, newId, canonical } from "../store/index.ts";
import { Projects } from "../project/service.ts";
import { Jobs, type NodeContext } from "../jobs/index.ts";
import { Artifacts } from "../artifacts/index.ts";
import { probe } from "../media/probe.ts";
import { processRun } from "../media/process.ts";
import { toolVersion } from "../adapters/toolchain.ts";
import {
  VISUAL_PROVIDER,
  VisualModels,
  VisualResult,
} from "../adapters/visual-models.ts";

export const VISUAL_SEARCH_WINDOW_US = 5_000_000;
const VISUAL_METHOD = "embeddinggemma-visual";
const QUERY_PREFIX = "task: search result | query: ";

const VisualSearchRequest = z
  .strictObject({
    projectId: z.string().min(1),
    query: z.string().trim().min(1),
    requestId: Id,
    sourceIds: z.array(AssetId).optional(),
    fromUs: z.number().int().nonnegative().safe().optional(),
    toUs: z.number().int().positive().safe().optional(),
    limit: z.number().int().min(1).max(50).default(20),
  })
  .refine(
    (value) =>
      value.fromUs === undefined ||
      value.toUs === undefined ||
      value.toUs > value.fromUs,
    "视觉检索结束时间必须晚于开始时间",
  );

const SampleWindow = z.strictObject({
  startUs: Microseconds,
  durationUs: Microseconds.refine((value) => value > 0),
  sampleUs: Microseconds,
});

const FrozenSource = z.strictObject({
  asset: MediaAssetVersion,
  windows: z.array(SampleWindow).min(1),
});

const FrozenVisualSearch = z.strictObject({
  request: VisualSearchRequest,
  revision: ProjectRevision,
  sources: z.array(FrozenSource).min(1),
  binding: z.string().min(1),
  ffmpeg: z.string().min(1),
});

const StoredVector = z.strictObject({
  vector: z.array(z.number().finite()).min(1),
  model: z.string().min(1),
});

type Window = z.infer<typeof SampleWindow>;
type Source = z.infer<typeof FrozenSource>;
type Stored = z.infer<typeof StoredVector>;

export type VisualSearchInput = {
  projectId: string;
  query: string;
  requestId: string;
  sourceIds?: string[];
  fromUs?: number;
  toUs?: number;
  limit?: number;
};

type PendingVector =
  | {
      key: z.infer<typeof Digest>;
      input: { kind: "text"; text: string };
      operation: "embeddinggemma-visual-query-v1";
      role: "query";
    }
  | {
      key: z.infer<typeof Digest>;
      input: { kind: "image"; file: string };
      operation: "embeddinggemma-visual-image-v1";
      sourceDigest: z.infer<typeof Digest>;
      sampleUs: z.infer<typeof Microseconds>;
      role: "image";
    };

type VisualSample = {
  source: Source;
  window: Window;
  key: z.infer<typeof Digest>;
};

function sampleWindows(
  durationUs: z.infer<typeof Microseconds>,
  fromUs?: number,
  toUs?: number,
): Window[] {
  const start = Math.min(durationUs, Math.max(0, fromUs ?? 0));
  const end = Math.min(durationUs, Math.max(start, toUs ?? durationUs));
  const windows: Window[] = [];
  for (let cursor = start; cursor < end; cursor += VISUAL_SEARCH_WINDOW_US) {
    const duration = Math.min(VISUAL_SEARCH_WINDOW_US, end - cursor);
    if (duration <= 0) break;
    windows.push(SampleWindow.parse({
      startUs: cursor,
      durationUs: duration,
      sampleUs: cursor + Math.floor(duration / 2),
    }));
  }
  return windows;
}

function cosine(left: number[], right: number[]): number {
  if (left.length !== right.length)
    throw new WeaverError("PROVIDER_FORMAT", "视觉向量维度不一致");
  return Math.max(
    -1,
    Math.min(
      1,
      left.reduce((sum, value, index) => sum + value * right[index], 0),
    ),
  );
}

export class VisualSearch {
  readonly artifacts: Artifacts;

  constructor(
    private readonly store: Store,
    private readonly projects: Projects,
    private readonly jobs: Jobs,
    private readonly models: VisualModels,
  ) {
    this.artifacts = new Artifacts(store);
    jobs.register(
      "visual-search",
      (context) => this.run(context),
      (_context, result) => {
        this.publish(Proposal.parse(result));
      },
    );
  }

  async submit(input: VisualSearchInput) {
    const request = VisualSearchRequest.parse(input);
    const prior = this.jobs.prior(
      "visual-search",
      request.requestId,
      request,
      request.projectId,
    );
    if (prior) return prior;

    const revision = this.projects.read(request.projectId);
    const assets = this.projects.assetsFor(revision.document);
    if (request.sourceIds?.length) {
      const requested = new Set<string>(request.sourceIds);
      const found = new Set(assets.map((asset) => asset.assetId));
      const missing = request.sourceIds.filter((id) => !found.has(id));
      if (missing.length)
        throw new WeaverError("INVALID_INPUT", "视觉检索源素材不存在", {
          sourceIds: missing,
        });
      const unsupported = assets.filter(
        (asset) => requested.has(asset.assetId) && asset.kind !== "video",
      );
      if (unsupported.length)
        throw new WeaverError(
          "INVALID_INPUT",
          "视觉检索当前只支持视频源；静帧可送入视觉模型，但候选暂不能生成 clip",
          { assets: unsupported },
        );
    }
    const selected = assets.filter(
      (asset) =>
        asset.kind === "video" &&
        (!request.sourceIds?.length ||
          request.sourceIds.includes(asset.assetId)),
    );
    if (!selected.length)
      throw new WeaverError(
        "INVALID_INPUT",
        "视觉检索需要项目中的视频素材",
      );

    const sources: Source[] = [];
    for (const asset of selected) {
      let fact;
      try {
        fact = await probe(this.store.blobPath(asset.digest));
      } catch (error) {
        throw new WeaverError(
          "MEDIA_PROBE_FAILED",
          "读取视觉检索源媒体失败",
          {
            asset: { assetId: asset.assetId, version: asset.version },
            diagnostic:
              error instanceof WeaverError ? error.details : String(error),
          },
        );
      }
      if (!fact.video)
        throw new WeaverError("INVALID_MEDIA", "视觉检索源没有视频轨道", {
          asset: { assetId: asset.assetId, version: asset.version },
        });
      const windows = sampleWindows(
        fact.durationUs,
        request.fromUs,
        request.toUs,
      );
      if (windows.length) sources.push({ asset, windows });
    }
    if (!sources.length)
      throw new WeaverError("SOURCE_RANGE", "视觉检索时间范围没有可用视频窗");

    const binding = await this.models.freeze();
    const frozen = FrozenVisualSearch.parse({
      request,
      revision,
      sources,
      binding,
      ffmpeg: await toolVersion("ffmpeg"),
    });
    return this.jobs.submit({
      requestInput: request,
      projectId: request.projectId,
      kind: "visual-search",
      snapshot: frozen,
      nodes: [
        {
          key: "visual-search",
          operation: "visual-search",
          input: frozen,
        },
      ],
      requestId: request.requestId,
    });
  }

  private async run(context: NodeContext) {
    const input = FrozenVisualSearch.parse(context.input);
    if (input.ffmpeg !== await toolVersion("ffmpeg"))
      throw new WeaverError("PROVIDER_CHANGED", "抽帧工具已改变，请重新提交视觉检索");
    const queryText = `${QUERY_PREFIX}${input.request.query}`;
    const queryKey = this.artifacts.key("embeddinggemma-visual-query-v1", {
      role: "query",
      text: queryText,
      binding: input.binding,
    });
    const samples: VisualSample[] = input.sources.flatMap((source) =>
      source.windows.map((window) => ({
        source,
        window,
        key: this.imageKey(source, window, input.binding, input.ffmpeg),
      })),
    );
    const values = new Map<z.infer<typeof Digest>, Stored>();
    const query = this.cached(queryKey);
    if (query) values.set(queryKey, query);

    const pending: PendingVector[] = query
      ? []
      : [
          {
            key: queryKey,
            input: { kind: "text", text: queryText },
            operation: "embeddinggemma-visual-query-v1",
            role: "query",
          },
        ];

    for (const sample of samples) {
      const cached = this.cached(sample.key);
      if (cached) {
        values.set(sample.key, cached);
        continue;
      }
      const file = await this.extractFrame(
        sample.source.asset.digest,
        sample.window.sampleUs,
        context,
      );
      pending.push({
        key: sample.key,
        input: { kind: "image", file },
        operation: "embeddinggemma-visual-image-v1",
        sourceDigest: sample.source.asset.digest,
        sampleUs: sample.window.sampleUs,
        role: "image",
      });
    }

    if (pending.length) {
      context.event("provider-request", {
        provider: VISUAL_PROVIDER,
        count: pending.length,
        roles: [...new Set(pending.map((item) => item.role))],
        binding: input.binding,
      });
      const result = VisualResult.parse(
        await this.models.embed({
          inputs: pending.map((item) => item.input),
          workDir: context.workDir,
          signal: context.signal,
          binding: input.binding,
        }),
      );
      context.signal.throwIfAborted();
      for (const [index, item] of pending.entries()) {
        const value = StoredVector.parse({
          vector: result.vectors[index],
          model: result.model,
        });
        values.set(item.key, value);
        this.artifacts.record({
          operation: item.operation,
          cacheKey: item.key,
          generation: "default",
          digest: this.store.putJson(value),
          mime: "application/json",
          dependencies:
            item.role === "image" ? [item.sourceDigest] : [],
          provenance: {
            binding: input.binding,
            role: item.role,
            sampleUs: item.role === "image" ? item.sampleUs : undefined,
            model: result.model,
          },
          verified: true,
        });
      }
    }

    const queryVector = values.get(queryKey)?.vector;
    if (!queryVector)
      throw new WeaverError("PROVIDER_FORMAT", "视觉查询向量缺失");
    const candidates: z.infer<typeof Proposal>["candidates"] = [];
    for (const sample of samples) {
      const imageVector = values.get(sample.key)?.vector;
      if (!imageVector)
        throw new WeaverError("PROVIDER_FORMAT", "视觉候选向量缺失");
      const range = SourceRange.parse({
        startUs: sample.window.startUs,
        durationUs: sample.window.durationUs,
      });
      const sourceRef = MediaRef.parse({
        assetId: sample.source.asset.assetId,
        version: sample.source.asset.version,
      });
      candidates.push({
        id: `candidate-${digest({ source: sourceRef, range, binding: input.binding })}`,
        source: sourceRef,
        range,
        scores: {
          text: 0,
          visual: cosine(queryVector, imageVector),
          semantic: 0,
        },
        evidence: [
          queryText,
          `${sample.source.asset.assetId}@${sample.source.asset.version}`,
          `sampleUs=${sample.window.sampleUs}`,
          input.binding,
        ],
        method: VISUAL_METHOD,
        limitations: [
          "当前候选只支持视频源，应用后生成 clip",
          `候选基于每个 ${VISUAL_SEARCH_WINDOW_US / 1_000_000} 秒窗口的中点静帧，不代表整段画面`,
          "视觉相似度不保证剧本语义或内容正确",
        ],
      });
    }
    candidates.sort(
      (left, right) =>
        right.scores.visual - left.scores.visual ||
        left.id.localeCompare(right.id),
    );
    return Proposal.parse({
      id: newId("proposal"),
      projectId: input.revision.projectId,
      revision: input.revision.id,
      kind: "script-search",
      query: input.request.query,
      candidates: candidates.slice(0, input.request.limit),
      selections: [],
      warnings: candidates.length ? [] : ["视觉检索没有生成候选"],
    });
  }

  private cached(key: z.infer<typeof Digest>): Stored | undefined {
    const artifact = this.artifacts.lookup(key);
    return artifact
      ? this.store.jsonBlob(artifact.digest, StoredVector)
      : undefined;
  }

  private imageKey(
    source: Source,
    window: Window,
    binding: string,
    ffmpeg: string,
  ): z.infer<typeof Digest> {
    return this.artifacts.key("embeddinggemma-visual-image-v1", {
      sourceDigest: source.asset.digest,
      sampleUs: window.sampleUs,
      binding,
      ffmpeg,
    });
  }

  private async extractFrame(
    sourceDigest: z.infer<typeof Digest>,
    sampleUs: z.infer<typeof Microseconds>,
    context: NodeContext,
  ): Promise<string> {
    const file = path.join(
      context.workDir,
      `visual-${sourceDigest}-${sampleUs}.jpg`,
    );
    try {
      await processRun(
        "ffmpeg",
        [
          "-v",
          "error",
          "-nostdin",
          "-y",
          "-ss",
          (sampleUs / 1_000_000).toFixed(6),
          "-i",
          this.store.blobPath(sourceDigest),
          "-frames:v",
          "1",
          "-an",
          "-sn",
          "-dn",
          "-q:v",
          "2",
          file,
        ],
        { signal: context.signal },
      );
    } catch (error) {
      if (error instanceof WeaverError && error.code === "CANCELLED")
        throw error;
      throw new WeaverError(
        "MEDIA_PROCESS_FAILED",
        "抽取视觉检索中点帧失败",
        {
          sourceDigest,
          sampleUs,
          diagnostic:
            error instanceof WeaverError ? error.details : String(error),
        },
      );
    }
    let stat: fs.Stats;
    try {
      stat = fs.statSync(file);
    } catch {
      throw new WeaverError("MEDIA_PROCESS_FAILED", "ffmpeg 没有生成视觉检索帧", {
        sourceDigest,
        sampleUs,
      });
    }
    if (!stat.isFile() || stat.size <= 0)
      throw new WeaverError("MEDIA_PROCESS_FAILED", "视觉检索帧为空", {
        sourceDigest,
        sampleUs,
      });
    return file;
  }

  private publish(proposal: z.infer<typeof Proposal>): void {
    this.store.db
      .prepare("INSERT INTO proposals VALUES(?,?,?)")
      .run(proposal.id, proposal.projectId, canonical(proposal));
    this.store.pin(`proposal:${proposal.id}`, proposal);
  }
}
