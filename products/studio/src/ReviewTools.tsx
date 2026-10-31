import { useEffect, useRef, useState } from "react";
import {
  z,
  AnalysisEntry,
  CaptionCue,
  CaptionTrack,
  CreativePlan,
  MediaAssetVersion,
  MediaRef,
  PROFILES,
  ProjectDocument,
  RunRecord,
  Scene,
  SceneId,
  refKey,
  speechOf,
} from "@lightweaver/weaver/contracts";
import { api, mediaUrl, requestId } from "./api";

export const RunDetail = z.object({
  run: RunRecord,
  nodes: z.array(
    z.object({
      key: z.string(),
      state: z.string(),
      attempts: z.number(),
      result: z.unknown(),
      error: z.unknown().optional(),
    }),
  ),
});
const ReviewAnalysis = AnalysisEntry.extend({ state: z.string() });
const CaptionAssistResult = z.object({
  projectId: z.string(),
  revision: z.string(),
  sourceLocale: z.string(),
  targetLocale: z.string(),
  sourceTrackDigest: z.string(),
  track: CaptionTrack,
});
const SpeakerAssistResult = z.object({
  projectId: z.string(),
  revision: z.string(),
  source: MediaRef,
  locale: z.string(),
  track: CaptionTrack,
});
export type SceneMask = ProjectDocument["masks"][number];
type CaptionCueValue = z.infer<typeof CaptionCue>;
type CreativePlanValue = z.infer<typeof CreativePlan>;
type ReviewAnalysisEntry = z.infer<typeof ReviewAnalysis>;
type OutputProfileValue = ProjectDocument["profiles"][number];
type MaskMedia = {
  kind: "video" | "image";
  url: string;
  sourceKey: string;
  startUs?: number;
  framing: {
    fit: "contain" | "cover";
    focusX: number;
    focusY: number;
  };
};

export type SourceWindow = {
  startUs: number;
  durationUs: number;
};

const MICROS_PER_SECOND = 1e6;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function normalizeWindow(
  window: SourceWindow,
  bounds: SourceWindow,
): SourceWindow {
  const boundsEnd = bounds.startUs + bounds.durationUs;
  const durationUs = clamp(
    Math.round(window.durationUs),
    1,
    Math.max(1, bounds.durationUs),
  );
  const startUs = clamp(
    Math.round(window.startUs),
    bounds.startUs,
    Math.max(bounds.startUs, boundsEnd - durationUs),
  );
  return {
    startUs,
    durationUs: Math.min(durationUs, boundsEnd - startUs),
  };
}

function seconds(microseconds: number) {
  return microseconds / MICROS_PER_SECOND;
}

function localeName(value: string) {
  return value === "zh"
    ? "中文"
    : value === "en"
      ? "英文"
      : value === "ja"
        ? "日文"
        : value === "ko"
          ? "韩文"
          : value;
}

function cueWithoutWords(cue: CaptionCueValue): CaptionCueValue {
  const { words: _words, ...rest } = cue;
  return rest;
}

function findMedia(
  assets: z.infer<typeof MediaAssetVersion>[],
  key: string,
) {
  return assets.find((asset) => refKey(asset) === key);
}

function emptyMask(sceneId: SceneMask["sceneId"]): SceneMask {
  return {
    sceneId,
    x: 0.1,
    y: 0.1,
    width: 0.4,
    height: 0.2,
    color: "#000000",
  };
}

function outputProfileLabel(profile: OutputProfileValue) {
  return (
    {
      landscape: "横屏",
      portrait: "竖屏",
      square: "方形",
    }[profile.id] || profile.id
  );
}

function ReviewField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function SourceWindowPlayer({
  sourceUrl,
  sourceKey,
  range,
  bounds = range,
  label = "源窗预览",
  editable = false,
  onRangeChange,
}: {
  sourceUrl?: string;
  sourceKey: string;
  range: SourceWindow;
  bounds?: SourceWindow;
  label?: string;
  editable?: boolean;
  onRangeChange?: (range: SourceWindow) => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [positionUs, setPositionUs] = useState(range.startUs);
  const [mediaError, setMediaError] = useState("");
  const startUs = range.startUs;
  const durationUs = range.durationUs;
  const endUs = startUs + durationUs;
  const startSecond = seconds(startUs);
  const endSecond = seconds(endUs);
  const positionSecond = clamp(seconds(positionUs), startSecond, endSecond);

  const seek = (nextUs: number) => {
    const boundedUs = clamp(Math.round(nextUs), startUs, endUs);
    setPositionUs(boundedUs);
    const element = video.current;
    if (element && element.readyState >= HTMLMediaElement.HAVE_METADATA)
      element.currentTime = seconds(boundedUs);
  };

  useEffect(() => {
    const element = video.current;
    setMediaError("");
    setPositionUs(startUs);
    if (!element) return;
    element.pause();
    if (element.readyState >= HTMLMediaElement.HAVE_METADATA)
      element.currentTime = seconds(startUs);
  }, [sourceKey, sourceUrl, startUs, durationUs]);

  const updateRange = (next: SourceWindow) => {
    if (onRangeChange)
      onRangeChange(normalizeWindow(next, bounds));
  };

  return (
    <section className="source-window">
      <div className="source-window-head">
        <b>{label}</b>
        <small>
          {startSecond.toFixed(2)}–{endSecond.toFixed(2)} 秒 ·{" "}
          {seconds(durationUs).toFixed(2)} 秒
        </small>
      </div>
      {sourceUrl ? (
        <video
          className="source-window-video"
          ref={video}
          preload="metadata"
          playsInline
          src={sourceUrl}
          onLoadedMetadata={(event) => {
            event.currentTarget.currentTime = startSecond;
            setPositionUs(startUs);
          }}
          onTimeUpdate={(event) => {
            const current = event.currentTarget.currentTime;
            if (current < startSecond) {
              event.currentTarget.currentTime = startSecond;
              setPositionUs(startUs);
            } else if (current >= endSecond) {
              event.currentTarget.pause();
              event.currentTarget.currentTime = endSecond;
              setPositionUs(endUs);
            } else {
              setPositionUs(Math.round(current * MICROS_PER_SECOND));
            }
          }}
          onError={() => setMediaError("这个版本的本机媒体不可读取")}
        />
      ) : (
        <p className="hint">当前项目上下文中没有可播放的媒体版本。</p>
      )}
      {mediaError && <p className="error">{mediaError}</p>}
      <div className="source-window-controls">
        <button
          type="button"
          disabled={!sourceUrl}
          onClick={() => {
            const element = video.current;
            if (!element) return;
            if (positionUs >= endUs) seek(startUs);
            void element.play().catch(() => {
              setMediaError("浏览器没有允许播放这个预览");
            });
          }}
        >
          播放选区
        </button>
        <button type="button" disabled={!sourceUrl} onClick={() => video.current?.pause()}>
          暂停
        </button>
        <input
          aria-label={`${label}定位`}
          type="range"
          min={startSecond}
          max={endSecond}
          step="0.01"
          value={positionSecond}
          disabled={!sourceUrl}
          onChange={(event) =>
            seek(Number(event.target.value) * MICROS_PER_SECOND)
          }
        />
      </div>
      {editable && onRangeChange && (
        <div className="source-window-trim">
          <label>
            <span>入点（秒）</span>
            <input
              type="number"
              min={seconds(bounds.startUs)}
              max={seconds(bounds.startUs + bounds.durationUs - 1)}
              step="0.01"
              value={startSecond}
              onChange={(event) =>
                updateRange({
                  startUs: Number(event.target.value) * MICROS_PER_SECOND,
                  durationUs,
                })
              }
            />
          </label>
          <label>
            <span>时长（秒）</span>
            <input
              type="number"
              min="0.001"
              max={seconds(
                bounds.startUs + bounds.durationUs - Math.max(bounds.startUs, startUs),
              )}
              step="0.01"
              value={seconds(durationUs)}
              onChange={(event) =>
                updateRange({
                  startUs,
                  durationUs: Number(event.target.value) * MICROS_PER_SECOND,
                })
              }
            />
          </label>
        </div>
      )}
    </section>
  );
}

function MaskMediaLayer({ media }: { media: MaskMedia }) {
  const video = useRef<HTMLVideoElement>(null);
  const [mediaError, setMediaError] = useState("");
  const startSecond = (media.startUs || 0) / MICROS_PER_SECOND;
  const objectPosition =
    media.framing.fit === "cover"
      ? `${media.framing.focusX * 100}% ${media.framing.focusY * 100}%`
      : "center";

  useEffect(() => {
    setMediaError("");
  }, [media.kind, media.sourceKey, media.url]);

  useEffect(() => {
    if (media.kind !== "video") return;
    const element = video.current;
    if (!element) return;
    const seek = () => {
      element.pause();
      element.currentTime = startSecond;
    };
    if (element.readyState >= HTMLMediaElement.HAVE_METADATA) seek();
    else element.addEventListener("loadedmetadata", seek, { once: true });
    return () => element.removeEventListener("loadedmetadata", seek);
  }, [media.kind, media.sourceKey, media.url, startSecond]);

  if (mediaError) {
    return (
      <p className="mask-media-error error">{mediaError}</p>
    );
  }
  return media.kind === "video" ? (
    <video
      ref={video}
      className="mask-canvas-media"
      src={media.url}
      preload="metadata"
      muted
      playsInline
      aria-label="遮罩源片预览"
      style={{
        objectFit: media.framing.fit,
        objectPosition,
      }}
      onError={() => setMediaError("这个版本的本机视频不可读取")}
    />
  ) : (
    <img
      className="mask-canvas-media"
      src={media.url}
      alt="遮罩静帧预览"
      style={{
        objectFit: media.framing.fit,
        objectPosition,
      }}
      onError={() => setMediaError("这个版本的本机图片不可读取")}
    />
  );
}

export function MaskEditor({
  sceneId,
  masks,
  profile,
  media,
  coordinateOnly = false,
  onChange,
}: {
  sceneId: SceneMask["sceneId"];
  masks: SceneMask[];
  profile: OutputProfileValue;
  media?: MaskMedia;
  coordinateOnly?: boolean;
  onChange: (masks: SceneMask[]) => void;
}) {
  const previewProfiles = [
    {
      profile,
      label: `当前项目 · ${outputProfileLabel(profile)}`,
    },
    ...Object.values(PROFILES)
      .filter((candidate) => candidate.id !== profile.id)
      .map((candidate) => ({
        profile: candidate,
        label: outputProfileLabel(candidate),
      })),
  ];
  const [previewProfileId, setPreviewProfileId] = useState(profile.id);
  const previewProfile =
    previewProfiles.find(
      (candidate) => candidate.profile.id === previewProfileId,
    ) || previewProfiles[0];
  const update = (index: number, patch: Partial<SceneMask>) => {
    onChange(
      masks.map((mask, current) => {
        if (current !== index) return mask;
        const x = clamp(patch.x ?? mask.x, 0, 0.99);
        const y = clamp(patch.y ?? mask.y, 0, 0.99);
        const width = clamp(patch.width ?? mask.width, 0.01, 1 - x);
        const height = clamp(patch.height ?? mask.height, 0.01, 1 - y);
        return { ...mask, ...patch, x, y, width, height };
      }),
    );
  };
  return (
    <details className="mask-editor">
      <summary>遮罩草稿 · {masks.length}</summary>
      <p className="hint">
        坐标与尺寸使用画面归一化值，颜色会随项目修订一起保存。
      </p>
      <div className="mask-preview-controls">
        <ReviewField label="预览画面规格">
          <select
            value={previewProfile.profile.id}
            onChange={(event) => setPreviewProfileId(event.target.value)}
          >
            {previewProfiles.map((candidate) => (
              <option
                key={candidate.profile.id}
                value={candidate.profile.id}
              >
                {candidate.label} · {candidate.profile.width}×
                {candidate.profile.height}
              </option>
            ))}
          </select>
        </ReviewField>
        <small className="mask-preview-meta">
          {previewProfile.label} · {previewProfile.profile.width}×
          {previewProfile.profile.height}
        </small>
      </div>
      <div className="mask-grid">
        {masks.map((mask, index) => (
          <article className="mask-card" key={`${mask.sceneId}-${index}`}>
            <div
              className={`mask-canvas${media ? " media-backed" : ""}`}
              aria-label="遮罩范围预览"
              style={{
                aspectRatio: `${previewProfile.profile.width} / ${previewProfile.profile.height}`,
                width: `min(100%, ${Math.min(640, 480 * previewProfile.profile.width / previewProfile.profile.height)}px)`,
              }}
            >
              {media && <MaskMediaLayer media={media} />}
              <span
                style={{
                  left: `${mask.x * 100}%`,
                  top: `${mask.y * 100}%`,
                  width: `${mask.width * 100}%`,
                  height: `${mask.height * 100}%`,
                  background: mask.color,
                }}
              />
              {!media && (
                <small className="mask-canvas-summary">
                  {coordinateOnly
                    ? "卡片需通过制作预览核对实际画面；此处仅显示归一化坐标示意。"
                    : "素材不可读取，当前仅显示归一化坐标示意。"}
                </small>
              )}
            </div>
            <div className="mask-fields">
              {(
                [
                  ["x", "X"],
                  ["y", "Y"],
                  ["width", "宽"],
                  ["height", "高"],
                ] as const
              ).map(([key, label]) => (
                <ReviewField key={key} label={label}>
                  <input
                    type="number"
                    min={key === "x" || key === "y" ? "0" : "0.01"}
                    max="1"
                    step="0.01"
                    value={mask[key]}
                    onChange={(event) =>
                      update(index, {
                        [key]: Number(event.target.value),
                      })
                    }
                  />
                </ReviewField>
              ))}
              <ReviewField label="颜色">
                <input
                  type="color"
                  value={mask.color}
                  onChange={(event) =>
                    update(index, { color: event.target.value })
                  }
                />
              </ReviewField>
            </div>
            <button
              onClick={() =>
                onChange(masks.filter((_, current) => current !== index))
              }
            >
              删除遮罩
            </button>
          </article>
        ))}
      </div>
      <button onClick={() => onChange([...masks, emptyMask(sceneId)])}>
        添加遮罩
      </button>
    </details>
  );
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
  const fps = track.fps.num / track.fps.den;
  const time = cue.time;
  const commit = (raw: unknown) => {
    const parsed = CaptionCue.safeParse(raw);
    if (!parsed.success) {
      setLocalError(parsed.error.issues[0]?.message || "字幕字段无效");
      return;
    }
    const parsedTime = parsed.data.time;
    if (parsedTime.kind === "speech") {
      const scene = draft.scenes.find(
        (candidate) => candidate.id === parsedTime.sceneId,
      );
      if (!scene || !speechOf(scene)) {
        setLocalError("场景语音只能引用带实际语音的场景");
        return;
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
        return;
      }
    }
    setLocalError("");
    onChange(parsed.data);
  };
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
      <ReviewField
        label={
          track.translationLocale
            ? `字幕译文（${localeName(track.translationLocale)}；原语言 ${localeName(locale)}）`
            : "字幕文本"
        }
      >
        <textarea
          value={cue.text}
          onChange={(event) =>
            commit({
              ...cueWithoutWords(cue),
              text: event.target.value,
              timingQuality: "manual",
            })
          }
        />
      </ReviewField>
      <ReviewField label="说话人标识（可选）">
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
      </ReviewField>
      <details>
        <summary>
          时间与预览 · {timingLabel} · {cue.timingQuality}
        </summary>
        {time.kind === "timeline" && (
          <div className="inline-fields">
            <ReviewField label="起始（秒）">
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
            </ReviewField>
            <ReviewField label="时长（秒）">
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
            </ReviewField>
          </div>
        )}
        {time.kind === "source" && (
          <div className="inline-fields">
            <ReviewField label="源入点（秒）">
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
            </ReviewField>
            <ReviewField label="源时长（秒）">
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
            </ReviewField>
          </div>
        )}
        {time.kind === "speech" && (
          <div className="inline-fields">
            <ReviewField label="场景">
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
            </ReviewField>
            <ReviewField label="场景入点（秒）">
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
            </ReviewField>
            <ReviewField label="场景时长（秒）">
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
            </ReviewField>
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

function runLabel(state: string) {
  return (
    {
      queued: "排队",
      running: "运行中",
      cancelling: "取消中",
      succeeded: "成功",
      failed: "失败",
      cancelled: "已取消",
      interrupted: "中断",
      partial: "部分成功",
    }[state] || state
  );
}

export function CaptionAssistPanel({
  projectId,
  sourceLocale,
  expectedRevision,
  disabled,
  fail,
  onApply,
}: {
  projectId: string;
  sourceLocale: string;
  expectedRevision: string;
  disabled: boolean;
  fail: (error: unknown) => void;
  onApply: (runId: string) => void;
}) {
  const requestSequence = useRef(0);
  const [targetLocale, setTargetLocale] = useState(
    sourceLocale === "en" ? "zh" : "en",
  );
  const [run, setRun] = useState<z.infer<typeof RunRecord> | null>(null);
  const [detail, setDetail] = useState<z.infer<typeof RunDetail> | null>(null);
  const [status, setStatus] = useState("");
  useEffect(() => {
    requestSequence.current++;
    setRun(null);
    setDetail(null);
    setStatus("");
  }, [projectId, sourceLocale]);
  useEffect(() => {
    if (!run || !["queued", "running", "cancelling"].includes(run.state))
      return;
    const sequence = requestSequence.current;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = () =>
      api(`/runs/${run.id}`, RunDetail, { signal: controller.signal })
        .then((next) => {
          if (
            controller.signal.aborted ||
            sequence !== requestSequence.current
          )
            return;
          setDetail(next);
          setStatus(runLabel(next.run.state));
          if (next.run.error) fail(new Error(next.run.error.message));
          if (["queued", "running", "cancelling"].includes(next.run.state))
            timer = setTimeout(poll, 1000);
        })
        .catch((error) => {
          if (
            !controller.signal.aborted &&
            sequence === requestSequence.current
          )
            fail(error);
        });
    poll();
    return () => {
      controller.abort();
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [run, projectId]);
  const result =
    detail?.run.state === "succeeded"
      ? CaptionAssistResult.safeParse(detail.nodes[0]?.result)
      : null;
  const staleResult =
    result?.success && result.data.revision !== expectedRevision;
  return (
    <section className="assist-panel">
      <h3>字幕译文作业</h3>
      <p className="hint">
        译文只改变字幕语言。项目输出语言和音频保持不变。完成后必须再点击“采用译文”。
      </p>
      <div className="actions">
        <ReviewField label="译文目标语言">
          <input
            value={targetLocale}
            onChange={(event) => setTargetLocale(event.target.value)}
            placeholder="例如 en"
          />
        </ReviewField>
        <button
          disabled={disabled || !targetLocale}
          onClick={() => {
            const sequence = ++requestSequence.current;
            setRun(null);
            setDetail(null);
            setStatus("提交中");
            api(`/projects/${projectId}/captions/assist`, RunRecord, {
              method: "POST",
              body: {
                locale: sourceLocale,
                targetLocale,
                expectedRevision,
                requestId: requestId(),
              },
            })
              .then((next) => {
                if (sequence !== requestSequence.current) return;
                setRun(next);
                setStatus(runLabel(next.state));
              })
              .catch((error) => {
                if (sequence !== requestSequence.current) return;
                setStatus("");
                fail(error);
              });
          }}
        >
          生成译文字幕
        </button>
      </div>
      {status && <small>{status}</small>}
      {detail?.run.error && (
        <p className="error">{detail.run.error.message}</p>
      )}
      {result?.success && (
        <div className="translation-review">
          <div className="section-title">
            <b>
              原文 {localeName(result.data.sourceLocale)} → 译文{" "}
              {localeName(result.data.targetLocale)}
            </b>
            <button
              disabled={disabled || staleResult}
              onClick={() => {
                if (run) onApply(run.id);
              }}
            >
              采用译文到原字幕轨
            </button>
          </div>
          {result.data.track.cues.map((cue) => (
            <div className="translation-cue" key={cue.id}>
              <small>原文</small>
              <p>
                {cue.translationSourceText ??
                  cue.sourceText ??
                  "原轨没有保留原始文本"}
              </p>
              <small>译文</small>
              <p>{cue.text}</p>
            </div>
          ))}
          {staleResult && (
            <p className="hint">
              此译文基于修订 {result.data.revision.slice(0, 16)}
              ，当前修订是 {expectedRevision.slice(0, 16)}
              。重新生成后才能采用。
            </p>
          )}
        </div>
      )}
    </section>
  );
}

export function SpeakerAssistPanel({
  projectId,
  sourceId,
  locale,
  expectedRevision,
  ready,
  disabled,
  fail,
  onApply,
}: {
  projectId: string;
  sourceId: string;
  locale: string;
  expectedRevision: string;
  ready: boolean;
  disabled: boolean;
  fail: (error: unknown) => void;
  onApply: (runId: string) => void;
}) {
  const requestSequence = useRef(0);
  const [run, setRun] = useState<z.infer<typeof RunRecord> | null>(null);
  const [detail, setDetail] = useState<z.infer<typeof RunDetail> | null>(null);
  const [status, setStatus] = useState("");
  useEffect(() => {
    requestSequence.current++;
    setRun(null);
    setDetail(null);
    setStatus("");
  }, [projectId, sourceId, locale]);
  useEffect(() => {
    if (!run || !["queued", "running", "cancelling"].includes(run.state))
      return;
    const sequence = requestSequence.current;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = () =>
      api(`/runs/${run.id}`, RunDetail, { signal: controller.signal })
        .then((next) => {
          if (
            controller.signal.aborted ||
            sequence !== requestSequence.current
          )
            return;
          setDetail(next);
          setStatus(runLabel(next.run.state));
          if (next.run.error) fail(new Error(next.run.error.message));
          if (["queued", "running", "cancelling"].includes(next.run.state))
            timer = setTimeout(poll, 1000);
        })
        .catch((error) => {
          if (
            !controller.signal.aborted &&
            sequence === requestSequence.current
          )
            fail(error);
        });
    poll();
    return () => {
      controller.abort();
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [run, projectId]);
  const result =
    detail?.run.state === "succeeded"
      ? SpeakerAssistResult.safeParse(detail.nodes[0]?.result)
      : null;
  const speakerCues =
    result?.success
      ? result.data.track.cues.filter((cue) => cue.speakerId)
      : [];
  const staleResult =
    result?.success && result.data.revision !== expectedRevision;
  return (
    <section className="assist-panel">
      <h3>临时分段说话人</h3>
      <p className="hint">
        按所选源素材和窗口推测说话人分段，不等同于角色识别。不会默认启用，也不会自动改写字幕。
      </p>
      <button
        disabled={
          disabled ||
          !ready ||
          !sourceId ||
          !["zh", "en"].includes(locale)
        }
        onClick={() => {
          const sequence = ++requestSequence.current;
          setRun(null);
          setDetail(null);
          setStatus("提交中");
          api(`/projects/${projectId}/speakers`, RunRecord, {
            method: "POST",
            body: { sourceId, locale, requestId: requestId() },
          })
            .then((next) => {
              if (sequence !== requestSequence.current) return;
              setRun(next);
              setStatus(runLabel(next.state));
            })
            .catch((error) => {
              if (sequence !== requestSequence.current) return;
              setStatus("");
              fail(error);
            });
        }}
      >
        检测临时说话人分段
      </button>
      {(!ready || !sourceId || !["zh", "en"].includes(locale)) && (
        <small>
          {!sourceId
            ? "先选择源片。"
            : !ready
              ? "moss-speakers 尚未就绪。"
              : "当前只提供中文或英文的说话人分段辅助。"}
        </small>
      )}
      {status && <small>{status}</small>}
      {detail?.run.error && (
        <p className="error">{detail.run.error.message}</p>
      )}
      {result?.success && (
        <div className="translation-review">
          <div className="section-title">
            <b>临时分段结果 · {speakerCues.length} 个 cue 带说话人</b>
            <button
              disabled={disabled || !speakerCues.length || staleResult}
              onClick={() => {
                if (run) onApply(run.id);
              }}
            >
              采用临时说话人分段
            </button>
          </div>
          {speakerCues.length ? (
            speakerCues.map((cue) => (
              <div className="translation-cue" key={cue.id}>
                <small>{cue.speakerId}</small>
                <p>{cue.text}</p>
              </div>
            ))
          ) : (
            <p className="hint">这次结果没有可采用的说话人分段。</p>
          )}
          {staleResult && (
            <p className="hint">
              此说话人结果基于修订 {result.data.revision.slice(0, 16)}
              ，当前修订是 {expectedRevision.slice(0, 16)}
              。重新检测后才能采用。
            </p>
          )}
        </div>
      )}
    </section>
  );
}

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
            <ReviewField label="方案标题">
              <input
                value={plan.title}
                onChange={(event) =>
                  onChange({ ...plan, title: event.target.value })
                }
              />
            </ReviewField>
            <ReviewField label="方案摘要">
              <textarea
                value={plan.summary}
                onChange={(event) =>
                  onChange({ ...plan, summary: event.target.value })
                }
              />
            </ReviewField>
          </div>
          <ReviewField label="用当前场景添加节拍">
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
          </ReviewField>
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
              <ReviewField label="为什么使用这个节拍">
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
              </ReviewField>
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
              <ReviewField label="引用一条当前证据">
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
              </ReviewField>
            </article>
          ))}
        </section>
      )}
    </>
  );
}
