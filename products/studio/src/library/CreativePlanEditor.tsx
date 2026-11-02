import { useLayoutEffect, useRef, useState } from "react";
import { CreativePlan, Scene, refKey, z } from "@lightweaver/weaver/contracts";
import { MICROS_PER_SECOND } from "../domain/time";
import type { ReviewAnalysisEntry } from "../domain/context";
import { Field } from "../ui/Field";
import { ViewHeader } from "../ui/ViewHeader";
import { Button } from "../ui/Button";
import { Badge } from "../ui/Badge";
import { NativeSelect } from "../ui/NativeSelect";

type CreativePlanValue = z.infer<typeof CreativePlan>;

const sceneLabels: Record<string, string> = {
  card: "卡片",
  still: "静帧",
  clip: "视频片段",
};

export function CreativePlanEditor({
  projectId,
  plan,
  projectTitle,
  projectScenes,
  analysis,
  projectDirty,
  planDirty,
  busy,
  onChange,
  onSave,
  onApply,
  renderSceneEditor,
}: {
  projectId: string;
  plan: CreativePlanValue | null;
  projectTitle: string;
  projectScenes: Scene[];
  analysis: ReviewAnalysisEntry[];
  projectDirty: boolean;
  planDirty: boolean;
  busy: boolean;
  onChange: (plan: CreativePlanValue) => void;
  onSave: () => void;
  onApply: () => void;
  renderSceneEditor: (
    scene: Scene,
    onChange: (scene: Scene) => void,
  ) => React.ReactNode;
}) {
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState("");
  const [importingFile, setImportingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importSequence = useRef(0);
  const editSequence = useRef(0);
  const projectIdRef = useRef(projectId);
  const planRef = useRef(plan);
  projectIdRef.current = projectId;
  planRef.current = plan;

  useLayoutEffect(() => {
    importSequence.current += 1;
    editSequence.current += 1;
    setImportText("");
    setImportError("");
    setImportingFile(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
    return () => {
      importSequence.current += 1;
      editSequence.current += 1;
    };
  }, [projectId]);

  const changePlan = (next: CreativePlanValue) => {
    editSequence.current += 1;
    planRef.current = next;
    onChange(next);
  };
  const parseIssues = (error: z.ZodError) =>
    error.issues.slice(0, 4).map((issue) => {
      const path = issue.path.length ? issue.path.join(".") : "方案";
      return `${path}：${issue.message}`;
    });
  const applyRawPlan = (body: string) => {
    let raw: unknown;
    try {
      raw = JSON.parse(body);
    } catch {
      setImportError("方案不是有效 JSON");
      return false;
    }
    const parsed = CreativePlan.safeParse(raw);
    if (!parsed.success) {
      setImportError(parseIssues(parsed.error).join("\n"));
      return false;
    }
    setImportError("");
    changePlan(parsed.data);
    return true;
  };
  const importFile = async (file: File) => {
    const operation = ++importSequence.current;
    const capturedProjectId = projectIdRef.current;
    const capturedPlan = planRef.current;
    const capturedEditSequence = editSequence.current;
    const isCurrent = () => operation === importSequence.current && capturedProjectId === projectIdRef.current;
    setImportingFile(true);
    setImportError("");
    try {
      const body = await file.text();
      if (!isCurrent()) return;
      if (
        capturedPlan !== planRef.current ||
        capturedEditSequence !== editSequence.current
      ) {
        setImportError("读取文件期间方案已经变化，已保留当前内容，请重新导入");
        return;
      }
      if (applyRawPlan(body)) setImportText(body);
    } catch {
      if (isCurrent()) setImportError("读取方案文件失败，请重新选择文件");
    } finally {
      if (isCurrent()) setImportingFile(false);
    }
  };
  const evidenceForScene = (
    scene: Scene,
  ): CreativePlanValue["beats"][number]["evidence"] => {
    if (scene.kind !== "clip") return [];
    const sceneEnd = scene.sourceRange.startUs + scene.sourceRange.durationUs;
    return analysis
      .filter(
        (entry) =>
          entry.state === "current" &&
          refKey(entry.source) === refKey(scene.source) &&
          entry.range.startUs <= scene.sourceRange.startUs &&
          entry.range.startUs + entry.range.durationUs >= sceneEnd,
      )
      .slice(0, 3)
      .map((entry) => ({
        analysisId: entry.id,
        source: entry.source,
        range: entry.range,
      }));
  };
  const createFromScenes = () => {
    if (!projectScenes.length) return;
    const parsed = CreativePlan.safeParse({
      title: projectTitle.trim() || "新创作方案",
      summary: "",
      beats: projectScenes.map((scene) => ({
        scene,
        rationale: "",
        evidence: evidenceForScene(scene),
      })),
    });
    if (!parsed.success) {
      setImportError(parsed.error.issues[0]?.message || "无法建立创作方案");
      return;
    }
    setImportError("");
    changePlan(parsed.data);
  };
  const importPlan = () => {
    applyRawPlan(importText);
  };
  return (
    <div className="flex flex-col gap-4">
      <ViewHeader
        title="创作方案蓝图"
        description="方案是随项目修订保存的创作草案。只有点击“应用到当前场景”后，方案节拍才会成为可独立编辑的场景，之后不会自动同步。"
        actions={<small className="hint">建立 / 导入 → 保存蓝图 → 应用到场景</small>}
      />
      {plan && (
        <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 border-y border-line bg-panel px-5 py-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Badge tone={planDirty ? "warn" : "ok"} dot>{planDirty ? "方案未保存" : "蓝图已保存"}</Badge>
            {projectDirty && <small>先保存项目草稿，再保存或应用方案。</small>}
          </div>
          <div className="actions">
            <Button
              variant="primary"
              disabled={busy || projectDirty || !planDirty}
              onClick={onSave}
            >
              保存方案蓝图
            </Button>
            <Button
              disabled={
                busy || projectDirty || planDirty || !plan.beats.length
              }
              onClick={onApply}
            >
              应用到当前场景
            </Button>
          </div>
        </div>
      )}
      <details className="border-t border-line pt-3" open={!plan}>
        <summary className="text-[13px] font-semibold text-ink">建立或导入方案</summary>
        {projectDirty && <p className="hint mb-0 mt-1 text-xs">先保存当前项目草稿，再建立或导入方案。</p>}
        <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-2">
            <b className="text-xs">从当前场景建立</b>
            <p className="hint m-0 text-xs">
              用项目现有 {projectScenes.length} 个场景建立草案，保留画面与旁白，再逐节拍审核。
            </p>
            <div className="actions">
              <Button
                disabled={busy || projectDirty || !projectScenes.length}
                onClick={createFromScenes}
              >
                从当前场景建立方案
              </Button>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <b className="text-xs">从 agent 导入</b>
            <p className="hint m-0 text-xs">
              文件会按当前方案合同校验，并且只载入到当前项目。
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              className="sr-only"
              aria-label="导入创作方案 JSON 文件"
              disabled={busy || projectDirty}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void importFile(file);
              }}
            />
            <div className="actions">
              <Button
                disabled={busy || projectDirty || importingFile}
                onClick={() => fileInputRef.current?.click()}
              >
                {importingFile ? "正在读取文件…" : "选择 JSON 文件"}
              </Button>
            </div>
            <details>
              <summary>粘贴 JSON 高级方式</summary>
              <textarea
                name={`creative-plan-import-${projectId}`}
                className="code-input"
                value={importText}
                onChange={(event) => setImportText(event.target.value)}
                placeholder='{"title":"…","summary":"…","beats":[…] }'
              />
              <div className="actions">
                <Button
                  disabled={busy || projectDirty || !importText.trim()}
                  onClick={importPlan}
                >
                  校验并载入
                </Button>
              </div>
            </details>
          </div>
        </div>
        {importError && <p className="error m-0 whitespace-pre-line">{importError}</p>}
      </details>
      {plan && (
        <section className="creative-plan flex flex-col gap-4">
          <div className="panel-card flex flex-col gap-4 p-4">
            <div className="inline-fields">
              <Field label="方案标题">
                <input
                  value={plan.title}
                  onChange={(event) =>
                    changePlan({ ...plan, title: event.target.value })
                  }
                />
              </Field>
              <Field label="方案摘要">
                <textarea
                  value={plan.summary}
                  onChange={(event) =>
                    changePlan({ ...plan, summary: event.target.value })
                  }
                />
              </Field>
            </div>
            <Field label="用当前场景添加节拍">
              <NativeSelect
                value=""
                onChange={(event) => {
                  const scene = projectScenes.find(
                    (candidate) =>
                      candidate.id === event.target.value &&
                      !plan.beats.some(
                        (beat) => beat.scene.id === candidate.id,
                      ),
                  );
                  if (!scene) return;
                  changePlan({
                    ...plan,
                    beats: [
                      ...plan.beats,
                      {
                        scene,
                        rationale: "",
                        evidence: evidenceForScene(scene),
                      },
                    ],
                  });
                }}
              >
                <option value="">选择尚未纳入方案的场景</option>
                {projectScenes
                  .filter(
                    (scene) =>
                      !plan.beats.some((beat) => beat.scene.id === scene.id),
                  )
                  .map((scene) => (
                    <option key={scene.id} value={scene.id}>
                      {sceneLabels[scene.kind]} {scene.label || scene.id}
                    </option>
                  ))}
              </NativeSelect>
            </Field>
          </div>
          {plan.beats.map((beat, beatIndex) => (
            <article className="plan-beat panel-card flex flex-col gap-4 p-4" data-beat={beatIndex + 1} key={beat.scene.id}>
              <div className="section-title">
                <b>
                  节拍 {beatIndex + 1} · {sceneLabels[beat.scene.kind]}{" "}
                  {beat.scene.label || beat.scene.id}
                </b>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    changePlan({
                      ...plan,
                      beats: plan.beats.filter(
                        (_, current) => current !== beatIndex,
                      ),
                    })
                  }
                >
                  从方案移除
                </Button>
              </div>
              {renderSceneEditor(beat.scene, (scene) =>
                changePlan({
                  ...plan,
                  beats: plan.beats.map((current, currentIndex) =>
                    currentIndex === beatIndex
                      ? { ...current, scene }
                      : current,
                  ),
                }),
              )}
              <Field label="为什么使用这个节拍">
                <textarea
                  value={beat.rationale}
                  onChange={(event) =>
                    changePlan({
                      ...plan,
                      beats: plan.beats.map((current, currentIndex) =>
                        currentIndex === beatIndex
                          ? { ...current, rationale: event.target.value }
                          : current,
                      ),
                    })
                  }
                />
              </Field>
              <div className="flex flex-col gap-2">
                <h3 className="m-0 text-xs font-semibold text-muted">创作证据</h3>
                {beat.evidence.map((evidence, evidenceIndex) => {
                  const entry = analysis.find(
                    (candidate) => candidate.id === evidence.analysisId,
                  );
                  return (
                    <div className="plan-evidence flex flex-col gap-2" key={evidence.analysisId}>
                      <div className="section-title">
                        <b>{entry?.kind || "历史证据"}</b>
                        <div className="flex items-center gap-2">
                          <small className="numeric">
                            {(evidence.range.startUs / MICROS_PER_SECOND).toFixed(2)}–
                            {(
                              (evidence.range.startUs + evidence.range.durationUs) /
                              MICROS_PER_SECOND
                            ).toFixed(2)}{" "}
                            秒
                          </small>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              changePlan({
                                ...plan,
                                beats: plan.beats.map((current, currentIndex) =>
                                  currentIndex === beatIndex
                                    ? {
                                        ...current,
                                        evidence: current.evidence.filter(
                                          (_, currentEvidence) =>
                                            currentEvidence !== evidenceIndex,
                                        ),
                                      }
                                    : current,
                                ),
                              })
                            }
                          >
                            移除证据
                          </Button>
                        </div>
                      </div>
                      <p className="m-0 text-xs">{entry?.text || evidence.analysisId}</p>
                    </div>
                  );
                })}
                <Field label="引用一条当前证据">
                  <NativeSelect
                    value=""
                    onChange={(event) => {
                      const entry = analysis.find(
                        (candidate) =>
                          candidate.id === event.target.value &&
                          candidate.state === "current" &&
                          !beat.evidence.some(
                            (evidence) =>
                              evidence.analysisId === candidate.id,
                          ),
                      );
                      if (!entry) return;
                      changePlan({
                        ...plan,
                        beats: plan.beats.map((current, currentIndex) =>
                          currentIndex === beatIndex
                            ? {
                                ...current,
                                evidence: [
                                  ...current.evidence,
                                  {
                                    analysisId: entry.id,
                                    source: entry.source,
                                    range: entry.range,
                                  },
                                ],
                              }
                            : current,
                        ),
                      });
                    }}
                  >
                    <option value="">选择分析证据</option>
                    {analysis
                      .filter(
                        (entry) =>
                          entry.state === "current" &&
                          !beat.evidence.some(
                            (evidence) =>
                              evidence.analysisId === entry.id,
                          ),
                      )
                      .map((entry) => (
                        <option key={entry.id} value={entry.id}>
                          {entry.kind} · {entry.text.slice(0, 60)}
                        </option>
                      ))}
                  </NativeSelect>
                </Field>
              </div>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
