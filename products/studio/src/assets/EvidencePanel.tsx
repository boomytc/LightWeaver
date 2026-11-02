import { useState } from "react";
import { Proposal, refKey, z, type MediaAssetVersion } from "@lightweaver/weaver/contracts";
import { mediaUrl, requestId } from "../api";
import { labels, localeName } from "../domain/format";
import type { SourceWindow } from "../domain/time";
import { SourceWindowPlayer } from "../scenes/SourceWindowPlayer";
import { useSession } from "../session/context";
import { Field } from "../ui/Field";
import { Button } from "../ui/Button";
import { Badge } from "../ui/Badge";
import { NativeSelect } from "../ui/NativeSelect";

type AnalysisKind = "transcribe" | "align" | "describe";

function findMedia(assets: MediaAssetVersion[], key: string) {
  return assets.find((asset) => refKey(asset) === key);
}

export function EvidencePanel() {
  const session = useSession();
  const draft = session.draft;
  const ctx = session.ctx;
  const [analysisSource, setAnalysisSource] = useState("");
  const [analysisKind, setAnalysisKind] = useState<AnalysisKind>("transcribe");
  const [vlmProvider, setVlmProvider] = useState(session.defaultVlm);
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState("text");
  const [ranges, setRanges] = useState<Record<string, SourceWindow>>({});
  const [allowReuse, setAllowReuse] = useState<Record<string, boolean>>({});
  if (!draft || !ctx) return null;
  const analysisAssets = ctx.assets.filter((asset) => asset.kind === "video" || asset.kind === "audio");
  const availableSources = analysisKind === "describe" ? analysisAssets.filter((asset) => asset.kind === "video") : analysisAssets;
  const source = availableSources.some((asset) => asset.assetId === analysisSource) ? analysisSource : availableSources[0]?.assetId || "";
  const asrReady = session.providers.some((provider) => provider.capabilities.includes("asr") && provider.ready);
  const alignmentReady = session.providers.some(
    (provider) => provider.capabilities.includes("alignment") && provider.ready,
  );
  const describeProviders = session.providers.filter((provider) => provider.capabilities.includes("describe"));
  const describeReady = describeProviders.some((provider) => provider.id === vlmProvider && provider.ready);
  const manual = ctx.analysis.filter((entry) => entry.kind === "manual");
  const observed = ctx.analysis.filter((entry) => entry.kind !== "manual");
  const missing = !source
      ? analysisKind === "describe" ? "请先导入视频素材。" : "请先导入视频或音频素材。"
      : analysisKind === "describe" ? describeReady ? "" : "请先配置画面观察模型。"
      : !asrReady
        ? "缺少已就绪的 ASR。"
        : analysisKind === "align" && !alignmentReady
          ? "缺少已就绪的精确对齐，不会退回估算时间。"
          : "";
  const canStart = !session.busy && !missing;
  const captionSources = new Map<string, string>();
  for (const entry of observed)
    if (entry.kind === "asr" && entry.state === "current" && entry.timingQuality === "aligned" &&
      (entry.locale === undefined || entry.locale === session.locale) && !captionSources.has(refKey(entry.source)))
      captionSources.set(refKey(entry.source), entry.id);
  const startAnalysis = () => {
    if (!canStart) return;
    if (analysisKind === "describe") {
      void session.act(() =>
        session.submitJob(`/projects/${draft.id}/analyze`, {
          kinds: ["describe"],
          ...(source ? { sourceId: source } : {}),
          vlmProvider,
          requestId: requestId(),
        }),
      );
      return;
    }
    void session.act(() =>
      session.submitJob(`/projects/${draft.id}/analyze`, {
        kinds: ["asr"],
        sourceId: source,
        align: analysisKind === "align",
        locale: session.locale,
        requestId: requestId(),
      }),
    );
  };

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="section-title flex-wrap">
        <h3 className="m-0 text-[13px] font-semibold text-ink">素材分析</h3>
        <Badge tone={!missing ? "ok" : "warn"} dot>{!source ? "需要素材" : missing ? "需要模型配置" : "可以分析"}</Badge>
      </div>
      <div className="subtle-card flex flex-col gap-3 p-3">
        <Field label="分析源片或音轨">
          <NativeSelect value={source} onChange={(event) => setAnalysisSource(event.target.value)}>
            <option value="">先选择源素材</option>
            {availableSources.map((asset) => (
              <option key={asset.version} value={asset.assetId}>
                {asset.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="分析类型">
          <NativeSelect
            aria-label="分析类型"
            value={analysisKind}
            onChange={(event) => setAnalysisKind(event.target.value as AnalysisKind)}
          >
            <option value="transcribe" disabled={!asrReady}>仅转写文字</option>
            <option value="align" disabled={!asrReady || !alignmentReady}>转写并精确对齐</option>
            <option value="describe">观察画面</option>
          </NativeSelect>
        </Field>
        {analysisKind === "describe" && (
          <Field label="画面观察模型">
            <NativeSelect aria-label="画面观察模型" value={vlmProvider} onChange={(event) => setVlmProvider(event.target.value)}>
              {describeProviders.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.model}
                  {provider.ready ? "" : " · 未配置"}
                </option>
              ))}
            </NativeSelect>
          </Field>
        )}
        <div className="actions">
          <Button
            size="sm"
            variant="primary"
            type="button"
            disabled={!canStart}
            onClick={startAnalysis}
          >
            {session.busy ? "处理中…" : "开始分析"}
          </Button>
        </div>
        {missing && (
          <div className="flex flex-col gap-2">
            <p className="hint m-0 text-xs">{missing}</p>
            {source && <div className="actions">
              <Button size="sm" type="button" onClick={() => void session.navigate("settings", "", "models")}>
                打开模型设置
              </Button>
            </div>}
          </div>
        )}
      </div>
      <p className="hint m-0 text-xs">观察和候选不会自动改写场景或字幕。采用是单独的动作。</p>
      <div className="flex flex-col gap-1">
        <h3 className="m-0 text-[13px] font-semibold text-ink">人工证据</h3>
        {manual.length === 0 && <p className="hint m-0 text-xs">没有人工证据。</p>}
        {manual.length > 0 && (
          <ul className="m-0 flex list-none flex-col p-0">
            {manual.map((entry) => (
              <li className="border-b border-line py-2 last:border-0" key={entry.id}>
                <small className="numeric">
                  {entry.kind} · {entry.state} · {entry.timingQuality}
                </small>
                <p className="m-0 mt-1 text-xs">{entry.text}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="flex flex-col gap-1">
        <h3 className="m-0 text-[13px] font-semibold text-ink">分析结果</h3>
        {observed.length === 0 && <p className="hint m-0 text-xs">尚无观察记录。</p>}
        {observed.length > 0 && (
          <ul className="m-0 flex list-none flex-col p-0">
            {observed.map((entry) => (
              <li className="flex flex-col gap-2 border-b border-line py-2 last:border-0" key={entry.id}>
                <small className="numeric">
                  {labels[entry.kind] || entry.kind} · {(entry.range.startUs / 1e6).toFixed(2)}–
                  {((entry.range.startUs + entry.range.durationUs) / 1e6).toFixed(2)} 秒 · {labels[entry.state] || entry.state} · {labels[entry.timingQuality] || entry.timingQuality}
                </small>
                <p className="m-0 text-xs">{entry.text}</p>
                {entry.sourceText && entry.sourceText !== entry.text && (
                  <div className="source-copy">
                    <small>原始转写</small>
                    <p className="m-0 mt-1 text-xs">{entry.sourceText}</p>
                  </div>
                )}
                {captionSources.get(refKey(entry.source)) === entry.id && (
                    <div>
                      {entry.captionLocales.includes(session.locale) ? <Badge tone="ok" dot>字幕已生成</Badge> : <Button
                        size="sm"
                        type="button"
                        disabled={session.busy || session.dirty}
                        onClick={() => void session.adoptAnalysisCaptions({ sourceId: entry.source.assetId, locale: session.locale })}
                      >
                        生成{localeName(session.locale)}字幕
                      </Button>}
                    </div>
                  )}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <h3 className="m-0 text-[13px] font-semibold text-ink">建议</h3>
        <div className="flex flex-col gap-2 border-t border-line pt-3">
          <input
            data-lw-find=""
            aria-label="候选查询"
            placeholder="需要的画面或情节"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <NativeSelect aria-label="检索方式" value={mode} onChange={(event) => setMode(event.target.value)}>
            <option value="text">文本检索</option>
            <option value="semantic">语义检索（字幕与观察）</option>
            <option value="visual">画面检索</option>
          </NativeSelect>
          <div>
            <Button size="sm" type="button" disabled={!query.trim() || session.busy || session.dirty} onClick={() => void session.searchCandidates(query, mode)}>
              查询候选
            </Button>
          </div>
        </div>
      </div>
      {ctx.assets.filter((asset) => asset.kind === "video").length >= 2 && <Field label="参考成片反向匹配">
        <NativeSelect
          defaultValue=""
          onChange={(event) => {
            if (!event.target.value) return;
            const editedId = event.target.value;
            event.target.value = "";
            void session.act(() => session.submitJob(`/projects/${draft.id}/match`, { editedId, requestId: requestId() }));
          }}
        >
          <option value="">选择参考成片，其他视频作为源片</option>
          {ctx.assets
            .filter((asset) => asset.kind === "video")
            .map((asset) => (
              <option key={asset.version} value={asset.assetId}>
                {asset.name}
              </option>
            ))}
        </NativeSelect>
      </Field>}
      {ctx.proposals.map((proposal) => {
        const stale = proposal.revision !== session.base;
        const suggested = proposal.candidates.filter((candidate) => !proposal.selections.includes(candidate.id));
        const adopted = proposal.candidates.filter((candidate) => proposal.selections.includes(candidate.id));
        return (
          <details key={proposal.id} className="border-t border-line pt-3" open>
            <summary className="text-xs font-medium">
              {proposal.query} · 建议 {suggested.length} · 已采用 {adopted.length} {proposal.warnings.join("；")}
              {stale && " · 基于旧修订，仅可查看"}
            </summary>
            {stale && (
              <p className="hint mt-2 mb-0 text-xs">
                项目已更新，请重新检索后加入场景。
              </p>
            )}
            <h4 className="mt-3 mb-1 text-xs font-semibold text-ink">建议</h4>
            {suggested.map((candidate) => (
              <Candidate
                key={candidate.id}
                proposalId={proposal.id}
                candidate={candidate}
                stale={stale}
                ranges={ranges}
                allowReuse={allowReuse}
                setRanges={setRanges}
                setAllowReuse={setAllowReuse}
              />
            ))}
            <h4 className="mt-3 mb-1 text-xs font-semibold text-ink">已采用</h4>
            {adopted.length === 0 && <p className="hint m-0 text-xs">这条建议里还没有写入项目的候选。</p>}
            {adopted.map((candidate) => (
              <p className="m-0 border-b border-line py-1.5 text-xs last:border-0" key={candidate.id}>{candidate.evidence[0] || candidate.id}</p>
            ))}
          </details>
        );
      })}
    </div>
  );
}

function Candidate({
  proposalId,
  candidate,
  stale,
  ranges,
  allowReuse,
  setRanges,
  setAllowReuse,
}: {
  proposalId: string;
  candidate: z.infer<typeof Proposal>["candidates"][number];
  stale: boolean;
  ranges: Record<string, SourceWindow>;
  allowReuse: Record<string, boolean>;
  setRanges: (update: (current: Record<string, SourceWindow>) => Record<string, SourceWindow>) => void;
  setAllowReuse: (update: (current: Record<string, boolean>) => Record<string, boolean>) => void;
}) {
  const session = useSession();
  const ctx = session.ctx;
  const draft = session.draft;
  if (!ctx || !draft) return null;
  const rangeKey = `${proposalId}:${candidate.id}`;
  const range = ranges[rangeKey] || candidate.range;
  const asset = findMedia(ctx.assets, refKey(candidate.source));
  return (
    <article className="flex flex-col gap-2 border-b border-line py-3 last:border-0">
      <p className="m-0">{candidate.evidence[0]}</p>
      <small>
        {(candidate.range.startUs / 1e6).toFixed(2)} 秒起 · 文本 {candidate.scores.text.toFixed(2)} / 画面{" "}
        {candidate.scores.visual.toFixed(2)} / 语义 {candidate.scores.semantic.toFixed(2)}
        {candidate.scores.rerank !== undefined && ` / 重排 ${candidate.scores.rerank.toFixed(2)}`}
      </small>
      <SourceWindowPlayer
        sourceUrl={asset ? mediaUrl(asset.digest) : undefined}
        sourceKey={refKey(candidate.source)}
        range={range}
        bounds={candidate.range}
        label={`候选 ${candidate.id}`}
        editable
        onRangeChange={(next) => setRanges((current) => ({ ...current, [rangeKey]: next }))}
      />
      <p>{candidate.limitations.join("；")}</p>
      <label className="check">
        <input
          type="checkbox"
          checked={!!allowReuse[rangeKey]}
          onChange={(event) => setAllowReuse((current) => ({ ...current, [rangeKey]: event.target.checked }))}
        />
        允许重复使用已选片段
      </label>
      <div>
        <Button
          size="sm"
          type="button"
          disabled={session.busy || session.dirty || stale}
          onClick={() =>
            void session.applyProposal({
              proposalId,
              selection: [candidate.id],
              ranges: { [candidate.id]: range },
              allowReuse: !!allowReuse[rangeKey],
            })
          }
        >
          加入场景
        </Button>
      </div>
    </article>
  );
}
