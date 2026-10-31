import { useEffect, useRef, useState } from "react";
import { PROFILES, ProjectDocument } from "@lightweaver/weaver/contracts";
import { clamp, MICROS_PER_SECOND } from "../domain/time";
import { Field } from "../ui/Field";
import { Button } from "../ui/Button";

export type SceneMask = ProjectDocument["masks"][number];
type OutputProfileValue = ProjectDocument["profiles"][number];
type MaskMedia = {
  kind: "video" | "image";
  url: string;
  sourceKey: string;
  startUs?: number;
  framing: { fit: "contain" | "cover"; focusX: number; focusY: number };
};

function emptyMask(sceneId: SceneMask["sceneId"]): SceneMask {
  return { sceneId, x: 0.1, y: 0.1, width: 0.4, height: 0.2, color: "#000000" };
}

function outputProfileLabel(profile: OutputProfileValue) {
  return ({ landscape: "横屏", portrait: "竖屏", square: "方形" }[profile.id] || profile.id);
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
    <details className="mask-editor flex flex-col gap-3">
      <summary className="font-medium">遮罩草稿 · {masks.length}</summary>
      <p className="hint">
        坐标与尺寸使用画面归一化值，颜色会随项目修订一起保存。
      </p>
      <div className="mask-preview-controls">
        <Field label="预览画面规格">
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
        </Field>
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
                <Field key={key} label={label}>
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
                </Field>
              ))}
              <Field label="颜色">
                <input
                  type="color"
                  value={mask.color}
                  onChange={(event) =>
                    update(index, { color: event.target.value })
                  }
                />
              </Field>
            </div>
            <Button size="sm"
              onClick={() =>
                onChange(masks.filter((_, current) => current !== index))
              }
            >
              删除遮罩
            </Button>
          </article>
        ))}
      </div>
      <Button onClick={() => onChange([...masks, emptyMask(sceneId)])}>
        添加遮罩
      </Button>
    </details>
  );
}
