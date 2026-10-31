import { useState } from "react";
import { CreativePlan, Scene, refKey, z } from "@lightweaver/weaver/contracts";
import { MICROS_PER_SECOND } from "../domain/time";
import type { ReviewAnalysisEntry } from "../domain/context";
import { Field } from "../ui/Field";

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
    <>
      <h2>创作方案蓝图</h2>
      <p>
        方案是随项目修订保存的创作草案。只有点击“应用到当前场景”后，方案节拍才会成为可独立编辑的场景，之后不会自动同步。
      </p>
      <div className="actions">
        <button
          disabled={busy || projectDirty || !projectScenes.length}
          onClick={createFromScenes}
        >
          从当前场景建立方案
        </button>
        {plan && (
          <>
            <button
              className="primary"
              disabled={busy || projectDirty || !planDirty}
              onClick={() => onSave(plan)}
            >
              保存方案蓝图
            </button>
            <button
              disabled={
                busy || projectDirty || planDirty || !plan.beats.length
              }
              onClick={onApply}
            >
              应用到当前场景
            </button>
          </>
        )}
      </div>
      {projectDirty && <small>先保存当前项目草稿，再保存或应用方案。</small>}
      <details open={!plan}>
        <summary>从 agent 导入方案</summary>
        <textarea
          className="code-input"
          value={importText}
          onChange={(event) => setImportText(event.target.value)}
          placeholder='{"title":"…","summary":"…","beats":[…] }'
        />
        <button
          disabled={busy || projectDirty || !importText.trim()}
          onClick={importPlan}
        >
          校验并载入
        </button>
        {importError && <p className="error">{importError}</p>}
      </details>
      {!plan ? (
        <p className="hint">
          尚无方案。可从现有场景建立草案，或导入外部 agent
          生成的方案。载入后仍可逐项审核和编辑。
        </p>
      ) : (
        <section className="creative-plan">
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
          {plan.beats.map((beat, beatIndex) => (
            <article className="plan-beat" key={beat.scene.id}>
              <div className="section-title">
                <b>
                  节拍 {beatIndex + 1} · {sceneLabels[beat.scene.kind]}{" "}
                  {beat.scene.label || beat.scene.id}
                </b>
                <button
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
                </button>
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
              <h3>创作证据</h3>
              {beat.evidence.map((evidence, evidenceIndex) => {
                const entry = analysis.find(
                  (candidate) => candidate.id === evidence.analysisId,
                );
                return (
                  <div className="plan-evidence" key={evidence.analysisId}>
                    <b>{entry?.kind || "历史证据"}</b>
                    <p>{entry?.text || evidence.analysisId}</p>
                    <small>
                      {(evidence.range.startUs / MICROS_PER_SECOND).toFixed(2)}–
                      {(
                        (evidence.range.startUs + evidence.range.durationUs) /
                        MICROS_PER_SECOND
                      ).toFixed(2)}{" "}
                      秒
                    </small>
                    <button
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
                    </button>
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
            </article>
          ))}
        </section>
      )}
    </>
  );
}
