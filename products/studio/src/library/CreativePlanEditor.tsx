import { useState } from "react";
import { CreativePlan, Scene, refKey, z } from "@lightweaver/weaver/contracts";
import { MICROS_PER_SECOND } from "../domain/time";
import type { ReviewAnalysisEntry } from "../domain/context";
import { Field } from "../ui/Field";
import { Button } from "../ui/Button";
import { Badge } from "../ui/Badge";

type CreativePlanValue = z.infer<typeof CreativePlan>;

const sceneLabels: Record<string, string> = {
  card: "卡片",
  still: "静帧",
  clip: "视频片段",
};

export function CreativePlanEditor({
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
  plan: CreativePlanValue | null;
  projectTitle: string;
  projectScenes: Scene[];
  analysis: ReviewAnalysisEntry[];
  projectDirty: boolean;
  planDirty: boolean;
  busy: boolean;
  onChange: (plan: CreativePlanValue) => void;
  onSave: (plan: CreativePlanValue) => void;
  onApply: () => void;
  renderSceneEditor: (
    scene: Scene,
    onChange: (scene: Scene) => void,
  ) => React.ReactNode;
}) {
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState("");
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
    onChange(parsed.data);
  };
  const importPlan = () => {
    let raw: unknown;
    try {
      raw = JSON.parse(importText);
    } catch {
      setImportError("方案不是有效 JSON");
      return;
    }
    const parsed = CreativePlan.safeParse(raw);
    if (!parsed.success) {
      setImportError(parsed.error.issues[0]?.message || "方案字段无效");
      return;
    }
    setImportError("");
    onChange(parsed.data);
  };
  return (
    <div className="flex flex-col gap-4">
      <div className="section-title">
        <div><h2 className="m-0">创作方案蓝图</h2>{plan && <Badge tone={planDirty ? "warn" : "ok"} dot>{planDirty ? "方案未保存" : "蓝图已保存"}</Badge>}</div>
        <small>建立 / 导入 → 保存蓝图 → 应用到场景</small>
      </div>
      <p className="hint m-0">
        方案是随项目修订保存的创作草案。只有点击“应用到当前场景”后，方案节拍才会成为可独立编辑的场景，之后不会自动同步。
      </p>
      <div className="actions panel-card p-3">
        <Button
          disabled={busy || projectDirty || !projectScenes.length}
          onClick={createFromScenes}
        >
          从当前场景建立方案
        </Button>
        {plan && (
          <>
            <Button
              variant="primary"
              disabled={busy || projectDirty || !planDirty}
              onClick={() => onSave(plan)}
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
          </>
        )}
      </div>
      {projectDirty && <small>先保存当前项目草稿，再保存或应用方案。</small>}
      <details className="panel-card p-4" open={!plan}>
        <summary className="font-medium">从 agent 导入方案</summary>
        <div className="mt-3 flex flex-col gap-3">
          <textarea
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
          {importError && <p className="error m-0">{importError}</p>}
        </div>
      </details>
      {!plan ? (
        <div className="subtle-card p-6 text-center">
          <b>尚无方案</b>
          <p className="hint mx-auto mt-1 mb-0 text-xs">
            可从现有场景建立草案，或导入外部 agent 生成的方案。载入后仍可逐项审核和编辑。
          </p>
        </div>
      ) : (
        <section className="creative-plan flex flex-col gap-4">
          <div className="panel-card flex flex-col gap-4 p-4">
            <div className="inline-fields">
              <Field label="方案标题">
                <input
                  value={plan.title}
                  onChange={(event) =>
                    onChange({ ...plan, title: event.target.value })
                  }
                />
              </Field>
              <Field label="方案摘要">
                <textarea
                  value={plan.summary}
                  onChange={(event) =>
                    onChange({ ...plan, summary: event.target.value })
                  }
                />
              </Field>
            </div>
            <Field label="用当前场景添加节拍">
              <select
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
                  onChange({
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
              </select>
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
                    onChange({
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
                onChange({
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
                    onChange({
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
                              onChange({
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
                  <select
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
                      onChange({
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
                  </select>
                </Field>
              </div>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
