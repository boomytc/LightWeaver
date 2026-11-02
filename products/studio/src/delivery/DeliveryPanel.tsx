import { useState } from "react";
import { PROFILES, z } from "@lightweaver/weaver/contracts";
import { api, ApiError, mediaUrl, requestId } from "../api";
import { desktop } from "../desktop";
import { labels } from "../domain/format";
import { useSession } from "../session/context";
import { Field } from "../ui/Field";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { Badge } from "../ui/Badge";

const exportKinds = ["file", "otio", "jianying", "bundle"] as const;
type ExportKind = (typeof exportKinds)[number];
type DeliveryChoice = {
  projectId: string;
  deliveryId: string;
};
const ExportResult = z.object({ file: z.string().optional() }).passthrough();

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
  const [exporting, setExporting] = useState<ExportKind | null>(null);
  const [destination, setDestination] = useState("");
  const [deliveryChoice, setDeliveryChoice] = useState<DeliveryChoice | null>(null);
  if (!draft || !ctx) return null;
  const deliveryId =
    deliveryChoice?.projectId === draft.id &&
    ctx.deliveries.some((delivery) => delivery.id === deliveryChoice.deliveryId)
      ? deliveryChoice.deliveryId
      : ctx.deliveries.find((delivery) => delivery.state === "current")?.id || "";

  const send = async (kind: ExportKind, target: string, selectedDelivery = deliveryId) => {
    if (exporting) return;
    setExporting(kind);
    try {
      await session.act(async () => {
      const editSession = session.beginAssetEditSession();
      if (!editSession || editSession.projectId !== draft.id) return;
      const id = editSession.projectId;
      const key = JSON.stringify(["project-export", id, kind, target, selectedDelivery]);
      let attempt = session.stableRequest(key);
      const submit = () =>
        api(`/projects/${id}/export`, ExportResult, {
          method: "POST",
          body: {
            kind,
            destination: target,
            ...(selectedDelivery ? { deliveryId: selectedDelivery } : {}),
            requestId: attempt.requestId,
          },
        });
      let result: z.infer<typeof ExportResult>;
      let retriedTransport = false;
      let retriedReuse = false;
      while (true) {
        try {
          result = await submit();
          break;
        } catch (reason) {
          if (
            reason instanceof ApiError &&
            reason.protocol.code === "REQUEST_ID_REUSED" &&
            !retriedReuse
          ) {
            retriedReuse = true;
            attempt = session.rotateStableRequest(key, attempt);
            continue;
          }
          if (!(reason instanceof ApiError) && !retriedTransport) {
            retriedTransport = true;
            continue;
          }
          throw reason;
        }
      }
      session.completeStableRequest(key, attempt);
      if (!session.isSessionCurrent(editSession)) return;
      const revealed = typeof result.file === "string" ? result.file : target;
      await desktop()?.reveal?.(revealed);
      session.setNotice(`已导出${kindLabel[kind]}`);
      });
    } finally {
      setExporting(null);
    }
  };

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
    <div className="narrow-content flex min-w-0 flex-col gap-5">
      <div><h2 className="m-0">交付规格</h2><p className="hint mb-0 mt-1 text-xs">选择输出语言与画幅，逐项确认帧率、字幕和响度目标。</p></div>
      <section className="panel-card flex flex-col gap-4 p-4">
        <Field label="片名">
          <input value={draft.title} onChange={(event) => session.edit({ ...draft, title: event.target.value })} />
        </Field>
        <div className="form-grid">
          <div className="field">
            <span>输出语言</span>
            <div className="row">
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
          </div>
          <div className="field">
            <span>输出画幅</span>
            <div className="row">
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
            </div>
          </div>
        </div>
      </section>
      {draft.profiles.map((profile, index) => (
        <article className="panel-card p-4" key={profile.id}>
          <div className="section-title mb-3">
            <h3 className="m-0 text-sm">{labels[profile.id] || profile.id}</h3>
            <Badge className="numeric">{profile.width}×{profile.height}</Badge>
          </div>
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
      <div className="actions panel-card p-3">
        <Button
          type="button"
          disabled={session.dirty}
          onClick={() => void session.act(() => session.showPlan(`/projects/${draft.id}/plan`, { requestId: requestId() }))}
        >
          检查制作计划
        </Button>
        {exportKinds.map((kind) => (
          <Button key={kind} type="button" disabled={exporting !== null} onClick={() => void start(kind)}>
            {exporting === kind ? "正在导出…" : `导出${kindLabel[kind]}`}
          </Button>
        ))}
      </div>
      {session.dirty && <small>先保存修订，再提交制作。</small>}
      <section className="flex flex-col gap-3">
        <div className="section-title">
          <h2 className="m-0">交付与历史</h2>
          <Badge>{ctx.deliveries.length}</Badge>
        </div>
        {ctx.deliveries.length === 0 && (
          <div className="subtle-card p-6 text-center">
            <b>尚未有通过验证的交付</b>
            <p className="hint mx-auto mt-1 mb-0 text-xs">点击右上角“制作”生成成片后，可在此核验画面并导出。</p>
          </div>
        )}
        {ctx.deliveries.map((delivery) => (
          <article className="panel-card flex flex-col gap-3 p-4" key={delivery.id}>
            <div className="section-title">
              <div>
                <h3 className="m-0 text-sm">{delivery.target}</h3>
                <Badge tone="ok" dot>{labels[delivery.state] || delivery.state}</Badge>
              </div>
              <small className="numeric">
                修订 {delivery.revisionId.slice(0, 12)} · {delivery.createdAt}
              </small>
            </div>
            {delivery.artifacts.video && <video className="max-h-96 rounded-md bg-black" controls src={mediaUrl(delivery.artifacts.video)} />}
            <div className="actions">
              <Button
                size="sm"
                emphasized={deliveryId === delivery.id}
                type="button"
                onClick={() => setDeliveryChoice({ projectId: draft.id, deliveryId: delivery.id })}
              >
                {deliveryId === delivery.id ? "将用这份交付导出" : "导出时使用这份"}
              </Button>
              {["srt", "ass", "manifest", "receipt", "audio"]
                .filter((key) => delivery.artifacts[key])
                .map((key) => (
                  <a
                    key={key}
                    className="ui-button no-underline"
                    data-variant="secondary"
                    data-size="sm"
                    href={mediaUrl(delivery.artifacts[key] || "")}
                  >
                    {key}
                  </a>
                ))}
            </div>
            {draft.scenes.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <small>按场景定位：</small>
                {draft.scenes.map((scene, index) => (
                  <Button
                    key={scene.id}
                    size="sm"
                    variant="ghost"
                    className="numeric"
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
                  </Button>
                ))}
              </div>
            )}
          </article>
        ))}
      </section>
      <Modal open={pendingKind !== null} title="导出目标" onOpenChange={(open) => !open && setPendingKind(null)}>
        <div className="flex flex-col gap-4">
          <Field label="绝对路径">
            <input value={destination} onChange={(event) => setDestination(event.target.value)} />
          </Field>
          <div className="flex justify-end">
            <Button
              type="button"
              variant="primary"
              disabled={!destination.trim() || !pendingKind}
              onClick={() => {
                if (!pendingKind) return;
                const kind = pendingKind;
                setPendingKind(null);
                void send(kind, destination.trim());
              }}
            >
              导出
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
