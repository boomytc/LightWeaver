import { useState } from "react";
import { PROFILES, z } from "@lightweaver/weaver/contracts";
import { api, mediaUrl, requestId } from "../api";
import { desktop } from "../desktop";
import { labels } from "../domain/format";
import { useSession } from "../session/context";
import { Field } from "../ui/Field";
import { Modal } from "../ui/Modal";

const exportKinds = ["file", "otio", "jianying", "bundle"] as const;
type ExportKind = (typeof exportKinds)[number];

const kindLabel: Record<ExportKind, string> = {
  file: "视频文件",
  otio: "OTIO",
  jianying: "剪映草稿",
  bundle: "bundle",
};

export function DeliveryPanel() {
  const session = useSession();
  const draft = session.draft;
  const ctx = session.ctx;
  const [pendingKind, setPendingKind] = useState<ExportKind | null>(null);
  const [destination, setDestination] = useState("");
  const [deliveryId, setDeliveryId] = useState("");
  if (!draft || !ctx) return null;

  const send = (kind: ExportKind, target: string, selectedDelivery = deliveryId) =>
    session.act(async () => {
      const id = draft.id;
      const result = await api(`/projects/${id}/export`, z.object({ file: z.string().optional() }).passthrough(), {
        method: "POST",
        body: {
          kind,
          destination: target,
          ...(selectedDelivery ? { deliveryId: selectedDelivery } : {}),
          requestId: requestId(),
        },
      });
      if (session.route.projectId !== id) return;
      const revealed = typeof result.file === "string" ? result.file : target;
      await desktop()?.reveal?.(revealed);
      session.setNotice(`已导出${kindLabel[kind]}`);
    });

  const start = async (kind: ExportKind) => {
    const bridge = desktop();
    const suggested = `${draft.title || "lightweaver"}${kind === "otio" ? ".otio" : kind === "file" ? ".mp4" : ""}`;
    if ((kind === "file" || kind === "bundle") && bridge?.pickExportFile) {
      const picked = await bridge.pickExportFile(kind === "bundle" ? suggested.replace(/\.otio$/, "") + ".zip" : suggested);
      if (picked) await send(kind, kind === "bundle" && !picked.endsWith(".zip") ? `${picked}.zip` : picked);
      return;
    }
    if (bridge?.pickDirectory) {
      const picked = await bridge.pickDirectory();
      if (!picked) return;
      const name = (draft.title || "lightweaver").replace(/[\\/]/g, "-");
      await send(kind, `${picked.replace(/[/\\]+$/, "")}/${name}-${kind}`);
      return;
    }
    setDestination("");
    setPendingKind(kind);
  };

  return (
    <div className="min-w-0">
      <h2>交付规格</h2>
      <Field label="片名">
        <input value={draft.title} onChange={(event) => session.edit({ ...draft, title: event.target.value })} />
      </Field>
      <div className="actions">
        {["zh", "en"].map((locale) => (
          <label key={locale} className="check">
            <input
              type="checkbox"
              checked={draft.locales.includes(locale)}
              onChange={(event) =>
                session.edit({
                  ...draft,
                  locales: event.target.checked ? [...draft.locales, locale] : draft.locales.filter((item) => item !== locale),
                })
              }
            />
            {locale === "zh" ? "中文" : "英文"}
          </label>
        ))}
      </div>
      {Object.values(PROFILES).map((profile) => (
        <label className="check" key={profile.id}>
          <input
            type="checkbox"
            checked={draft.profiles.some((item) => item.id === profile.id)}
            onChange={(event) =>
              session.edit({
                ...draft,
                profiles: event.target.checked ? [...draft.profiles, profile] : draft.profiles.filter((item) => item.id !== profile.id),
              })
            }
          />
          {labels[profile.id] || profile.id}
        </label>
      ))}
      {draft.profiles.map((profile, index) => (
        <article key={profile.id}>
          <h3>{labels[profile.id] || profile.id}</h3>
          <div className="actions">
            <Field label="帧率">
              <input
                type="number"
                value={profile.fps.num / profile.fps.den}
                onChange={(event) =>
                  session.edit({
                    ...draft,
                    profiles: draft.profiles.map((item, itemIndex) =>
                      itemIndex === index
                        ? { ...item, fps: { num: Math.round(Number(event.target.value) * 1000), den: 1000 } }
                        : item,
                    ),
                  })
                }
              />
            </Field>
            <Field label="字幕">
              <select
                value={profile.subtitles}
                onChange={(event) =>
                  session.edit({
                    ...draft,
                    profiles: draft.profiles.map((item, itemIndex) =>
                      itemIndex === index
                        ? {
                            ...item,
                            subtitles: z.enum(["sidecar", "burn", "both", "none"]).parse(event.target.value),
                          }
                        : item,
                    ),
                  })
                }
              >
                <option value="both">烧录与外挂</option>
                <option value="sidecar">外挂</option>
                <option value="burn">烧录</option>
                <option value="none">无</option>
              </select>
            </Field>
            <Field label="目标 LUFS">
              <input
                type="number"
                value={profile.loudness.integratedLufs}
                onChange={(event) =>
                  session.edit({
                    ...draft,
                    profiles: draft.profiles.map((item, itemIndex) =>
                      itemIndex === index
                        ? { ...item, loudness: { ...item.loudness, integratedLufs: Number(event.target.value) } }
                        : item,
                    ),
                  })
                }
              />
            </Field>
            <Field label="True peak dB">
              <input
                type="number"
                value={profile.loudness.truePeakDb}
                onChange={(event) =>
                  session.edit({
                    ...draft,
                    profiles: draft.profiles.map((item, itemIndex) =>
                      itemIndex === index
                        ? { ...item, loudness: { ...item.loudness, truePeakDb: Number(event.target.value) } }
                        : item,
                    ),
                  })
                }
              />
            </Field>
          </div>
        </article>
      ))}
      <div className="actions">
        <button
          type="button"
          disabled={session.dirty}
          onClick={() => void session.act(() => session.showPlan(`/projects/${draft.id}/plan`, { requestId: requestId() }))}
        >
          检查制作计划
        </button>
        {exportKinds.map((kind) => (
          <button key={kind} type="button" onClick={() => void start(kind)}>
            导出{kindLabel[kind]}
          </button>
        ))}
      </div>
      {session.dirty && <small>先保存修订，再提交制作。</small>}
      <h2>交付与历史</h2>
      {ctx.deliveries.length === 0 && <p>尚未有通过验证的交付。</p>}
      {ctx.deliveries.map((delivery) => (
        <article key={delivery.id}>
          <h3>
            {delivery.target} <span className="badge">{labels[delivery.state] || delivery.state}</span>
          </h3>
          <small>
            制作修订 {delivery.revisionId} · {delivery.createdAt}
          </small>
          {delivery.artifacts.video && <video controls src={mediaUrl(delivery.artifacts.video)} />}
          <div className="actions">
            <button type="button" onClick={() => setDeliveryId(delivery.id)}>
              {deliveryId === delivery.id ? "将用这份交付导出" : "导出时使用这份"}
            </button>
            {["srt", "ass", "manifest", "receipt", "audio"]
              .filter((key) => delivery.artifacts[key])
              .map((key) => (
                <a key={key} href={mediaUrl(delivery.artifacts[key] || "")}>
                  {key}
                </a>
              ))}
          </div>
          <p>
            按场景定位：
            {draft.scenes.map((scene, index) => (
              <button
                key={scene.id}
                type="button"
                onClick={() =>
                  void session.act(async () => {
                    const manifest = await api(
                      `/artifacts/${delivery.timelineDigest}`,
                      z.object({
                        visuals: z.array(z.object({ sceneId: z.string(), startFrame: z.number() })),
                        output: z.object({ fps: z.object({ num: z.number(), den: z.number() }) }),
                      }),
                    );
                    const visual = manifest.visuals.find((item) => item.sceneId === scene.id);
                    const video = document.querySelector<HTMLVideoElement>(`video[src="${mediaUrl(delivery.artifacts.video || "")}"]`);
                    if (visual && video) {
                      video.currentTime = (visual.startFrame * manifest.output.fps.den) / manifest.output.fps.num;
                      await video.play();
                    }
                  })
                }
              >
                {index + 1}
              </button>
            ))}
          </p>
        </article>
      ))}
      {session.plan !== null && (
        <details>
          <summary>计划与影响</summary>
          <pre>{JSON.stringify(session.plan, null, 2)}</pre>
        </details>
      )}
      <Modal open={pendingKind !== null} title="导出目标" onOpenChange={(open) => !open && setPendingKind(null)}>
        <Field label="绝对路径">
          <input value={destination} onChange={(event) => setDestination(event.target.value)} />
        </Field>
        <button
          type="button"
          className="primary"
          disabled={!destination.trim() || !pendingKind}
          onClick={() => {
            if (!pendingKind) return;
            const kind = pendingKind;
            setPendingKind(null);
            void send(kind, destination.trim());
          }}
        >
          导出
        </button>
      </Modal>
    </div>
  );
}
