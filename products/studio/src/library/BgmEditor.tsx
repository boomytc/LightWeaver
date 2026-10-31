import { MediaAssetVersion, ProjectDocument, refKey, z } from "@lightweaver/weaver/contracts";
import { Field } from "../ui/Field";
import { AudioIcon } from "../ui/Icons";

export function BgmEditor({ draft, assets, edit }: { draft: ProjectDocument; assets: z.infer<typeof MediaAssetVersion>[]; edit: (project: ProjectDocument) => void }) {
  const bgm = draft.bgm;
  const update = (raw: unknown) => {
    const parsed = ProjectDocument.shape.bgm.safeParse(raw);
    if (parsed.success) edit({ ...draft, bgm: parsed.data });
  };
  return (
    <section className="panel-card p-5">
      <div className="section-title mb-5">
        <div><span className="dropzone-icon size-9"><AudioIcon /></span><div><h2 className="m-0">背景音乐混音</h2><small>裁剪、增益与旁白驱动压低</small></div></div>
      </div>
      <Field label="音频源">
        <select value={bgm ? refKey(bgm.source) : ""} onChange={(event) => {
          const asset = assets.find((item) => refKey(item) === event.target.value);
          update(asset ? { source: { assetId: asset.assetId, version: asset.version }, range: { startUs: 0, durationUs: 1000000 }, loop: true, gainDb: -18, fadeInFrames: 10, fadeOutFrames: 15, ducking: true } : undefined);
        }}>
          <option value="">不使用背景音乐</option>
          {assets.filter((asset) => asset.kind === "audio").map((asset) => <option key={asset.version} value={refKey(asset)}>{asset.name}</option>)}
        </select>
      </Field>
      {bgm && (
        <div className="mt-5 flex flex-col gap-5">
          <div className="form-grid md:grid-cols-3">
            {([["startUs", "音乐入点（秒）"], ["durationUs", "音乐裁剪时长（秒）"]] as const).map(([key, label]) => (
              <Field key={key} label={label}><input className="numeric" type="number" min="0" step="0.1" value={bgm.range[key] / 1e6} onChange={(event) => update({ ...bgm, range: { ...bgm.range, [key]: Math.round(Number(event.target.value) * 1e6) } })} /></Field>
            ))}
            <Field label="增益（dB）"><input className="numeric" type="number" value={bgm.gainDb} onChange={(event) => update({ ...bgm, gainDb: Number(event.target.value) })} /></Field>
            {([["fadeInFrames", "淡入帧数"], ["fadeOutFrames", "淡出帧数"]] as const).map(([key, label]) => (
              <Field key={key} label={label}><input className="numeric" type="number" value={bgm[key]} onChange={(event) => update({ ...bgm, [key]: Number(event.target.value) })} /></Field>
            ))}
          </div>
          <div className="flex flex-wrap gap-6 border-t border-line pt-4">
            <label className="check"><input type="checkbox" checked={bgm.loop} onChange={(event) => update({ ...bgm, loop: event.target.checked })} />循环裁剪段</label>
            <label className="check"><input type="checkbox" checked={bgm.ducking} onChange={(event) => update({ ...bgm, ducking: event.target.checked })} />旁白驱动音乐压低</label>
          </div>
        </div>
      )}
    </section>
  );
}
