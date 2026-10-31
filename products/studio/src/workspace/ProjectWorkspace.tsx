import { useEffect, useRef, useState } from "react";
import { api, mediaUrl, requestId } from "../api";
import { RunRecord, refKey, type MediaAssetVersion } from "@lightweaver/weaver/contracts";

import { AssetPanel } from "../assets/AssetPanel";
import { EvidencePanel } from "../assets/EvidencePanel";
import { CaptionWorkspace } from "../captions/CaptionWorkspace";
import type { LayoutPreference } from "../desktop";
import { DeliveryPanel } from "../delivery/DeliveryPanel";
import { labels, runLabel } from "../domain/format";
import { isActiveRun, RESUMABLE_RUN_STATES } from "../domain/run";
import { BgmEditor } from "../library/BgmEditor";
import { CreativePlanEditor } from "../library/CreativePlanEditor";
import { useSession } from "../session/context";
import { SceneEditor } from "../scenes/SceneEditor";
import { SourceWindowPlayer } from "../scenes/SourceWindowPlayer";
import { Menu, MenuItem } from "../ui/Menu";

type Focus = "edit" | "captions" | "sound" | "plan" | "delivery";
type LeftMode = "assets" | "evidence" | "scenes";

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
  const [width, setWidth] = useState(() => window.innerWidth);
  const [live, setLive] = useState<LayoutPreference | null>(null);
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
    if (!draft) return;
    if (!draft.scenes.some((scene) => scene.id === sceneId)) setSceneId(draft.scenes[0]?.id || "");
  }, [draft, sceneId]);

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
    const start = edge === "bottom" ? event.clientY : event.clientX;
    const initial = layout[edge];
    const move = (pointer: PointerEvent) => {
      const delta = edge === "left" ? pointer.clientX - start : edge === "right" ? start - pointer.clientX : start - pointer.clientY;
      setLive({ ...layout, [edge]: initial + delta, collapsed: { ...layout.collapsed, [edge]: false } });
    };
    const up = (pointer: PointerEvent) => {
      const delta = edge === "left" ? pointer.clientX - start : edge === "right" ? start - pointer.clientX : start - pointer.clientY;
      commitLayout({ ...layout, [edge]: initial + delta, collapsed: { ...layout.collapsed, [edge]: false } });
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
        <label className="min-w-48 flex-1">
          <span className="sr-only">项目名</span>
          <input className="border-0 bg-transparent px-0 text-base font-semibold shadow-none" value={draft.title} aria-label="项目名" onChange={(event) => session.edit({ ...draft, title: event.target.value })} />
        </label>
        <small className="text-muted">
          修订 {session.base.slice(0, 12) || "未加载"}
          {ctx.revision.id !== session.base ? " · 服务器有新修订" : ""}
          {session.dirty || session.planDirty ? " · 未保存草稿" : " · 已保存"}
        </small>
        <button type="button" className="primary" disabled={session.busy || !session.dirty} onClick={() => void session.save()}>
          保存
        </button>
        <button
          type="button"
          className="primary"
          disabled={session.dirty || session.busy}
          onClick={() => void session.act(() => session.submitJob(`/projects/${draft.id}/build`, { requestId: requestId() }))}
        >
          制作
        </button>
        <Menu label="交付">
          <MenuItem onSelect={() => setFocus("delivery")}>打开交付区</MenuItem>
          <MenuItem onSelect={() => void session.act(() => session.showPlan(`/projects/${draft.id}/impact`, { document: draft }))}>
            查看影响
          </MenuItem>
        </Menu>
        <Menu label="更多">
          <MenuItem onSelect={() => void session.copyBrief()}>复制给 agent</MenuItem>
          <MenuItem
            onSelect={() => void session.act(() => session.showPlan(`/projects/${draft.id}/plan`, { requestId: requestId() }))}
            disabled={session.dirty}
          >
            检查制作计划
          </MenuItem>
        </Menu>
        <div className="seg" role="tablist" aria-label="工作区">
          {(
            [
              ["edit", "画面"],
              ["captions", "字幕"],
              ["sound", "声音"],
              ["plan", "方案"],
              ["delivery", "交付"],
            ] as const
          ).map(([key, label]) => (
            <button key={key} type="button" role="tab" aria-selected={focus === key} className={focus === key ? "is-on" : ""} onClick={() => setFocus(key)}>
              {label}
            </button>
          ))}
        </div>
      </header>
      {session.conflict && (
        <div className="border-b border-line bg-warn-bg px-3 py-2 text-warn">
          <b>修订冲突，未覆盖服务器内容。</b>
          <p>当前服务器修订 {session.conflict.id}；你的草稿已保留。</p>
          <details>
            <summary>对照服务器内容</summary>
            <pre>{JSON.stringify(session.conflict.document, null, 2)}</pre>
          </details>
          <button type="button" onClick={session.loadServerKeepingDraft}>
            保留草稿并加载当前修订
          </button>
        </div>
      )}
      {session.storedDraft && (
        <div className="flex flex-wrap items-center gap-2 border-b border-line bg-warn-bg px-3 py-2 text-warn">
          <span>这个项目有可恢复草稿，基线仍是保存时的修订。</span>
          <button type="button" onClick={() => session.storedDraft && void session.restoreDraft(session.storedDraft)}>
            恢复草稿
          </button>
          <button type="button" onClick={session.clearStoredDraft}>
            清除备份
          </button>
        </div>
      )}
      <div className="flex min-h-0 flex-1">
        <aside className="flex min-h-0 shrink-0 flex-col border-r border-line" style={{ width: collapsed.left ? 52 : layout.left }}>
          <button
            type="button"
            aria-label={collapsed.left ? "展开左侧栏" : "折叠左侧栏"}
            onClick={() => commitLayout({ ...layout, collapsed: { ...layout.collapsed, left: !layout.collapsed.left } })}
          >
            {collapsed.left ? ">" : "<"}
          </button>
          {!collapsed.left && (
            <div className="min-h-0 flex-1 overflow-auto p-2">
              <div className="seg mb-3 w-full">
                {(
                  [
                    ["assets", "素材"],
                    ["evidence", "证据"],
                    ["scenes", "场景"],
                  ] as const
                ).map(([key, label]) => (
                  <button key={key} type="button" className={`min-w-0 flex-1 ${leftMode === key ? "is-on" : ""}`} onClick={() => setLeftMode(key)}>
                    {label}
                  </button>
                ))}
              </div>
              {leftMode === "assets" && <AssetPanel selectedKey={assetKey} onSelect={setAssetKey} />}
              {leftMode === "evidence" && <EvidencePanel />}
              {leftMode === "scenes" && (
                <div>
                  <div className="actions">
                    {(["card", "still", "clip"] as const).map((kind) => (
                      <button key={kind} type="button" onClick={() => session.addScene(kind)}>
                        ＋{labels[kind]}
                      </button>
                    ))}
                  </div>
                  {draft.scenes.map((item, index) => (
                    <button
                      key={item.id}
                      type="button"
                      className={`row-item my-0.5 w-full text-left ${item.id === sceneId ? "is-on" : ""}`}
                      onClick={() => setSceneId(item.id)}
                    >
                      {index + 1}. {labels[item.kind]} {item.label || ""}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </aside>
        <button type="button" aria-label="调整左侧宽度" className="w-1 cursor-col-resize border-0 bg-line p-0" onPointerDown={drag("left")} />
        <main className="min-w-0 flex-1 overflow-auto bg-panel p-4">
          {focus === "edit" && scene?.kind === "clip" && (
            <SourceWindowPlayer sourceUrl={assetUrl(ctx.assets, refKey(scene.source))} sourceKey={refKey(scene.source)} range={scene.sourceRange} label="当前片段" />
          )}
          {focus === "edit" && scene?.kind === "still" && (
            <img className="scene-still" alt="当前静帧" src={assetUrl(ctx.assets, refKey(scene.image)) || ""} />
          )}
          {focus === "edit" && scene?.kind === "card" && (
            <div className="scene-preview card stage-well">
              <b>{scene.cardSpec.copy[session.locale]?.headline || "卡片"}</b>
            </div>
          )}
          {focus === "edit" && leftMode === "assets" && asset && (
            asset.kind === "video" ? <video controls src={mediaUrl(asset.digest)} /> : asset.kind === "image" ? <img alt={asset.name} src={mediaUrl(asset.digest)} /> : asset.kind === "audio" ? <audio controls src={mediaUrl(asset.digest)} /> : <a href={mediaUrl(asset.digest)}>读取文件</a>
          )}
          {focus === "captions" && <CaptionWorkspace />}
          {focus === "sound" && (
            <>
              <p>原声场景无需音色。旁白在画面属性里选择音色版本，也可以使用上传的旁白音频。</p>
              <BgmEditor draft={draft} assets={ctx.assets} edit={session.edit} />
            </>
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
              renderSceneEditor={(item, onChange) => (
                <SceneEditor scene={item} locale={session.locale} assets={ctx.assets} profile={profile} voices={voices} onChange={onChange} />
              )}
            />
          )}
          {focus === "delivery" && <DeliveryPanel />}
          {session.plan !== null && focus !== "delivery" && (
            <details>
              <summary>计划与影响</summary>
              <pre>{JSON.stringify(session.plan, null, 2)}</pre>
            </details>
          )}
        </main>
        <button type="button" aria-label="调整右侧宽度" className="w-1 cursor-col-resize border-0 bg-line p-0" onPointerDown={drag("right")} />
        <aside className="min-h-0 shrink-0 overflow-auto border-l border-line bg-panel p-2" style={{ width: collapsed.right ? 44 : layout.right }}>
          <button
            type="button"
            aria-label={collapsed.right ? "展开属性" : "折叠属性"}
            onClick={() => commitLayout({ ...layout, collapsed: { ...layout.collapsed, right: !layout.collapsed.right } })}
          >
            属性
          </button>
          {!collapsed.right && focus === "edit" && scene && profile && (
            <>
              <FieldLocale />
              <SceneEditor
                scene={scene}
                locale={session.locale}
                assets={ctx.assets}
                profile={profile}
                voices={voices}
                masks={draft.masks.filter((mask) => mask.sceneId === scene.id)}
                preview={false}
                onMasksChange={(masks) =>
                  session.edit({
                    ...draft,
                    masks: [...draft.masks.filter((mask) => mask.sceneId !== scene.id), ...masks],
                  })
                }
                onChange={(next) => session.edit({ ...draft, scenes: draft.scenes.map((item, index) => (index === sceneIndex ? next : item)) })}
              />
            </>
          )}
          {!collapsed.right && focus === "edit" && !scene && asset && (
            <div>
              <b>{asset.name}</b>
              <small>
                {asset.kind} · 版本 {asset.version.slice(0, 12)} · {asset.digest.slice(0, 12)}
              </small>
            </div>
          )}
          {!collapsed.right && focus !== "edit" && <p className="hint">当前任务的详细字段在中央区域。这里保留选中项的摘要。</p>}
        </aside>
      </div>
      <button type="button" aria-label="调整底部高度" className="h-1 cursor-row-resize border-0 bg-line p-0" onPointerDown={drag("bottom")} />
      <footer className="shrink-0 overflow-auto border-t border-line bg-panel" style={{ height: collapsed.bottom ? 36 : layout.bottom }}>
        <button
          type="button"
          aria-label={collapsed.bottom ? "展开底部栏" : "折叠底部栏"}
          onClick={() => commitLayout({ ...layout, collapsed: { ...layout.collapsed, bottom: !layout.collapsed.bottom } })}
        >
          {session.activeRun ? "任务进度" : focus === "captions" ? "字幕时间" : "场景顺序"}
        </button>
        {!collapsed.bottom && (
          <div className="flex gap-2 overflow-auto px-2 pb-2">
            {session.activeRun &&
              session.activeRunError &&
              session.runDetail?.run.id !== session.activeRun && (
                <p className="error">{session.activeRunError}</p>
              )}
            {session.activeRun && session.runDetail?.run.id === session.activeRun && (
              <div>
                <b>
                  {session.runDetail.run.kind} · {runLabel(session.runDetail.run.state)}
                </b>
                {session.runDetail.run.error && <p className="error">{session.runDetail.run.error.message}</p>}
                {session.activeRunError && <p className="error">{session.activeRunError}</p>}
                <div className="actions">
                  <button
                    type="button"
                    disabled={!isActiveRun(session.runDetail.run.state)}
                    onClick={() =>
                      void session.act(async () => {
                        await apiCancel(session.runDetail?.run.id || "");
                        await session.reload();
                      })
                    }
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    disabled={!RESUMABLE_RUN_STATES.has(session.runDetail.run.state)}
                    onClick={() =>
                      void session.act(async () => {
                        const runId = session.runDetail?.run.id;
                        if (!runId) return;
                        const resumed = await api(`/runs/${runId}/resume`, RunRecord, {
                          method: "POST",
                          body: {},
                        });
                        session.setActiveRun(resumed.id);
                        session.retryActiveRun();
                        await session.reload();
                      })
                    }
                  >
                    恢复未完成步骤
                  </button>
                  {session.runDetail.run.kind === "analyze" && session.runDetail.run.state === "succeeded" && (
                    <button
                      type="button"
                      disabled={session.busy || session.dirty}
                      onClick={() => void session.adoptAnalysisCaptions({ runId: session.runDetail?.run.id, locale: session.locale })}
                    >
                      采用此次分析结果为字幕
                    </button>
                  )}
                </div>
                <details>
                  <summary>原始事件</summary>
                  <pre>{JSON.stringify(session.events, null, 2)}</pre>
                </details>
              </div>
            )}
            {draft.scenes.map((item, index) => (
              <div key={item.id} className="flex items-center gap-1">
                <button type="button" onClick={() => setSceneId(item.id)}>
                  {index + 1}. {labels[item.kind]}
                </button>
                <button
                  type="button"
                  aria-label={`上移场景 ${index + 1}`}
                  disabled={index === 0}
                  onClick={() => {
                    const scenes = [...draft.scenes];
                    const previous = scenes[index - 1];
                    const current = scenes[index];
                    if (!previous || !current) return;
                    scenes[index - 1] = current;
                    scenes[index] = previous;
                    session.edit({ ...draft, scenes });
                  }}
                >
                  上移
                </button>
                <button
                  type="button"
                  aria-label={`删除场景 ${index + 1}`}
                  onClick={() => session.edit({ ...draft, scenes: draft.scenes.filter((sceneItem) => sceneItem.id !== item.id) })}
                >
                  删除
                </button>
              </div>
            ))}
          </div>
        )}
      </footer>
    </div>
  );
}

function assetUrl(assets: MediaAssetVersion[], key: string) {
  const asset = assets.find((item) => refKey(item) === key);
  return asset ? mediaUrl(asset.digest) : undefined;
}

function FieldLocale() {
  const session = useSession();
  if (!session.draft) return null;
  return (
    <label className="field">
      <span>编辑语言</span>
      <select value={session.locale} onChange={(event) => session.setLocale(event.target.value)}>
        {session.draft.locales.map((locale) => (
          <option key={locale}>{locale}</option>
        ))}
      </select>
    </label>
  );
}

async function apiCancel(runId: string) {
  if (!runId) return;
  await api(`/runs/${runId}/cancel`, RunRecord, { method: "POST", body: {} });
}
