import { useEffect, useRef, useState } from "react";
import { api, mediaUrl, requestId } from "../api";
import { RunRecord, refKey, speechOf, type MediaAssetVersion, type Scene } from "@lightweaver/weaver/contracts";
import { AssetPanel, useProjectAssetImport } from "../assets/AssetPanel";
import { EvidencePanel } from "../assets/EvidencePanel";
import { CaptionWorkspace } from "../captions/CaptionWorkspace";
import { desktop, type LayoutPreference } from "../desktop";
import { DeliveryPanel } from "../delivery/DeliveryPanel";
import { labels, runLabel } from "../domain/format";
import { isActiveRun, RESUMABLE_RUN_STATES } from "../domain/run";
import { notifyRunsChanged } from "../jobs/useRunList";
import { BgmEditor } from "../library/BgmEditor";
import { CreativePlanEditor } from "../library/CreativePlanEditor";
import { useSession } from "../session/context";
import { SceneEditor } from "../scenes/SceneEditor";
import { SourceWindowPlayer } from "../scenes/SourceWindowPlayer";
import { Menu, MenuItem } from "../ui/Menu";
import { Button } from "../ui/Button";
import { Badge } from "../ui/Badge";
import { Modal } from "../ui/Modal";
import { Hint } from "../ui/Hint";
import {
  AlertIcon,
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowUpIcon,
  AudioIcon,
  CardIcon,
  CopyIcon,
  EyeIcon,
  FileIcon,
  ImageIcon,
  MoreIcon,
  PanelBottomCloseIcon,
  PanelBottomOpenIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  PanelRightCloseIcon,
  PanelRightOpenIcon,
  PlusIcon,
  SaveIcon,
  TrashIcon,
  VideoIcon,
} from "../ui/Icons";

type Focus = "edit" | "captions" | "sound" | "plan" | "delivery";
type LeftMode = "assets" | "evidence" | "scenes";
type PreviewMode = "scene" | "asset";

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

export function ProjectWorkspace() {
  const session = useSession();
  const draft = session.draft;
  const ctx = session.ctx;
  const [focus, setFocus] = useState<Focus>("edit");
  const [leftMode, setLeftMode] = useState<LeftMode>("scenes");
  const [sceneId, setSceneId] = useState("");
  const [assetKey, setAssetKey] = useState("");
  const [previewMode, setPreviewMode] = useState<PreviewMode>("scene");
  const [width, setWidth] = useState(() => window.innerWidth);
  const [live, setLive] = useState<LayoutPreference | null>(null);
  const [dragging, setDragging] = useState("");
  const [conflictOpen, setConflictOpen] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);
  const { importPaths, importFiles } = useProjectAssetImport();
  const importRef = useRef(importPaths);
  importRef.current = importPaths;
  const layout = live || session.client.layout;
  const collapsed = layout.collapsed;

  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  const wasNarrow = useRef(width < 1100);
  useEffect(() => {
    const nextNarrow = width < 1100;
    if (nextNarrow && !wasNarrow.current) {
      const base = session.client.layout;
      setLive({ ...base, collapsed: { ...base.collapsed, left: true, right: true } });
    }
    wasNarrow.current = nextNarrow;
  }, [session.client.layout, width]);
  useEffect(() => {
    if (session.plan !== null) setPlanOpen(true);
  }, [session.plan]);
  useEffect(() => {
    if (!draft) return;
    const onImport = (event: Event) => {
      event.preventDefault();
      void (async () => {
        const picked = await desktop()?.pickMedia?.();
        if (picked?.length) await importRef.current(picked);
        else importInputRef.current?.click();
      })();
    };
    window.addEventListener("lightweaver-import", onImport);
    return () => window.removeEventListener("lightweaver-import", onImport);
  }, [draft?.id]);
  useEffect(() => {
    if (!draft) return;
    if (!draft.scenes.some((scene) => scene.id === sceneId)) setSceneId(draft.scenes[0]?.id || "");
  }, [draft, sceneId]);
  useEffect(() => {
    if (previewMode === "asset" && !ctx?.assets.some((item) => refKey(item) === assetKey)) setPreviewMode("scene");
  }, [assetKey, ctx, previewMode]);

  if (!draft || !ctx) return <p className="p-6">加载项目…</p>;
  const scene = draft.scenes.find((item) => item.id === sceneId) || null;
  const sceneIndex = draft.scenes.findIndex((item) => item.id === sceneId);
  const asset = ctx.assets.find((item) => refKey(item) === assetKey);
  const voices = [...session.library, ...ctx.library].filter(
    (value, index, values) =>
      value.payload.kind === "voice" &&
      values.findIndex((candidate) => candidate.itemId === value.itemId && candidate.version === value.version) === index,
  );
  const profile = draft.profiles[0];
  const revisionState = session.conflict || ctx.revision.id !== session.base
    ? { tone: "danger" as const, label: "服务器有新修订或冲突" }
    : session.dirty || session.planDirty
      ? { tone: "warn" as const, label: "未保存草稿" }
      : { tone: "ok" as const, label: "已保存" };
  const commitLayout = (next: LayoutPreference) => {
    const clamped = {
      left: clamp(next.left, 160, 640),
      right: clamp(next.right, 220, 640),
      bottom: clamp(next.bottom, 120, 480),
      collapsed: next.collapsed,
    };
    setLive(null);
    void session.client.setLayout(clamped);
  };
  const drag = (edge: "left" | "right" | "bottom") => (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setDragging(edge);
    const start = edge === "bottom" ? event.clientY : event.clientX;
    const initial = layout[edge];
    const move = (pointer: PointerEvent) => {
      const delta = edge === "left" ? pointer.clientX - start : edge === "right" ? start - pointer.clientX : start - pointer.clientY;
      setLive({ ...layout, [edge]: initial + delta, collapsed: { ...layout.collapsed, [edge]: false } });
    };
    const up = (pointer: PointerEvent) => {
      const delta = edge === "left" ? pointer.clientX - start : edge === "right" ? start - pointer.clientX : start - pointer.clientY;
      commitLayout({ ...layout, [edge]: initial + delta, collapsed: { ...layout.collapsed, [edge]: false } });
      setDragging("");
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
    window.addEventListener("pointercancel", up, { once: true });
  };
  const selectScene = (id: string, openEdit = false) => {
    setSceneId(id);
    setPreviewMode("scene");
    if (openEdit) setFocus("edit");
  };
  const selectAsset = (key: string) => {
    setAssetKey(key);
    setPreviewMode("asset");
  };
  const moveScene = (index: number, offset: -1 | 1) => {
    const target = index + offset;
    if (target < 0 || target >= draft.scenes.length) return;
    const scenes = [...draft.scenes];
    const current = scenes[index];
    const other = scenes[target];
    if (!current || !other) return;
    scenes[index] = other;
    scenes[target] = current;
    session.edit({ ...draft, scenes });
  };
  const bottomHeight = collapsed.bottom ? 36 : layout.bottom;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <input
        ref={importInputRef}
        type="file"
        multiple
        className="sr-only"
        aria-label="导入项目素材"
        disabled={session.busy}
        onChange={(event) => {
          const files = [...(event.target.files || [])];
          event.target.value = "";
          if (files.length) void importFiles(files);
        }}
      />
      <header className="workspace-header">
        <div className="workspace-context">
          <Hint label="返回项目列表">
            <Button size="icon" compact variant="ghost" aria-label="返回项目列表" onClick={() => void session.navigate("projects")}>
              <ArrowLeftIcon />
            </Button>
          </Hint>
          <span className="h-4 w-px shrink-0 bg-line" />
          <input
            className="workspace-title"
            value={draft.title}
            aria-label="项目名"
            onChange={(event) => session.edit({ ...draft, title: event.target.value })}
          />
          <Badge tone={revisionState.tone} dot title={revisionState.label}>
            <span className="numeric">rev {session.base.slice(0, 6) || "—"}</span>
          </Badge>
        </div>
        <div className="seg workspace-tabs" role="tablist" aria-label="工作区">
          {([
            ["edit", "画面"],
            ["captions", "字幕"],
            ["sound", "声音"],
            ["plan", "方案"],
            ["delivery", "交付"],
          ] as const).map(([key, label]) => (
            <button key={key} type="button" role="tab" aria-selected={focus === key} className={focus === key ? "is-on" : ""} onClick={() => setFocus(key)}>
              {label}
            </button>
          ))}
        </div>
        <div className="workspace-actions">
          <FieldLocale />
          <Menu label={<><MoreIcon /><span className="workspace-menu-label">更多</span></>}>
            <MenuItem disabled={session.dirty} onSelect={() => void session.act(() => session.showPlan(`/projects/${draft.id}/plan`, { requestId: requestId() }))}>检查制作计划</MenuItem>
            <MenuItem onSelect={() => void session.act(() => session.showPlan(`/projects/${draft.id}/impact`, { document: draft }))}>查看影响</MenuItem>
            {session.plan !== null && <MenuItem onSelect={() => setPlanOpen(true)}>查看计划与影响</MenuItem>}
            <MenuItem onSelect={() => void session.copyBrief()}><span className="flex items-center gap-2"><CopyIcon />复制给 agent</span></MenuItem>
          </Menu>
          <Button size="sm" emphasized={session.dirty} disabled={session.busy || !session.dirty} onClick={() => void session.save()}>
            <SaveIcon />保存
          </Button>
          <Button
            size="sm"
            variant="primary"
            disabled={session.dirty || session.busy}
            onClick={() => void session.act(() => session.submitJob(`/projects/${draft.id}/build`, { requestId: requestId() }))}
          >
            制作
          </Button>
        </div>
      </header>
      {session.conflict && (
        <div className="workspace-banner" role="alert">
          <AlertIcon className="shrink-0" />
          <span className="workspace-banner-copy">修订冲突，服务器内容为 <span className="numeric">{session.conflict.id.slice(0, 12)}</span>；你的草稿已保留。</span>
          <Button size="sm" onClick={() => setConflictOpen(true)}>对照内容</Button>
          <Button size="sm" onClick={session.loadServerKeepingDraft}>保留草稿并加载当前修订</Button>
        </div>
      )}
      {session.storedDraft && (
        <div className="workspace-banner">
          <AlertIcon className="shrink-0" />
          <span className="workspace-banner-copy">这个项目有可恢复草稿，基线仍是保存时的修订。</span>
          <Button size="sm" onClick={() => session.storedDraft && void session.restoreDraft(session.storedDraft)}>恢复草稿</Button>
          <Button size="sm" variant="ghost" onClick={session.clearStoredDraft}>清除备份</Button>
        </div>
      )}
      <div className="flex min-h-0 flex-1">
        {focus === "edit" && (
          <aside className="flex min-h-0 shrink-0 flex-col border-r border-line" style={{ width: collapsed.left ? 36 : layout.left }}>
            {collapsed.left ? (
              <div className="collapsed-rail"><PanelButton side="left" collapsed onClick={() => commitLayout({ ...layout, collapsed: { ...layout.collapsed, left: false } })} /></div>
            ) : (
              <>
                <div className="panel-header">
                  <span>创作资源</span>
                  <PanelButton side="left" collapsed={false} onClick={() => commitLayout({ ...layout, collapsed: { ...layout.collapsed, left: true } })} />
                </div>
                <div className="scroll-region min-h-0 flex-1 p-2">
                  <div className="seg mb-3 grid w-full grid-cols-3">
                    {([["scenes", "场景"], ["assets", "素材"], ["evidence", "证据"]] as const).map(([key, label]) => (
                      <button key={key} type="button" className={leftMode === key ? "is-on" : ""} aria-pressed={leftMode === key} onClick={() => setLeftMode(key)}>{label}</button>
                    ))}
                  </div>
                  {leftMode === "assets" && <AssetPanel selectedKey={assetKey} onSelect={selectAsset} />}
                  {leftMode === "evidence" && <EvidencePanel />}
                  {leftMode === "scenes" && (
                    <div className="flex flex-col gap-2">
                      <div className="actions">
                        {(["card", "still", "clip"] as const).map((kind) => (
                          <Button key={kind} size="sm" variant="ghost" onClick={() => session.addScene(kind)}><PlusIcon />{labels[kind]}</Button>
                        ))}
                      </div>
                      {draft.scenes.map((item, index) => (
                        <button key={item.id} type="button" className={`row-item ${item.id === sceneId ? "is-on" : ""}`} onClick={() => selectScene(item.id)}>
                          <span className="storyboard-index">{String(index + 1).padStart(2, "0")}</span>
                          <SceneKindIcon kind={item.kind} />
                          <span className="row-item-copy"><b>{item.label || labels[item.kind]}</b><small>{sceneSummary(item, session.locale)}</small></span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </aside>
        )}
        {focus === "edit" && <Resizer edge="left" dragging={dragging === "left"} onPointerDown={drag("left")} />}
        <main className={focus === "edit" ? "flex min-w-0 flex-1 flex-col overflow-hidden bg-panel" : "scroll-region min-w-0 flex-1 bg-panel p-5"}>
          {focus === "edit" && (
            <>
              <div className="preview-toolbar">
                <div className="seg" role="group" aria-label="预览来源">
                  <button type="button" className={previewMode === "scene" ? "is-on" : ""} aria-pressed={previewMode === "scene"} onClick={() => setPreviewMode("scene")}><EyeIcon />预览当前场景</button>
                  <button type="button" disabled={!asset} className={previewMode === "asset" ? "is-on" : ""} aria-pressed={previewMode === "asset"} onClick={() => setPreviewMode("asset")}><VideoIcon />检视选中素材</button>
                </div>
                <Badge>{previewMode === "asset" && asset ? asset.name : scene ? `场景 ${sceneIndex + 1} · ${labels[scene.kind]}` : "未选择场景"}</Badge>
              </div>
              <div className="preview-stage stage-well">
                {previewMode === "asset" && asset ? <AssetPreview asset={asset} /> : <ScenePreview scene={scene} assets={ctx.assets} locale={session.locale} />}
              </div>
            </>
          )}
          {focus !== "edit" && <div className="mx-auto w-full max-w-[1440px]">
            {focus === "captions" && <CaptionWorkspace />}
            {focus === "sound" && (
              <div className="narrow-content flex flex-col gap-4">
                <div><h2 className="m-0">声音</h2><p className="hint mb-0 mt-1">原声场景无需音色。旁白在画面属性里选择音色版本，也可以使用上传的旁白音频。</p></div>
                <BgmEditor draft={draft} assets={ctx.assets} edit={session.edit} />
              </div>
            )}
            {focus === "plan" && profile && (
              <CreativePlanEditor
                plan={session.planDraft}
                projectTitle={draft.title}
                projectScenes={draft.scenes}
                analysis={ctx.analysis}
                projectDirty={session.dirty}
                planDirty={session.planDirty}
                busy={session.busy}
                onChange={session.editCreativePlan}
                onSave={(next) => void session.saveCreativePlan(next)}
                onApply={() => void session.applyCreativePlan()}
                renderSceneEditor={(item, onChange) => <SceneEditor scene={item} locale={session.locale} assets={ctx.assets} profile={profile} voices={voices} onChange={onChange} />}
              />
            )}
            {focus === "delivery" && <DeliveryPanel />}
          </div>}
        </main>
        {focus === "edit" && <Resizer edge="right" dragging={dragging === "right"} onPointerDown={drag("right")} />}
        {focus === "edit" && (
          <aside className="flex min-h-0 shrink-0 flex-col border-l border-line bg-panel" style={{ width: collapsed.right ? 36 : layout.right }}>
            {collapsed.right ? (
              <div className="collapsed-rail"><PanelButton side="right" collapsed onClick={() => commitLayout({ ...layout, collapsed: { ...layout.collapsed, right: false } })} /></div>
            ) : (
              <>
                <div className="panel-header"><span>属性检视器</span><PanelButton side="right" collapsed={false} onClick={() => commitLayout({ ...layout, collapsed: { ...layout.collapsed, right: true } })} /></div>
                <div className="scroll-region min-h-0 flex-1 p-3">
                  {scene && profile ? (
                    <SceneEditor
                      scene={scene}
                      locale={session.locale}
                      assets={ctx.assets}
                      profile={profile}
                      voices={voices}
                      masks={draft.masks.filter((mask) => mask.sceneId === scene.id)}
                      preview={false}
                      onMasksChange={(masks) => session.edit({ ...draft, masks: [...draft.masks.filter((mask) => mask.sceneId !== scene.id), ...masks] })}
                      onChange={(next) => session.edit({ ...draft, scenes: draft.scenes.map((item, index) => index === sceneIndex ? next : item) })}
                    />
                  ) : asset ? (
                    <div className="subtle-card p-3"><b>{asset.name}</b><small className="numeric mt-1 block">{asset.kind} · 版本 {asset.version.slice(0, 12)}</small></div>
                  ) : <p className="hint text-xs">选择一个场景以编辑视觉、声音、时长与遮罩。</p>}
                </div>
              </>
            )}
          </aside>
        )}
      </div>
      <Resizer edge="bottom" dragging={dragging === "bottom"} onPointerDown={drag("bottom")} />
      <footer className="flex shrink-0 flex-col border-t border-line bg-panel" style={{ height: bottomHeight }}>
        {collapsed.bottom ? (
          <div className="collapsed-rail"><PanelButton side="bottom" collapsed onClick={() => commitLayout({ ...layout, collapsed: { ...layout.collapsed, bottom: false } })} /></div>
        ) : (
          <>
            <div className="panel-header">
              <span>{session.activeRun ? "任务进度" : "故事板"}</span>
              <div className="panel-header-actions">
                {!session.activeRun && focus === "edit" && (["card", "still", "clip"] as const).map((kind) => <Button key={kind} size="sm" variant="ghost" onClick={() => session.addScene(kind)}>+{labels[kind]}</Button>)}
                <PanelButton side="bottom" collapsed={false} onClick={() => commitLayout({ ...layout, collapsed: { ...layout.collapsed, bottom: true } })} />
              </div>
            </div>
            {session.activeRun ? <ActiveRunPanel /> : (
              <div className="storyboard-track">
                {draft.scenes.map((item, index) => (
                  <article key={item.id} className={`storyboard-card ${item.id === sceneId ? "is-on" : ""}`}>
                    <button type="button" className="storyboard-select" onClick={() => selectScene(item.id, focus !== "edit")}>
                      <span className="storyboard-type" data-kind={item.kind} />
                      <span className="storyboard-index">{String(index + 1).padStart(2, "0")}</span>
                      <span className="storyboard-copy"><b>{item.label || labels[item.kind]}</b><small>{sceneSummary(item, session.locale)}</small></span>
                    </button>
                    <div className="storyboard-actions">
                      <Button size="icon" compact variant="ghost" aria-label={`左移场景 ${index + 1}`} disabled={index === 0} onClick={() => moveScene(index, -1)}><ArrowUpIcon className="-rotate-90" /></Button>
                      <Button size="icon" compact variant="ghost" aria-label={`右移场景 ${index + 1}`} disabled={index === draft.scenes.length - 1} onClick={() => moveScene(index, 1)}><ArrowDownIcon className="-rotate-90" /></Button>
                      <Button size="icon" compact variant="ghost" aria-label={`删除场景 ${index + 1}`} onClick={() => session.edit({ ...draft, scenes: draft.scenes.filter((sceneItem) => sceneItem.id !== item.id) })}><TrashIcon /></Button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </>
        )}
      </footer>
      <Modal open={conflictOpen} title="服务器文档对照" onOpenChange={setConflictOpen}>
        <div className="scroll-region max-h-[60vh]"><pre className="code-block">{JSON.stringify(session.conflict?.document, null, 2)}</pre></div>
      </Modal>
      <Modal open={planOpen && session.plan !== null} title="计划与影响" onOpenChange={setPlanOpen}>
        <div className="scroll-region max-h-[60vh]"><pre className="code-block">{JSON.stringify(session.plan, null, 2)}</pre></div>
      </Modal>
    </div>
  );
}

function PanelButton({ side, collapsed, onClick }: { side: "left" | "right" | "bottom"; collapsed: boolean; onClick: () => void }) {
  const labels = { left: "左侧栏", right: "属性栏", bottom: "底部栏" };
  const icons = {
    left: collapsed ? <PanelLeftOpenIcon /> : <PanelLeftCloseIcon />,
    right: collapsed ? <PanelRightOpenIcon /> : <PanelRightCloseIcon />,
    bottom: collapsed ? <PanelBottomOpenIcon /> : <PanelBottomCloseIcon />,
  };
  const label = `${collapsed ? "展开" : "折叠"}${labels[side]}`;
  return <Hint label={label}><Button size="icon" compact variant="ghost" aria-label={label} onClick={onClick}>{icons[side]}</Button></Hint>;
}

function Resizer({ edge, dragging, onPointerDown }: { edge: "left" | "right" | "bottom"; dragging: boolean; onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => void }) {
  const axis = edge === "bottom" ? "y" : "x";
  const label = edge === "left" ? "调整左侧宽度" : edge === "right" ? "调整右侧宽度" : "调整底部高度";
  return <button type="button" aria-label={label} className="workspace-resizer" data-axis={axis} data-dragging={dragging || undefined} onPointerDown={onPointerDown} />;
}

function FieldLocale() {
  const session = useSession();
  if (!session.draft) return null;
  return (
    <label className="flex items-center gap-1">
      <span className="sr-only">编辑语言</span>
      <select className="h-8 w-[58px] px-1 text-xs" aria-label="编辑语言" value={session.locale} onChange={(event) => session.setLocale(event.target.value)}>
        {session.draft.locales.map((locale) => <option key={locale}>{locale}</option>)}
      </select>
    </label>
  );
}

function SceneKindIcon({ kind }: { kind: Scene["kind"] }) {
  return kind === "card" ? <CardIcon /> : kind === "still" ? <ImageIcon /> : <VideoIcon />;
}

function sceneSummary(scene: Scene, locale: string) {
  if (scene.label) return scene.label;
  if (scene.kind === "card") return scene.cardSpec.copy[locale]?.headline || "未填写卡片标题";
  const speech = speechOf(scene);
  return speech?.text[locale] || (scene.kind === "clip" ? `${(scene.sourceRange.durationUs / 1e6).toFixed(2)} 秒` : "静帧场景");
}

function ScenePreview({ scene, assets, locale }: { scene: Scene | null; assets: MediaAssetVersion[]; locale: string }) {
  if (!scene) return <div className="text-center text-sm text-[#aab3c2]">选择场景或新建一个场景开始预览</div>;
  if (scene.kind === "clip") return <SourceWindowPlayer sourceUrl={assetUrl(assets, refKey(scene.source))} sourceKey={refKey(scene.source)} range={scene.sourceRange} label="当前场景预览" />;
  if (scene.kind === "still") return <img className="scene-still m-0 max-h-full object-contain" alt="当前静帧" src={assetUrl(assets, refKey(scene.image)) || ""} />;
  return <div className="scene-preview card m-0 min-h-[280px] border-[#282e39] bg-[#11151d] text-2xl"><b>{scene.cardSpec.copy[locale]?.headline || "卡片"}</b></div>;
}

function AssetPreview({ asset }: { asset: MediaAssetVersion }) {
  if (asset.kind === "video") return <video className="max-h-full rounded-[6px]" controls src={mediaUrl(asset.digest)} />;
  if (asset.kind === "image") return <img className="max-h-full rounded-[6px] object-contain" alt={asset.name} src={mediaUrl(asset.digest)} />;
  if (asset.kind === "audio") return <div className="subtle-card flex items-center gap-4 p-6"><AudioIcon /><audio className="flex-1" controls src={mediaUrl(asset.digest)} /></div>;
  return <a className="flex items-center gap-2 text-[#cbd8ff]" href={mediaUrl(asset.digest)}><FileIcon />读取 {asset.name}</a>;
}

function ActiveRunPanel() {
  const session = useSession();
  const detail = session.runDetail?.run.id === session.activeRun ? session.runDetail : null;
  const total = detail?.nodes.length || 0;
  const completed = detail?.nodes.filter((node) => node.state === "succeeded").length || 0;
  const progress = total ? Math.round(completed / total * 100) : 0;
  return (
    <div className="scroll-region min-h-0 flex-1 p-3">
      {!detail && <p className={session.activeRunError ? "error" : "hint"}>{session.activeRunError || "正在连接作业进度…"}</p>}
      {detail && (
        <div className="flex flex-col gap-3">
          <div className="section-title">
            <div><b>{detail.run.kind}</b><Badge tone={isActiveRun(detail.run.state) ? "accent" : detail.run.state === "succeeded" ? "ok" : "warn"} dot pulse={isActiveRun(detail.run.state)}>{runLabel(detail.run.state)}</Badge><small className="numeric">{completed}/{total} 节点</small></div>
            <div>
              <Button size="sm" disabled={!isActiveRun(detail.run.state)} onClick={() => void session.act(async () => { await apiCancel(detail.run.id); notifyRunsChanged(); await session.reload(); })}>取消</Button>
              <Button size="sm" disabled={!RESUMABLE_RUN_STATES.has(detail.run.state)} onClick={() => void session.act(async () => {
                const resumed = await api(`/runs/${detail.run.id}/resume`, RunRecord, { method: "POST", body: {} });
                session.setActiveRun(resumed.id);
                session.retryActiveRun();
                notifyRunsChanged();
                await session.reload();
              })}>恢复未完成步骤</Button>
              {detail.run.kind === "analyze" && detail.run.state === "succeeded" && <Button size="sm" disabled={session.busy || session.dirty} onClick={() => void session.adoptAnalysisCaptions({ runId: detail.run.id, locale: session.locale })}>采用此次分析结果为字幕</Button>}
            </div>
          </div>
          <div className="run-progress" aria-label={`作业进度 ${progress}%`}><span style={{ width: `${progress}%` }} /></div>
          {detail.run.error && <p className="error m-0">{detail.run.error.message}</p>}
          {session.activeRunError && <p className="error m-0">{session.activeRunError}</p>}
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {detail.nodes.map((node) => <div className="subtle-card flex items-center gap-2 px-3 py-2" key={node.key}><Badge tone={node.state === "succeeded" ? "ok" : isActiveRun(node.state) ? "accent" : "neutral"}>{runLabel(node.state)}</Badge><span className="min-w-0 flex-1 truncate text-xs">{node.key}</span><small className="numeric">尝试 {node.attempts}</small></div>)}
          </div>
          <details><summary>原始事件</summary><pre className="code-block mt-2 max-h-36">{JSON.stringify(session.events, null, 2)}</pre></details>
        </div>
      )}
    </div>
  );
}

function assetUrl(assets: MediaAssetVersion[], key: string) {
  const asset = assets.find((item) => refKey(item) === key);
  return asset ? mediaUrl(asset.digest) : undefined;
}

async function apiCancel(runId: string) {
  if (!runId) return;
  await api(`/runs/${runId}/cancel`, RunRecord, { method: "POST", body: {} });
}
