import { MediaAssetVersion, ProjectDocument, refKey, z } from "@lightweaver/weaver/contracts";
import { Field } from "../ui/Field";

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function BgmEditor({ draft, assets, edit }: { draft: ProjectDocument; assets: z.infer<typeof MediaAssetVersion>[]; edit: (project: ProjectDocument) => void }) {
  const bgm = draft.bgm;
  const update = (raw: unknown) => {
    const parsed = ProjectDocument.shape.bgm.safeParse(raw);
    if (parsed.success) edit({ ...draft, bgm: parsed.data });
  };
  const updateRange = (key: "startUs" | "durationUs", seconds: number) => {
    if (!bgm || !Number.isFinite(seconds)) return;
    const min = key === "startUs" ? 0 : 0.1;
    update({ ...bgm, range: { ...bgm.range, [key]: Math.round(clamp(seconds, min, 3600) * 1e6) } });
  };
  const updateNumber = (
    key: "gainDb" | "fadeInFrames" | "fadeOutFrames",
    value: number,
    min: number,
    max: number,
    integer = false,
  ) => {
    if (!bgm || !Number.isFinite(value)) return;
    const next = clamp(value, min, max);
    update({ ...bgm, [key]: integer ? Math.round(next) : next });
  };
  return (
    <div className="flex flex-col gap-3">
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
        <>
          <div className="grid grid-cols-1 gap-3 border-t border-line pt-3 md:grid-cols-3">
            {([["startUs", "音乐入点（秒）", 0, 3600], ["durationUs", "音乐裁剪时长（秒）", 0.1, 3600]] as const).map(([key, label, min, max]) => (
              <Field key={key} label={label}>
                <input
                  className="numeric"
                  type="number"
                  min={min}
                  max={max}
                  step="0.1"
                  value={bgm.range[key] / 1e6}
                  onChange={(event) => updateRange(key, Number(event.target.value))}
                />
              </Field>
            ))}
            <Field label="增益（dB）">
              <input
                className="numeric"
                type="number"
                min={-90}
                max={24}
                step="0.5"
                value={bgm.gainDb}
                onChange={(event) => updateNumber("gainDb", Number(event.target.value), -90, 24)}
              />
            </Field>
            {([["fadeInFrames", "淡入帧数"], ["fadeOutFrames", "淡出帧数"]] as const).map(([key, label]) => (
              <Field key={key} label={label}>
                <input
                  className="numeric"
                  type="number"
                  min={0}
                  max={3600}
                  step="1"
                  value={bgm[key]}
                  onChange={(event) => updateNumber(key, Number(event.target.value), 0, 3600, true)}
                />
              </Field>
            ))}
          </div>
          <div className="flex flex-wrap gap-6 border-t border-line pt-3">
            <label className="check"><input type="checkbox" checked={bgm.loop} onChange={(event) => update({ ...bgm, loop: event.target.checked })} />循环裁剪段</label>
            <label className="check"><input type="checkbox" checked={bgm.ducking} onChange={(event) => update({ ...bgm, ducking: event.target.checked })} />旁白驱动音乐压低</label>
          </div>
        </>
      )}
    </div>
  );
}
