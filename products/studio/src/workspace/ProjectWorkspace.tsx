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
import { Hint } from "../ui/Hint";
import { ProjectGuidance, type GuidanceTarget } from "./ProjectGuidance";
import { ConflictReviewDialog, ProjectReviewDialog } from "./ReviewPanels";
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
type BottomMode = "storyboard" | "run";

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
  const [bottomMode, setBottomMode] = useState<BottomMode>("storyboard");
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
  const revisionDetail = [
    revisionState.label,
    `本地基线：${session.base || "尚未建立"}`,
    `服务器版本：${ctx.revision.id}`,
  ].join("；");
  const currentRun =
    session.runDetail?.run.id === session.activeRun
      ? session.runDetail.run
      : null;
  const completedBuild =
    currentRun?.kind === "build" && currentRun.state === "succeeded";
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
  const showLeft = (mode: LeftMode) => {
    setFocus("edit");
    setLeftMode(mode);
    if (layout.collapsed.left) {
      commitLayout({
        ...layout,
        collapsed: { ...layout.collapsed, left: false },
      });
    }
  };
  const showBottom = (mode: BottomMode) => {
    setBottomMode(mode);
    if (layout.collapsed.bottom) {
      commitLayout({
        ...layout,
        collapsed: { ...layout.collapsed, bottom: false },
      });
    }
  };
  const navigateGuidance = (target: GuidanceTarget) => {
    if (target === "assets" || target === "scenes" || target === "evidence") {
      showLeft(target);
      return;
    }
    setFocus(target);
  };
  const addSceneFromUi = (kind: Scene["kind"]) => {
    const hasAsset =
      kind === "card" ||
      (kind === "still"
        ? ctx.assets.some((item) => item.kind === "image")
        : ctx.assets.some((item) => item.kind === "video"));
    if (!hasAsset) {
      showLeft("assets");
      session.setNotice(
        kind === "still"
          ? "还没有静帧素材。请先导入图片，再回到场景添加静帧。"
          : "还没有视频素材。请先导入视频，再回到场景添加视频片段。",
      );
      return;
    }
    setFocus("edit");
    session.addScene(kind);
  };
  const buildNow = async () => {
    if (await session.saveAndBuild()) showBottom("run");
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
          <Badge tone={revisionState.tone} dot title={revisionDetail}>
            {revisionState.label}
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
            <MenuItem disabled={!session.activeRun} onSelect={() => showBottom("run")}>查看当前任务</MenuItem>
            <MenuItem onSelect={() => void session.copyBrief()}><span className="flex items-center gap-2"><CopyIcon />复制给 agent</span></MenuItem>
          </Menu>
          <Button
            size="sm"
            emphasized={session.dirty || session.planDirty}
            disabled={session.busy || (!session.dirty && !session.planDirty)}
            title={
              session.busy
                ? "正在处理当前操作"
                : !session.dirty && !session.planDirty
                  ? "项目与方案都已保存"
                  : "保存项目草稿和创作方案"
            }
            onClick={() => void session.saveAll()}
          >
            <SaveIcon />{session.busy ? "处理中…" : "保存"}
          </Button>
          <Button
            size="sm"
            variant="primary"
            disabled={session.busy || !draft.scenes.length}
            title={
              session.busy
                ? "正在保存或制作，请等待当前操作完成"
                : !draft.scenes.length
                  ? "先添加至少一个场景再制作"
                  : session.dirty || session.planDirty
                    ? "点击后会保存项目草稿和创作方案，再提交制作"
                    : "使用已保存内容提交制作"
            }
            onClick={() => void buildNow()}
          >
            {session.dirty || session.planDirty ? "保存并制作" : "制作"}
          </Button>
        </div>
      </header>
      <ProjectGuidance workflowId={draft.workflow} onNavigate={navigateGuidance} />
      {completedBuild && (
        <div
          className="flex flex-wrap items-center gap-2 border-b border-ok/30 bg-ok/10 px-3 py-2 text-xs text-ok"
          role="status"
        >
          <span className="min-w-0 flex-1">
            制作完成，成片已进入交付列表。
          </span>
          <Button size="sm" onClick={() => setFocus("delivery")}>查看交付</Button>
          <Button size="sm" variant="ghost" onClick={() => showBottom("run")}>查看任务</Button>
        </div>
      )}
      {session.conflict && (
        <div className="workspace-banner" role="alert">
          <AlertIcon className="shrink-0" />
          <span className="workspace-banner-copy">
            另一处已经更新了这个项目。你的本地草稿仍保留，请先查看差异再决定加载服务器内容。
          </span>
          <Button size="sm" onClick={() => setConflictOpen(true)}>查看差异</Button>
          <Button size="sm" onClick={session.loadServerKeepingDraft}>保留我的草稿并加载服务器内容</Button>
        </div>
      )}
      {session.storedDraft && (
        <div className="workspace-banner">
          <AlertIcon className="shrink-0" />
          <span className="workspace-banner-copy">
            找到了上次未完成的草稿备份。恢复后会先检查项目是否在别处更新，不会直接覆盖服务器内容。
          </span>
          <Button size="sm" onClick={() => session.storedDraft && void session.restoreDraft(session.storedDraft)}>恢复未完成草稿</Button>
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
                          <Button key={kind} size="sm" variant="ghost" onClick={() => addSceneFromUi(kind)}><PlusIcon />{labels[kind]}</Button>
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
            {focus === "sound" && <SoundWorkspace sceneId={sceneId} onSelect={setSceneId} />}
            {focus === "plan" && profile && (
              <CreativePlanEditor
                projectId={draft.id}
                plan={session.planDraft}
                projectTitle={draft.title}
                projectScenes={draft.scenes}
                analysis={ctx.analysis}
                projectDirty={session.dirty}
                planDirty={session.planDirty}
                busy={session.busy}
                onChange={session.editCreativePlan}
                onSave={() => void session.saveAll()}
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
              <div className="seg" role="tablist" aria-label="底部工作区">
                <button
                  type="button"
                  role="tab"
                  aria-selected={bottomMode === "storyboard"}
                  className={bottomMode === "storyboard" ? "is-on" : ""}
                  onClick={() => setBottomMode("storyboard")}
                >
                  故事板
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={bottomMode === "run"}
                  className={bottomMode === "run" ? "is-on" : ""}
                  onClick={() => setBottomMode("run")}
                >
                  任务{session.activeRun ? currentRun ? ` · ${runLabel(currentRun.state)}` : "进度" : "（暂无）"}
                </button>
              </div>
              <div className="panel-header-actions">
                {bottomMode === "storyboard" && (
                  <>
                    {focus !== "edit" && <Button size="sm" variant="ghost" onClick={() => setFocus("edit")}>返回故事板</Button>}
                    {(focus === "edit" && width >= 900 ? (["card", "still", "clip"] as const) : []).map((kind) => <Button key={kind} size="sm" variant="ghost" onClick={() => addSceneFromUi(kind)}>+{labels[kind]}</Button>)}
                  </>
                )}
                {bottomMode === "run" && <Button size="sm" variant="ghost" onClick={() => setBottomMode("storyboard")}>返回故事板</Button>}
                <PanelButton side="bottom" collapsed={false} onClick={() => commitLayout({ ...layout, collapsed: { ...layout.collapsed, bottom: true } })} />
              </div>
            </div>
            {bottomMode === "run" ? (
              session.activeRun ? <ActiveRunPanel /> : (
                <div className="scroll-region min-h-0 flex-1 p-3">
                  <p className="hint m-0 text-xs">还没有当前任务。使用“保存并制作”提交后会在这里显示进度、失败建议和完成结果。</p>
                </div>
              )
            ) : (
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
                {!draft.scenes.length && (
                  <EmptyStoryboard onAdd={addSceneFromUi} onOpenAssets={() => showLeft("assets")} />
                )}
              </div>
            )}
          </>
        )}
      </footer>
      <ConflictReviewDialog
        open={conflictOpen}
        onOpenChange={setConflictOpen}
        local={session.planDirty ? { ...draft, creativePlan: session.planDraft || undefined } : draft}
        server={session.conflict?.document || null}
      />
      <ProjectReviewDialog
        open={planOpen && session.plan !== null}
        onOpenChange={setPlanOpen}
        value={session.plan}
      />
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

function EmptyStoryboard({
  onAdd,
  onOpenAssets,
}: {
  onAdd: (kind: Scene["kind"]) => void;
  onOpenAssets: () => void;
}) {
  return (
    <article
      className="storyboard-card min-h-24"
      style={{ width: "min(620px, calc(100vw - 48px))" }}
    >
      <div className="flex flex-1 flex-col justify-center gap-3 p-4">
        <div>
          <b>从第一种画面开始</b>
          <p className="hint mb-0 mt-1 text-xs">
            卡片可以直接填写文字。静帧和视频片段需要对应素材；缺少素材时会打开素材区提示。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="primary" onClick={() => onAdd("card")}>
            <PlusIcon />添加卡片（无需素材）
          </Button>
          <Button size="sm" onClick={() => onAdd("still")}>
            <PlusIcon />添加静帧
          </Button>
          <Button size="sm" onClick={() => onAdd("clip")}>
            <PlusIcon />添加视频片段
          </Button>
          <Button size="sm" variant="ghost" onClick={onOpenAssets}>先导入素材</Button>
        </div>
      </div>
    </article>
  );
}

function SoundWorkspace({
  sceneId,
  onSelect,
}: {
  sceneId: string;
  onSelect: (sceneId: string) => void;
}) {
  const session = useSession();
  const draft = session.draft;
  const ctx = session.ctx;
  if (!draft || !ctx) return null;
  const profile = draft.profiles[0];
  const scene = draft.scenes.find((item) => item.id === sceneId) || draft.scenes[0];
  const sceneIndex = scene
    ? draft.scenes.findIndex((item) => item.id === scene.id)
    : -1;
  const voices = [...session.library, ...ctx.library].filter(
    (value, index, values) =>
      value.payload.kind === "voice" &&
      values.findIndex(
        (candidate) =>
          candidate.itemId === value.itemId &&
          candidate.version === value.version,
      ) === index,
  );
  return (
    <div className="narrow-content flex flex-col gap-4">
      <div>
        <h2 className="m-0">声音</h2>
        <p className="hint mb-0 mt-1">
          逐场调整原声、旁白与混音。音色参考和已上传旁白可以直接试听。
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(260px,0.8fr)_minmax(360px,1.2fr)]">
        <section className="panel-card p-3" aria-labelledby="scene-sound-list-title">
          <div className="section-title mb-2">
            <b id="scene-sound-list-title">逐场声音</b>
            <Badge>{draft.scenes.length}</Badge>
          </div>
          <div className="flex flex-col gap-2">
            {draft.scenes.map((item, index) => (
              <button
                key={item.id}
                type="button"
                className={`row-item ${item.id === scene?.id ? "is-on" : ""}`}
                onClick={() => onSelect(item.id)}
              >
                <span className="storyboard-index">{String(index + 1).padStart(2, "0")}</span>
                <SceneKindIcon kind={item.kind} />
                <span className="row-item-copy">
                  <b>{item.label || labels[item.kind]}</b>
                  <small>{soundSummary(item, session.locale)}</small>
                </span>
              </button>
            ))}
            {!draft.scenes.length && (
              <p className="hint m-0 text-xs">添加场景后，这里会显示每一场的声音来源。</p>
            )}
          </div>
        </section>
        <div className="flex flex-col gap-4">
          {scene && profile ? (
            <section className="panel-card p-4" aria-labelledby="selected-sound-title">
              <div className="section-title mb-3">
                <div>
                  <h3 id="selected-sound-title" className="m-0">
                    场景 {sceneIndex + 1} · {scene.label || labels[scene.kind]}
                  </h3>
                  <small>{soundSummary(scene, session.locale)}</small>
                </div>
                <Badge tone="accent">编辑这一场的声音</Badge>
              </div>
              <SceneEditor
                scene={scene}
                locale={session.locale}
                assets={ctx.assets}
                profile={profile}
                voices={voices}
                section="sound"
                onChange={(next) =>
                  session.edit({
                    ...draft,
                    scenes: draft.scenes.map((item) =>
                      item.id === scene.id ? next : item,
                    ),
                  })
                }
              />
            </section>
          ) : (
            <div className="subtle-card p-6 text-center">
              <b>还没有可设置声音的场景</b>
              <p className="hint mb-0 mt-1 text-xs">先添加卡片、静帧或视频片段。</p>
            </div>
          )}
          <section className="panel-card p-4" aria-labelledby="background-music-title">
            <div className="mb-3">
              <h3 id="background-music-title" className="m-0">全片背景音乐</h3>
              <p className="hint mb-0 mt-1 text-xs">背景音乐独立于原声和各场旁白。</p>
            </div>
            <BgmEditor draft={draft} assets={ctx.assets} edit={session.edit} />
          </section>
        </div>
      </div>
    </div>
  );
}

function soundSummary(scene: Scene, locale: string) {
  if (scene.kind === "clip") {
    if (scene.playback.audio.kind === "silent") return "静音";
    if (scene.playback.audio.kind === "original") {
      return "保留原声，不需要音色";
    }
  }
  const speech = speechOf(scene);
  if (!speech) return "没有旁白";
  if (speech.kind === "imported") {
    return speech.audio[locale] ? "上传的旁白音频" : "上传旁白（当前语言尚未选择音频）";
  }
  const text = speech.text[locale]?.trim();
  const voice = speech.voice[locale];
  if (!text) return "旁白文案尚未填写";
  return voice ? "文案与已选音色" : "文案已填写，尚未选择音色";
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
          {detail.run.error && (
            <div className="subtle-card border-danger/30 bg-danger/5 p-3">
              <p className="error m-0">{detail.run.error.message}</p>
              {detail.run.error.hints.length > 0 && (
                <ul className="mb-0 mt-2 pl-5 text-xs text-muted">
                  {detail.run.error.hints.map((hint) => <li key={hint}>{hint}</li>)}
                </ul>
              )}
            </div>
          )}
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
