import { useEffect, useRef, useState } from "react";
import { Delivery, PROFILES, TimelineManifest, z } from "@lightweaver/weaver/contracts";
import { api, ApiError, mediaUrl, requestId } from "../api";
import { desktop } from "../desktop";
import { labels, localeName } from "../domain/format";
import { useSession } from "../session/context";
import type { ProjectSessionIdentity } from "../session/useProjectSession";
import { useAction } from "../ui/useAction";
import { Field } from "../ui/Field";
import { ViewHeader } from "../ui/ViewHeader";
import { Modal } from "../ui/Modal";
import { Menu, MenuItem } from "../ui/Menu";
import { Button } from "../ui/Button";
import { Badge } from "../ui/Badge";
import { NativeSelect } from "../ui/NativeSelect";

type ExportKind = "file" | "otio" | "jianying" | "bundle";
type ExportIntent = { kind: ExportKind; deliveryId: string; owner: ProjectSessionIdentity };
type DeliveryRecord = z.infer<typeof Delivery> & { state: string };
type DeliveryChoice = {
  projectId: string;
  deliveryId: string;
};
const ExportResult = z.object({ file: z.string().optional() }).passthrough();

function clampNumber(value: string, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

const kindLabel: Record<ExportKind, string> = {
  file: "视频文件",
  otio: "OTIO",
  jianying: "剪映草稿",
  bundle: "项目包",
};
const canExportDelivery = (delivery: DeliveryRecord | undefined) => !!delivery &&
  ["current", "stale", "historical"].includes(delivery.state) && !!delivery.artifacts.video;

const artifactFiles = [
  { key: "srt", label: "SRT 字幕", extension: "srt" },
  { key: "ass", label: "ASS 字幕", extension: "ass" },
  { key: "audio", label: "音频", extension: "wav" },
  { key: "manifest", label: "时间轴数据", extension: "timeline.json" },
  { key: "receipt", label: "制作记录", extension: "receipt.json" },
] as const;

function deliveryTargetLabel(target: string) {
  const [locale, profile] = target.split("/");
  return profile ? `${localeName(locale)} · ${labels[profile] || profile}` : target;
}

const deliveryGroups = [
  { state: "current", label: "当前", tone: "ok", hint: "与当前内容一致，可直接导出" },
  { state: "stale", label: "内容已更新", tone: "warn", hint: "可导出这份成片，或重新制作以包含最新修改" },
  { state: "historical", label: "历史", tone: "neutral", hint: "同一输出规格的旧成片" },
  { state: "missing", label: "缺失", tone: "danger", hint: "文件缺失或损坏，无法导出" },
] as const;

export function DeliveryPanel() {
  const session = useSession();
  const draft = session.draft;
  const ctx = session.ctx;
  const choosing = useAction();
  const [pendingExport, setPendingExport] = useState<ExportIntent | null>(null);
  const [exporting, setExporting] = useState<ExportKind | null>(null);
  const [destination, setDestination] = useState("");
  const [deliveryChoice, setDeliveryChoice] = useState<DeliveryChoice | null>(null);
  if (!draft || !ctx) return null;
  const deliveryId =
    deliveryChoice?.projectId === draft.id &&
    ctx.deliveries.some((delivery) => delivery.id === deliveryChoice.deliveryId)
      ? deliveryChoice.deliveryId
      : ctx.deliveries.find((delivery) => delivery.state === "current")?.id || "";
  const chosen = ctx.deliveries.find((delivery) => delivery.id === deliveryId);
  const exportReady = canExportDelivery(chosen);
  const unsaved = session.dirty || session.planDirty;
  const exportBusy = session.busy || !!choosing.pending || exporting !== null;
  const knownStates = new Set<string>(deliveryGroups.map((group) => group.state));
  const otherDeliveries = ctx.deliveries.filter((delivery) => !knownStates.has(delivery.state));
  const groups = [
    ...deliveryGroups
      .map((group) => ({ ...group, items: ctx.deliveries.filter((delivery) => delivery.state === group.state) }))
      .filter((group) => group.items.length > 0),
    ...(otherDeliveries.length
      ? [{ state: "other", label: "其他", tone: "neutral" as const, hint: "未识别的交付状态", items: otherDeliveries }]
      : []),
  ];

  const send = async ({ kind, deliveryId: selectedDelivery, owner }: ExportIntent, target: string) => {
    if (exporting || !session.isSessionCurrent(owner)) return;
    setExporting(kind);
    try {
      await session.act(async () => {
        if (!session.isSessionCurrent(owner)) return;
        const id = owner.projectId;
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
        if (!session.isSessionCurrent(owner)) return;
        const revealed = typeof result.file === "string" ? result.file : target;
        await desktop()?.reveal?.(revealed);
        if (session.isSessionCurrent(owner)) session.setNotice(`已导出${kindLabel[kind]}`);
      });
    } finally {
      setExporting(null);
    }
  };

  const start = (kind: ExportKind) => choosing.run(kind, async () => {
    if (exporting || session.busy || (kind === "bundle" ? unsaved : !exportReady)) return;
    const owner = session.beginAssetEditSession();
    if (!owner || owner.projectId !== draft.id) return;
    const intent = { kind, deliveryId, owner };
    const bridge = desktop();
    const suggested = `${draft.title || "lightweaver"}${kind === "otio" ? ".otio" : kind === "file" ? ".mp4" : ""}`;
    if ((kind === "file" || kind === "bundle") && bridge?.pickExportFile) {
      const picked = await bridge.pickExportFile(kind === "bundle" ? suggested.replace(/\.otio$/, "") + ".zip" : suggested);
      if (picked) await send(intent, kind === "bundle" && !picked.endsWith(".zip") ? `${picked}.zip` : picked);
      return;
    }
    if (bridge?.pickDirectory) {
      const picked = await bridge.pickDirectory();
      if (!picked) return;
      const name = (draft.title || "lightweaver").replace(/[\\/]/g, "-");
      await send(intent, `${picked.replace(/[/\\]+$/, "")}/${name}-${kind}`);
      return;
    }
    setDestination("");
    setPendingExport(intent);
  }).catch(session.handleError);

  return (
    <div className="narrow-content flex min-w-0 flex-col gap-5">
      <ViewHeader title="交付规格" description="选择输出语言与画幅，逐项确认帧率、字幕和响度目标。" />
      <div className="sticky -top-5 z-10 flex flex-wrap items-center gap-2 border-b border-line bg-panel py-3">
        <Button variant="primary" type="button" disabled={exportBusy || !exportReady} onClick={() => void start("file")}>
          {exporting === "file" ? "正在导出视频…" : "导出视频"}
        </Button>
        <Menu label="更多导出">
          <MenuItem disabled={exportBusy || !exportReady} onSelect={() => void start("otio")}>导出 OTIO 时间线</MenuItem>
          <MenuItem disabled={exportBusy || !exportReady} onSelect={() => void start("jianying")}>导出剪映草稿</MenuItem>
          <MenuItem disabled={exportBusy || unsaved} onSelect={() => void start("bundle")}>导出项目包</MenuItem>
        </Menu>
        <Button
          type="button"
          disabled={unsaved || exportBusy}
          onClick={() => void session.act(() => session.showPlan(`/projects/${draft.id}/plan`, { requestId: requestId() }))}
        >
          检查制作计划
        </Button>
        <div className="ml-auto flex min-w-0 flex-col items-end gap-0.5">
          {exporting && exporting !== "file" && <small className="hint text-xs">正在导出{kindLabel[exporting]}…</small>}
          <small className="hint text-right text-xs">
            {exportReady && chosen
              ? `交付来源：${deliveryTargetLabel(chosen.target)}`
              : ctx.deliveries.length
                ? "先从下方选择一份可用成片"
                : "先制作成片，再导出视频"}
          </small>
          {unsaved && <small className="hint text-xs">保存修改后可检查计划或导出项目包。</small>}
        </div>
      </div>
      <section className="panel-card flex flex-col gap-4 p-4">
        <Field label="片名">
          <input value={draft.title} onChange={(event) => session.edit({ ...draft, title: event.target.value })} />
        </Field>
        <div className="form-grid">
          <div className="field">
            <span>输出语言</span>
            <div className="row">
              {["zh", "en"].map((locale) => (
                <label key={locale} className="check" title={draft.locales.length === 1 && draft.locales.includes(locale) ? "至少保留一种输出语言" : undefined}>
                  <input
                    type="checkbox"
                    checked={draft.locales.includes(locale)}
                    disabled={draft.locales.length === 1 && draft.locales.includes(locale)}
                    onChange={(event) => {
                      if (!event.target.checked && draft.locales.length <= 1) return;
                      session.edit({
                        ...draft,
                        locales: event.target.checked ? [...draft.locales, locale] : draft.locales.filter((item) => item !== locale),
                      });
                    }}
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
                <label className="check" key={profile.id} title={draft.profiles.length === 1 && draft.profiles[0]?.id === profile.id ? "至少保留一种输出画幅" : undefined}>
                  <input
                    type="checkbox"
                    checked={draft.profiles.some((item) => item.id === profile.id)}
                    disabled={draft.profiles.length === 1 && draft.profiles[0]?.id === profile.id}
                    onChange={(event) => {
                      if (!event.target.checked && draft.profiles.length <= 1) return;
                      session.edit({
                        ...draft,
                        profiles: event.target.checked ? [...draft.profiles, profile] : draft.profiles.filter((item) => item.id !== profile.id),
                      });
                    }}
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
                min={1}
                max={120}
                step={0.001}
                value={profile.fps.num / profile.fps.den}
                onChange={(event) => {
                  const fps = clampNumber(event.target.value, profile.fps.num / profile.fps.den, 1, 120);
                  session.edit({
                    ...draft,
                    profiles: draft.profiles.map((item, itemIndex) =>
                      itemIndex === index
                        ? { ...item, fps: { num: Math.round(fps * 1000), den: 1000 } }
                        : item,
                    ),
                  });
                }}
              />
            </Field>
            <Field label="字幕">
              <NativeSelect
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
              </NativeSelect>
            </Field>
            <Field label="目标 LUFS">
              <input
                type="number"
                min={-36}
                max={-5}
                step={0.1}
                value={profile.loudness.integratedLufs}
                onChange={(event) => {
                  const lufs = clampNumber(event.target.value, profile.loudness.integratedLufs, -36, -5);
                  session.edit({
                    ...draft,
                    profiles: draft.profiles.map((item, itemIndex) =>
                      itemIndex === index
                        ? { ...item, loudness: { ...item.loudness, integratedLufs: lufs } }
                        : item,
                    ),
                  });
                }}
              />
            </Field>
            <Field label="True peak dB">
              <input
                type="number"
                min={-9}
                max={0}
                step={0.1}
                value={profile.loudness.truePeakDb}
                onChange={(event) => {
                  const peak = clampNumber(event.target.value, profile.loudness.truePeakDb, -9, 0);
                  session.edit({
                    ...draft,
                    profiles: draft.profiles.map((item, itemIndex) =>
                      itemIndex === index
                        ? { ...item, loudness: { ...item.loudness, truePeakDb: peak } }
                        : item,
                    ),
                  });
                }}
              />
            </Field>
          </div>
        </article>
      ))}
      <section className="flex flex-col gap-3">
        <div className="section-title">
          <div>
            <h2 className="m-0">交付与历史</h2>
            <Badge>{ctx.deliveries.length}</Badge>
          </div>
          <small className="hint text-xs">选择一份可用成片导出。</small>
        </div>
        {ctx.deliveries.length === 0 && (
          <div className="subtle-card p-6 text-center">
            <b>尚无成片</b>
            <p className="hint mx-auto mt-1 mb-0 text-xs">制作完成后可在此预览和导出。</p>
          </div>
        )}
        {groups.map((group) => (
          <section className="flex flex-col" aria-label={`${group.label}交付`} key={group.state}>
            <div className="flex flex-wrap items-baseline gap-2 border-b border-line pb-1.5">
              <h3 className="m-0 text-sm">{group.label}</h3>
              <Badge tone={group.tone}>{group.items.length}</Badge>
              <small className="hint text-xs">{group.hint}</small>
            </div>
            <div className="flex flex-col">
              {group.items.map((delivery) => (
                <DeliveryRow
                  key={delivery.id}
                  delivery={delivery}
                  selected={deliveryId === delivery.id}
                  onSelect={() => setDeliveryChoice({ projectId: draft.id, deliveryId: delivery.id })}
                />
              ))}
            </div>
          </section>
        ))}
      </section>
      <Modal open={pendingExport !== null} title="导出目标" onOpenChange={(open) => !open && setPendingExport(null)}>
        <div className="flex flex-col gap-4">
          <Field label="绝对路径">
            <input value={destination} onChange={(event) => setDestination(event.target.value)} />
          </Field>
          <div className="flex justify-end">
            <Button
              type="button"
              variant="primary"
              disabled={!destination.trim() || !pendingExport}
              onClick={() => {
                if (!pendingExport) return;
                const intent = pendingExport;
                setPendingExport(null);
                void send(intent, destination.trim());
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

function DeliveryRow({
  delivery,
  selected,
  onSelect,
}: {
  delivery: DeliveryRecord;
  selected: boolean;
  onSelect: () => void;
}) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const usable = canExportDelivery(delivery);
  return (
    <article className="flex flex-col gap-1.5 border-b border-line py-2.5 last:border-b-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <b className="text-sm">{deliveryTargetLabel(delivery.target)}</b>
        <small className="numeric text-xs" title={`修订 ${delivery.revisionId}`}>{new Date(delivery.createdAt).toLocaleString()}</small>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {usable && artifactFiles.some(({ key }) => delivery.artifacts[key]) && <details>
            <summary className="hint text-xs">附加文件</summary>
            <div className="actions mt-2">
              {artifactFiles.filter(({ key }) => delivery.artifacts[key]).map(({ key, label, extension }) => (
                <a key={key} className="ui-button no-underline" data-variant="secondary" data-size="sm"
                  href={mediaUrl(delivery.artifacts[key] || "")} download={`${delivery.target.replaceAll("/", "-")}.${extension}`}>{label}</a>
              ))}
            </div>
          </details>}
          {usable && (selected ? <Badge tone="accent">已选为导出版本</Badge> : <Button size="sm" type="button" onClick={onSelect}>选择此版本</Button>)}
        </div>
      </div>
      {usable && delivery.artifacts.video && (
        <details onToggle={(event) => setPreviewOpen(event.currentTarget.open)}>
          <summary className="hint w-fit text-xs">预览与场景定位</summary>
          {previewOpen && <DeliveryPreview key={delivery.timelineDigest} delivery={delivery} />}
        </details>
      )}
    </article>
  );
}

function DeliveryPreview({ delivery }: { delivery: DeliveryRecord }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [manifest, setManifest] = useState<z.infer<typeof TimelineManifest> | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setFailed(false);
    api(`/artifacts/${delivery.timelineDigest}`, TimelineManifest, { signal: controller.signal })
      .then((value) => { if (!controller.signal.aborted) setManifest(value); })
      .catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, [delivery.timelineDigest, attempt]);
  const scenes = new Map<string, number>();
  for (const visual of manifest?.visuals || [])
    if (!scenes.has(visual.sceneId)) scenes.set(visual.sceneId, visual.startFrame);
  return <div className="mt-2 flex flex-col gap-2">
    <video ref={videoRef} className="max-h-80 w-full rounded-md bg-black" controls preload="metadata" src={mediaUrl(delivery.artifacts.video || "")} />
    {manifest && <div className="flex flex-wrap items-center gap-1.5" aria-label="成片场景定位">
      <small>场景：</small>
      {[...scenes].map(([sceneId, frame], index) => <Button key={sceneId} size="sm" variant="ghost" className="numeric" type="button"
        onClick={() => {
          const video = videoRef.current;
          if (!video) return;
          video.currentTime = frame * manifest.output.fps.den / manifest.output.fps.num;
          void video.play().catch(() => {});
        }}>{index + 1}</Button>)}
    </div>}
    {failed && <div className="actions"><small className="error">暂时无法读取场景位置。</small><Button size="sm" onClick={() => setAttempt((value) => value + 1)}>重试</Button></div>}
  </div>;
}
