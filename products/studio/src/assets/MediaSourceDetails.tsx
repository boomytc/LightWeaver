import { MediaAssetVersion, refKey, z } from "@lightweaver/weaver/contracts";

const roles = { picture: "画面", audio: "声音", captions: "字幕参考", reference: "创作参考" };

export function MediaSourceDetails({ asset, assets }: {
  asset: z.infer<typeof MediaAssetVersion> | undefined;
  assets: z.infer<typeof MediaAssetVersion>[];
}) {
  const provenance = asset?.provenance;
  if (!provenance) return null;
  return (
    <section className="subtle-card flex flex-col gap-2 p-3 text-xs" aria-label="素材来源">
      <b>素材来源</b>
      <p className="m-0">{provenance.description}</p>
      <ul className="m-0 list-none space-y-1 p-0">
        {provenance.inputs.map((input, index) => {
          const source = assets.find((item) => refKey(item) === refKey(input.source));
          return <li key={index}>{roles[input.role]} · {source?.name || input.source.assetId}
            <span className="numeric"> · {input.source.version.slice(0, 8)}</span>
            {input.range && <span className="numeric"> · {(input.range.startUs / 1e6).toFixed(2)}–{((input.range.startUs + input.range.durationUs) / 1e6).toFixed(2)} 秒</span>}
          </li>;
        })}
      </ul>
      {provenance.captions === "embedded" && <p className="hint m-0">此素材的字幕已嵌入画面，无法在字幕页逐句修改。字幕页仅编辑独立字幕轨。</p>}
    </section>
  );
}
