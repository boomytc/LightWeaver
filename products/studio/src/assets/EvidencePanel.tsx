import { useState } from "react";
import { Proposal, refKey, z, type MediaAssetVersion } from "@lightweaver/weaver/contracts";
import { mediaUrl, requestId } from "../api";
import { localeName } from "../domain/format";
import type { SourceWindow } from "../domain/time";
import { SourceWindowPlayer } from "../scenes/SourceWindowPlayer";
import { useSession } from "../session/context";
import { Field } from "../ui/Field";

function findMedia(assets: MediaAssetVersion[], key: string) {
  return assets.find((asset) => refKey(asset) === key);
}

export function EvidencePanel() {
  const session = useSession();
  const draft = session.draft;
  const ctx = session.ctx;
  const [analysisSource, setAnalysisSource] = useState("");
  const [vlmProvider, setVlmProvider] = useState(session.defaultVlm);
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState("text");
  const [ranges, setRanges] = useState<Record<string, SourceWindow>>({});
  const [allowReuse, setAllowReuse] = useState<Record<string, boolean>>({});
  if (!draft || !ctx) return null;
  const analysisAssets = ctx.assets.filter((asset) => asset.kind === "video" || asset.kind === "audio");
  const source = analysisSource || analysisAssets[0]?.assetId || "";
  const asrReady = session.providers.some((provider) => provider.capabilities.includes("asr") && provider.ready);
  const alignmentReady = session.providers.some(
    (provider) => provider.capabilities.includes("alignment") && provider.ready,
  );
  const manual = ctx.analysis.filter((entry) => entry.kind === "manual");
  const observed = ctx.analysis.filter((entry) => entry.kind !== "manual");
  const missing = !source ? "先选择源素材。" : !asrReady ? "缺少已就绪的 ASR。" : !alignmentReady ? "缺少已就绪的精确对齐，不会退回估算时间。" : "";

  return (
    <div className="min-w-0">
      <div className="actions">
        <Field label="分析源片或音轨">
          <select value={source} onChange={(event) => setAnalysisSource(event.target.value)}>
            <option value="">先选择源素材</option>
            {analysisAssets.map((asset) => (
              <option key={asset.version} value={asset.assetId}>
                {asset.name}
              </option>
            ))}
          </select>
        </Field>
        <button
          type="button"
          disabled={session.busy || !source || !asrReady}
          onClick={() =>
            void session.act(() =>
              session.submitJob(`/projects/${draft.id}/analyze`, {
                kinds: ["asr"],
                sourceId: source,
                align: false,
                locale: session.locale,
                requestId: requestId(),
              }),
            )
          }
        >
          仅转写
        </button>
        <button
          type="button"
          disabled={session.busy || !source || !asrReady || !alignmentReady}
          onClick={() =>
            void session.act(() =>
              session.submitJob(`/projects/${draft.id}/analyze`, {
                kinds: ["asr"],
                sourceId: source,
                align: true,
                locale: session.locale,
                requestId: requestId(),
              }),
            )
          }
        >
          转写并精确对齐
        </button>
        <Field label="画面观察模型">
          <select aria-label="画面观察模型" value={vlmProvider} onChange={(event) => setVlmProvider(event.target.value)}>
            {session.providers
              .filter((provider) => provider.capabilities.includes("describe"))
              .map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.model}
                  {provider.ready ? "" : " · 未配置"}
                </option>
              ))}
          </select>
        </Field>
        <button
          type="button"
          disabled={session.busy}
          onClick={() =>
            void session.act(() =>
              session.submitJob(`/projects/${draft.id}/analyze`, {
                kinds: ["describe"],
                ...(source ? { sourceId: source } : {}),
                vlmProvider,
                requestId: requestId(),
              }),
            )
          }
        >
          观察画面
        </button>
      </div>
      {missing && (
        <p className="hint">
          {missing}{" "}
          <button type="button" onClick={() => void session.navigate("settings", "", "models")}>
            打开模型设置
          </button>
          {!alignmentReady && source && asrReady && (
            <button type="button" onClick={() => void session.navigate("settings", "", "runtime")}>
              查看运行时
            </button>
          )}
        </p>
      )}
      <p className="hint">观察和候选不会自动改写场景或字幕。采用是单独的动作。</p>
      <h3>人工证据</h3>
      {manual.length === 0 && <p className="hint">没有人工证据。</p>}
      {manual.map((entry) => (
        <article key={entry.id}>
          <small>
            {entry.kind} · {entry.state} · {entry.timingQuality}
          </small>
          <p>{entry.text}</p>
        </article>
      ))}
      <h3>观察</h3>
      {observed.map((entry) => (
        <article key={entry.id}>
          <small>
            {entry.kind} · {(entry.range.startUs / 1e6).toFixed(2)}–
            {((entry.range.startUs + entry.range.durationUs) / 1e6).toFixed(2)} 秒 · {entry.state} · {entry.timingQuality}
          </small>
          <p>{entry.text}</p>
          {entry.sourceText && entry.sourceText !== entry.text && (
            <div className="source-copy">
              <small>原始转写</small>
              <p>{entry.sourceText}</p>
            </div>
          )}
          {entry.kind === "asr" &&
            entry.state === "current" &&
            entry.timingQuality === "aligned" &&
            (entry.locale === undefined || entry.locale === session.locale) && (
              <button
                type="button"
                disabled={session.busy || session.dirty}
                onClick={() => void session.adoptAnalysisCaptions({ sourceId: entry.source.assetId, locale: session.locale })}
              >
                采用为{localeName(session.locale)}字幕
              </button>
            )}
        </article>
      ))}
      <h3>建议</h3>
      <div className="actions">
        <input
          data-lw-find=""
          aria-label="候选查询"
          placeholder="需要的画面或情节"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <select aria-label="检索方式" value={mode} onChange={(event) => setMode(event.target.value)}>
          <option value="text">文本检索</option>
          <option value="semantic">语义检索（字幕与观察）</option>
          <option value="visual">画面检索</option>
        </select>
        <button type="button" onClick={() => void session.searchCandidates(query, mode)}>
          查询候选
        </button>
      </div>
      <Field label="参考成片反向匹配">
        <select
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
        </select>
      </Field>
      {ctx.proposals.map((proposal) => {
        const stale = proposal.revision !== session.base;
        const suggested = proposal.candidates.filter((candidate) => !proposal.selections.includes(candidate.id));
        const adopted = proposal.candidates.filter((candidate) => proposal.selections.includes(candidate.id));
        return (
          <details key={proposal.id} open>
            <summary>
              {proposal.query} · 建议 {suggested.length} · 已采用 {adopted.length} {proposal.warnings.join("；")}
              {stale && " · 基于旧修订，仅可查看"}
            </summary>
            {stale && (
              <p className="hint">
                此候选基于修订 {proposal.revision.slice(0, 16)}，当前修订是 {session.base.slice(0, 16)}。重新查询后才能应用。
              </p>
            )}
            <h4>建议</h4>
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
            <h4>已采用</h4>
            {adopted.length === 0 && <p className="hint">这条建议里还没有写入项目的候选。</p>}
            {adopted.map((candidate) => (
              <p key={candidate.id}>{candidate.evidence[0] || candidate.id}</p>
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
    <article>
      <p>{candidate.evidence[0]}</p>
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
        允许与已有场景复用重叠源窗
      </label>
      <button
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
        应用此源窗
      </button>
    </article>
  );
}
