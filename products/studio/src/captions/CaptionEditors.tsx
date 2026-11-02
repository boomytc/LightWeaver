import { useEffect, useMemo, useState } from "react";
import {
  CaptionCue,
  CaptionTrack,
  MediaAssetVersion,
  ProjectDocument,
  SceneId,
  refKey,
  speechOf,
  z,
} from "@lightweaver/weaver/contracts";
import { localeName } from "../domain/format";
import { MICROS_PER_SECOND } from "../domain/time";
import { SourceWindowPlayer } from "../scenes/SourceWindowPlayer";
import { Field } from "../ui/Field";
import { Button } from "../ui/Button";
import { Badge } from "../ui/Badge";
import { TrashIcon } from "../ui/Icons";
import { mediaUrl } from "../api";

type CaptionCueValue = z.infer<typeof CaptionCue>;
type CaptionTrackValue = z.infer<typeof CaptionTrack>;
const CAPTION_PAGE_SIZE = 25;

function cueWithoutWords(cue: CaptionCueValue): CaptionCueValue {
  const { words: _words, ...rest } = cue;
  return rest;
}

function findMedia(assets: z.infer<typeof MediaAssetVersion>[], key: string) {
  return assets.find((asset) => refKey(asset) === key);
}

function CuePreview({
  cue,
  draft,
  assets,
  selectedSource,
}: {
  cue: CaptionCueValue;
  draft: ProjectDocument;
  assets: z.infer<typeof MediaAssetVersion>[];
  selectedSource: string;
}) {
  const timelineFps = draft.profiles[0].fps.num / draft.profiles[0].fps.den;
  const time = cue.time;
  if (time.kind === "source") {
    const asset = findMedia(assets, refKey(time.source));
    return (
      <SourceWindowPlayer
        sourceUrl={asset ? mediaUrl(asset.digest) : undefined}
        sourceKey={refKey(time.source)}
        range={time.range}
        label="字幕对应的源片"
      />
    );
  }
  if (time.kind === "speech") {
    const scene = draft.scenes.find(
      (candidate) => candidate.id === time.sceneId,
    );
    if (!scene)
      return <p className="hint">场景语音引用的场景已不存在。</p>;
    if (scene.kind === "clip") {
      if (!speechOf(scene))
        return <p className="error">该片段没有场景语音，字幕引用无效。</p>;
      if (
        scene.playback.kind === "speech" &&
        scene.playback.overflow.kind === "speed"
      )
        return (
          <p className="hint">
            该场景可能按实际语音时长变速播放，当前上下文无法可靠计算源片帧，因此不显示源片预览。
          </p>
        );
      const asset = findMedia(assets, refKey(scene.source));
      const sourceStartUs =
        scene.sourceRange.startUs + time.range.startUs;
      const sourceEndUs =
        scene.sourceRange.startUs + scene.sourceRange.durationUs;
      if (sourceStartUs >= sourceEndUs)
        return (
          <p className="hint">
            该字幕落在源窗结束后的定格段，没有独立的源片帧可预览。
          </p>
        );
      return (
        <SourceWindowPlayer
          sourceUrl={asset ? mediaUrl(asset.digest) : undefined}
          sourceKey={`${refKey(scene.source)}:${time.sceneId}:${sourceStartUs}`}
          range={{
            startUs: sourceStartUs,
            durationUs: Math.min(
              time.range.durationUs,
              sourceEndUs - sourceStartUs,
            ),
          }}
          label={`场景 ${scene.label || scene.id} 的源片帧`}
        />
      );
    }
    if (scene.kind === "still") {
      const asset = findMedia(assets, refKey(scene.image));
      return (
        <div className="scene-preview">
          {asset && (
            <img src={mediaUrl(asset.digest)} alt="字幕对应静帧场景" />
          )}
          <small>
            场景语音 {(time.range.startUs / 1e6).toFixed(2)}–
            {(
              (time.range.startUs + time.range.durationUs) /
              1e6
            ).toFixed(2)}{" "}
            秒
          </small>
        </div>
      );
    }
    return (
      <div className="scene-preview card">
        <b>{scene.cardSpec.copy[draft.locales[0]]?.headline}</b>
        <small>卡片场景没有源视频，字幕按场景语音时间预览。</small>
      </div>
    );
  }
  const selected = findMedia(assets, selectedSource);
  if (!selected) return null;
  return (
    <SourceWindowPlayer
      sourceUrl={mediaUrl(selected.digest)}
      sourceKey={selectedSource}
      range={{
        startUs: Math.round(
          (time.startFrame / timelineFps) * MICROS_PER_SECOND,
        ),
        durationUs: Math.max(
          1,
          Math.round(
            (time.durationFrames / timelineFps) * MICROS_PER_SECOND,
          ),
        ),
      }}
      label="所选源片对照（时间轴字幕没有独立源引用）"
    />
  );
}

export function CaptionCueEditor({
  cue,
  track,
  draft,
  assets,
  locale,
  selectedSource,
  onChange,
}: {
  cue: CaptionCueValue;
  track: z.infer<typeof CaptionTrack>;
  draft: ProjectDocument;
  assets: z.infer<typeof MediaAssetVersion>[];
  locale: string;
  selectedSource: string;
  onChange: (cue: CaptionCueValue) => void;
}) {
  const [localError, setLocalError] = useState("");
  const [textInput, setTextInput] = useState(cue.text);
  const [emptyTextError, setEmptyTextError] = useState("");
  const fps = track.fps.num / track.fps.den;
  const time = cue.time;
  const commit = (raw: unknown) => {
    const parsed = CaptionCue.safeParse(raw);
    if (!parsed.success) {
      setLocalError(parsed.error.issues[0]?.message || "字幕字段无效");
      return false;
    }
    const parsedTime = parsed.data.time;
    if (parsedTime.kind === "speech") {
      const scene = draft.scenes.find(
        (candidate) => candidate.id === parsedTime.sceneId,
      );
      if (!scene || !speechOf(scene)) {
        setLocalError("场景语音只能引用带实际语音的场景");
        return false;
      }
      const speechTime = parsedTime.range;
      if (
        scene.kind === "clip" &&
        scene.playback.kind === "speech" &&
        scene.playback.overflow.kind === "reject" &&
        speechTime.startUs + speechTime.durationUs >
          scene.sourceRange.durationUs
      ) {
        setLocalError("该字幕超过可验证源窗；拒绝溢出的场景无法容纳此时间");
        return false;
      }
    }
    setLocalError("");
    onChange(parsed.data);
    return true;
  };
  useEffect(() => {
    setTextInput(cue.text);
  }, [cue.id, cue.text]);
  const commitTiming = (time: unknown) =>
    commit({
      ...cueWithoutWords(cue),
      timingQuality: "manual",
      time,
    });
  const timingLabel =
    time.kind === "timeline"
      ? `时间轴 ${(time.startFrame / fps).toFixed(2)} 秒`
      : time.kind === "source"
        ? `源片 ${(time.range.startUs / 1e6).toFixed(2)} 秒`
        : `场景语音 ${(time.range.startUs / 1e6).toFixed(2)} 秒`;
  const speechScenes = draft.scenes.filter((scene) => speechOf(scene));
  const currentSpeechScene =
    time.kind === "speech"
      ? draft.scenes.find((scene) => scene.id === time.sceneId)
      : undefined;
  return (
    <section className="cue-editor">
      {localError && <p className="error">{localError}</p>}
      {cue.sourceText !== undefined && (
        <div className="source-copy">
          <small>原始转写（只读，不会被字幕编辑覆盖）</small>
          <p>{cue.sourceText}</p>
        </div>
      )}
      <Field
        label={
          track.translationLocale
            ? `字幕译文（${localeName(track.translationLocale)}；原语言 ${localeName(locale)}）`
            : "字幕文本"
        }
      >
        <textarea
          value={textInput}
          onChange={(event) => {
            const nextText = event.target.value;
            setTextInput(nextText);
            setEmptyTextError("");
            if (!nextText.length) return;
            const committed = commit({
              ...cueWithoutWords(cue),
              text: nextText,
              timingQuality: "manual",
            });
            if (!committed) setTextInput(cue.text);
          }}
          onBlur={() => {
            if (textInput.length) return;
            setTextInput(cue.text);
            setEmptyTextError(
              "字幕文本不能为空。要删除整条字幕，请使用“移除此条字幕”。",
            );
          }}
        />
      </Field>
      {emptyTextError && <p className="error">{emptyTextError}</p>}
      <Field label="说话人标识（可选）">
        <input
          value={cue.speakerId || ""}
          placeholder="例如 speaker-1"
          onChange={(event) => {
            const next = { ...cue };
            if (event.target.value.trim())
              next.speakerId = event.target.value.trim();
            else delete next.speakerId;
            commit(next);
          }}
        />
      </Field>
      <details open>
        <summary>
          时间与预览 · {timingLabel} · {cue.timingQuality}
        </summary>
        {time.kind === "timeline" && (
          <div className="inline-fields">
            <Field label="起始（秒）">
              <input
                type="number"
                min="0"
                step="0.01"
                value={time.startFrame / fps}
                onChange={(event) =>
                  commitTiming({
                    kind: "timeline",
                    startFrame: Math.max(
                      0,
                      Math.round(Number(event.target.value) * fps),
                    ),
                    durationFrames: time.durationFrames,
                  })
                }
              />
            </Field>
            <Field label="时长（秒）">
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={time.durationFrames / fps}
                onChange={(event) =>
                  commitTiming({
                    kind: "timeline",
                    startFrame: time.startFrame,
                    durationFrames: Math.max(
                      1,
                      Math.round(Number(event.target.value) * fps),
                    ),
                  })
                }
              />
            </Field>
          </div>
        )}
        {time.kind === "source" && (
          <div className="inline-fields">
            <Field label="源入点（秒）">
              <input
                type="number"
                min="0"
                step="0.01"
                value={time.range.startUs / MICROS_PER_SECOND}
                onChange={(event) =>
                  commitTiming({
                    ...time,
                    range: {
                      ...time.range,
                      startUs: Math.max(
                        0,
                        Math.round(Number(event.target.value) * MICROS_PER_SECOND),
                      ),
                    },
                  })
                }
              />
            </Field>
            <Field label="源时长（秒）">
              <input
                type="number"
                min="0.001"
                step="0.01"
                value={time.range.durationUs / MICROS_PER_SECOND}
                onChange={(event) =>
                  commitTiming({
                    ...time,
                    range: {
                      ...time.range,
                      durationUs: Math.max(
                        1,
                        Math.round(Number(event.target.value) * MICROS_PER_SECOND),
                      ),
                    },
                  })
                }
              />
            </Field>
          </div>
        )}
        {time.kind === "speech" && (
          <div className="inline-fields">
            <Field label="场景">
              <select
                value={time.sceneId}
                onChange={(event) =>
                  commitTiming({
                    kind: "speech",
                    sceneId: SceneId.parse(event.target.value),
                    range: time.range,
                  })
                }
              >
                {speechScenes.map((scene) => (
                  <option key={scene.id} value={scene.id}>
                    {scene.label || scene.id}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="场景入点（秒）">
              <input
                type="number"
                min="0"
                step="0.01"
                value={time.range.startUs / MICROS_PER_SECOND}
                onChange={(event) =>
                  commitTiming({
                    ...time,
                    range: {
                      ...time.range,
                      startUs: Math.round(
                        Number(event.target.value) * MICROS_PER_SECOND,
                      ),
                    },
                  })
                }
              />
            </Field>
            <Field label="场景时长（秒）">
              <input
                type="number"
                min="0.001"
                step="0.01"
                value={time.range.durationUs / MICROS_PER_SECOND}
                onChange={(event) =>
                  commitTiming({
                    ...time,
                    range: {
                      ...time.range,
                      durationUs: Math.round(
                        Number(event.target.value) * MICROS_PER_SECOND,
                      ),
                    },
                  })
                }
              />
            </Field>
            {(!currentSpeechScene || !speechOf(currentSpeechScene)) && (
              <p className="error">
                当前引用不是带实际语音的场景，请重新选择或更换时间类型。
              </p>
            )}
            <p className="hint">
              这里保存相对场景语音的时间；实际语音边界由制作计划按已准备语音验证。
            </p>
          </div>
        )}
        <CuePreview
          cue={cue}
          draft={draft}
          assets={assets}
          selectedSource={selectedSource}
        />
      </details>
    </section>
  );
}

type CaptionClockInterval = {
  id: CaptionCueValue["id"];
  group: string;
  start: number;
  end: number;
};

function captionClockInterval(cue: CaptionCueValue): CaptionClockInterval {
  if (cue.time.kind === "timeline") {
    return {
      id: cue.id,
      group: "timeline",
      start: cue.time.startFrame,
      end: cue.time.startFrame + cue.time.durationFrames,
    };
  }
  return {
    id: cue.id,
    group:
      cue.time.kind === "source"
        ? `source:${refKey(cue.time.source)}`
        : `speech:${cue.time.sceneId}`,
    start: cue.time.range.startUs,
    end: cue.time.range.startUs + cue.time.range.durationUs,
  };
}

function overlappingCaptionCueIds(
  cues: readonly CaptionCueValue[],
): ReadonlySet<CaptionCueValue["id"]> {
  const ordered = cues
    .map(captionClockInterval)
    .sort(
      (left, right) =>
        left.group.localeCompare(right.group) ||
        left.start - right.start ||
        left.end - right.end ||
        left.id.localeCompare(right.id),
    );
  const overlapping = new Set<CaptionCueValue["id"]>();
  let activeGroup = "";
  let furthestId = "";
  let furthestEnd = Number.NEGATIVE_INFINITY;

  for (const interval of ordered) {
    if (interval.group !== activeGroup) {
      activeGroup = interval.group;
      furthestId = interval.id;
      furthestEnd = interval.end;
      continue;
    }
    if (interval.start < furthestEnd) {
      overlapping.add(furthestId);
      overlapping.add(interval.id);
    }
    if (interval.end > furthestEnd) {
      furthestId = interval.id;
      furthestEnd = interval.end;
    }
  }
  return overlapping;
}

function captionCueMatchesQuery(cue: CaptionCueValue, query: string) {
  if (!query) return true;
  return [cue.text, cue.sourceText, cue.speakerId].some((value) =>
    value
      ?.normalize("NFKC")
      .toLocaleLowerCase()
      .includes(query),
  );
}

export function CaptionTrackEditor({
  cues,
  track,
  draft,
  assets,
  locale,
  selectedSource,
  onCueChange,
  onRemoveCue,
}: {
  cues: CaptionTrackValue["cues"];
  track: CaptionTrackValue;
  draft: ProjectDocument;
  assets: z.infer<typeof MediaAssetVersion>[];
  locale: string;
  selectedSource: string;
  onCueChange: (cue: CaptionCueValue) => void;
  onRemoveCue: (cueId: CaptionCueValue["id"]) => void;
}) {
  const [query, setQuery] = useState("");
  const [overlapsOnly, setOverlapsOnly] = useState(false);
  const [requestedPage, setRequestedPage] = useState(1);
  const [selectedId, setSelectedId] = useState("");
  const overlapIds = useMemo(
    () => overlappingCaptionCueIds(cues),
    [cues],
  );
  const normalizedQuery = query.trim().normalize("NFKC").toLocaleLowerCase();
  const visibleCues = useMemo(
    () =>
      cues.filter(
        (cue) =>
          captionCueMatchesQuery(cue, normalizedQuery) &&
          (!overlapsOnly || overlapIds.has(cue.id)),
      ),
    [cues, normalizedQuery, overlapIds, overlapsOnly],
  );
  const pageCount = Math.max(
    1,
    Math.ceil(visibleCues.length / CAPTION_PAGE_SIZE),
  );
  const page = Math.min(requestedPage, pageCount);
  const pageStart = (page - 1) * CAPTION_PAGE_SIZE;
  const pageCues = visibleCues.slice(
    pageStart,
    pageStart + CAPTION_PAGE_SIZE,
  );

  useEffect(() => {
    if (requestedPage !== page) setRequestedPage(page);
  }, [page, requestedPage]);

  const selectedCue = pageCues.find((cue) => cue.id === selectedId) || pageCues[0];
  const selectedIndex = selectedCue ? visibleCues.findIndex((cue) => cue.id === selectedCue.id) : -1;

  return (
    <section className="caption-container panel-card p-3">
      <div className="caption-master-detail">
        <div className="flex min-w-0 flex-col gap-3">
          <Field label="检索字幕">
            <input
              data-lw-find=""
              value={query}
              placeholder="文本、原始转写或说话人"
              onChange={(event) => {
                setQuery(event.target.value);
                setRequestedPage(1);
              }}
            />
          </Field>
          <div className="flex items-center justify-between gap-2">
            <label className="check text-xs">
              <input type="checkbox" checked={overlapsOnly} onChange={(event) => { setOverlapsOnly(event.target.checked); setRequestedPage(1); }} />
              仅看重叠
            </label>
            <Badge tone={overlapIds.size ? "warn" : "neutral"}>{overlapIds.size} 条重叠</Badge>
          </div>
          <div className="section-title">
            <small className="numeric">{visibleCues.length} 条 · {page}/{pageCount} 页</small>
            <div>
              <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => setRequestedPage(page - 1)}>上一页</Button>
              <Button size="sm" variant="ghost" disabled={page >= pageCount} onClick={() => setRequestedPage(page + 1)}>下一页</Button>
            </div>
          </div>
          <div className="scroll-region max-h-[clamp(320px,60vh,620px)] flex flex-col gap-1 pr-1">
            {pageCues.map((cue, index) => (
              <button
                key={cue.id}
                type="button"
                className={`row-item ${selectedCue?.id === cue.id ? "is-on" : ""}`}
                aria-pressed={selectedCue?.id === cue.id}
                onClick={() => setSelectedId(cue.id)}
              >
                <span className="storyboard-index">{pageStart + index + 1}</span>
                <span className="row-item-copy">
                  <b className="text-xs">{cue.text}</b>
                  <small>{cue.speakerId || (cue.time.kind === "source" ? "源片" : cue.time.kind === "speech" ? "场景语音" : "成片")} · {cue.timingQuality}</small>
                </span>
                {overlapIds.has(cue.id) && <Badge tone="warn">重叠</Badge>}
              </button>
            ))}
            {pageCues.length === 0 && <p className="hint px-2 text-xs">{cues.length ? "没有匹配当前检索或重叠筛选的字幕。" : "当前字幕轨没有 cue。"}</p>}
          </div>
        </div>
        <div className="caption-detail-pane min-w-0">
          {selectedCue ? (
            <div className="flex flex-col gap-3">
              <div className="section-title">
                <div><b>第 {selectedIndex + 1} 条字幕</b>{overlapIds.has(selectedCue.id) && <Badge tone="warn">时间重叠，请核对</Badge>}</div>
                <Button size="sm" variant="danger" onClick={() => onRemoveCue(selectedCue.id)}><TrashIcon />移除此条</Button>
              </div>
              <CaptionCueEditor
                cue={selectedCue}
                track={track}
                draft={draft}
                assets={assets}
                locale={locale}
                selectedSource={selectedSource}
                onChange={onCueChange}
              />
            </div>
          ) : <div className="subtle-card p-6 text-center"><b>选择一条字幕进行精修</b><p className="hint mx-auto mt-1 mb-0 text-xs">可核对文本、说话人、时间以及与源窗的对应画面。</p></div>}
        </div>
      </div>
    </section>
  );
}
