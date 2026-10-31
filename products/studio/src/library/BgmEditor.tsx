import { MediaAssetVersion, ProjectDocument, refKey, z } from "@lightweaver/weaver/contracts";
import { Field } from "../ui/Field";

export function BgmEditor({
  draft,
  assets,
  edit,
}: {
  draft: ProjectDocument;
  assets: z.infer<typeof MediaAssetVersion>[];
  edit: (p: ProjectDocument) => void;
}) {
  const bgm = draft.bgm;
  const update = (raw: unknown) => {
    const parsed = ProjectDocument.shape.bgm.safeParse(raw);
    if (parsed.success) edit({ ...draft, bgm: parsed.data });
  };
  return (
    <article>
      <Field label="背景音乐">
        <select
          value={bgm ? refKey(bgm.source) : ""}
          onChange={(e) => {
            const a = assets.find((a) => refKey(a) === e.target.value);
            update(
              a
                ? {
                    source: { assetId: a.assetId, version: a.version },
                    range: { startUs: 0, durationUs: 1000000 },
                    loop: true,
                    gainDb: -18,
                    fadeInFrames: 10,
                    fadeOutFrames: 15,
                    ducking: true,
                  }
                : undefined,
            );
          }}
        >
          <option value="">不使用背景音乐</option>
          {assets
            .filter((a) => a.kind === "audio")
            .map((a) => (
              <option key={a.version} value={refKey(a)}>
                {a.name}
              </option>
            ))}
        </select>
      </Field>
      {bgm && (
        <>
          <div className="actions">
            {[
              ["startUs", "音乐入点（秒）"],
              ["durationUs", "音乐裁剪时长（秒）"],
            ].map(([key, label]) => (
              <Field key={key} label={label}>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={
                    (key === "startUs"
                      ? bgm.range.startUs
                      : bgm.range.durationUs) / 1e6
                  }
                  onChange={(e) =>
                    update({
                      ...bgm,
                      range: {
                        ...bgm.range,
                        [key]: Math.round(Number(e.target.value) * 1e6),
                      },
                    })
                  }
                />
              </Field>
            ))}
            <Field label="增益（dB）">
              <input
                type="number"
                value={bgm.gainDb}
                onChange={(e) =>
                  update({ ...bgm, gainDb: Number(e.target.value) })
                }
              />
            </Field>
            {[
              ["fadeInFrames", "淡入帧数"],
              ["fadeOutFrames", "淡出帧数"],
            ].map(([key, label]) => (
              <Field key={key} label={label}>
                <input
                  type="number"
                  value={
                    key === "fadeInFrames"
                      ? bgm.fadeInFrames
                      : bgm.fadeOutFrames
                  }
                  onChange={(e) =>
                    update({ ...bgm, [key]: Number(e.target.value) })
                  }
                />
              </Field>
            ))}
          </div>
          <label className="check">
            <input
              type="checkbox"
              checked={bgm.loop}
              onChange={(e) => update({ ...bgm, loop: e.target.checked })}
            />
            循环裁剪段
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={bgm.ducking}
              onChange={(e) => update({ ...bgm, ducking: e.target.checked })}
            />
            旁白驱动音乐压低
          </label>
        </>
      )}
    </article>
  );
}
