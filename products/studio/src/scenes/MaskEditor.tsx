import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { PROFILES, ProjectDocument } from "@lightweaver/weaver/contracts";
import { clamp, MICROS_PER_SECOND } from "../domain/time";
import { Field } from "../ui/Field";
import { Button } from "../ui/Button";
import { NativeSelect } from "../ui/NativeSelect";

export type SceneMask = ProjectDocument["masks"][number];
type OutputProfileValue = ProjectDocument["profiles"][number];
type MaskGeometry = Pick<SceneMask, "x" | "y" | "width" | "height">;
type MaskPatch = Partial<MaskGeometry & Pick<SceneMask, "color">>;
type ResizeMode = "north-west" | "north-east" | "south-west" | "south-east";
type DragMode = "move" | ResizeMode;
type MaskDrag = {
  pointerId: number;
  mode: DragMode;
  startClientX: number;
  startClientY: number;
  canvasWidth: number;
  canvasHeight: number;
  start: MaskGeometry;
};
type MaskMedia = {
  kind: "video" | "image";
  url: string;
  sourceKey: string;
  startUs?: number;
  framing: { fit: "contain" | "cover"; focusX: number; focusY: number };
};

const MIN_MASK_SIZE = 0.01;

function geometryOf(mask: SceneMask): MaskGeometry {
  return {
    x: mask.x,
    y: mask.y,
    width: mask.width,
    height: mask.height,
  };
}

function normalizeGeometry(geometry: MaskGeometry): MaskGeometry {
  const x = clamp(geometry.x, 0, 1 - MIN_MASK_SIZE);
  const y = clamp(geometry.y, 0, 1 - MIN_MASK_SIZE);
  return {
    x,
    y,
    width: clamp(geometry.width, MIN_MASK_SIZE, 1 - x),
    height: clamp(geometry.height, MIN_MASK_SIZE, 1 - y),
  };
}

function moveGeometry(
  start: MaskGeometry,
  deltaX: number,
  deltaY: number,
): MaskGeometry {
  const normalized = normalizeGeometry(start);
  return {
    ...normalized,
    x: clamp(normalized.x + deltaX, 0, 1 - normalized.width),
    y: clamp(normalized.y + deltaY, 0, 1 - normalized.height),
  };
}

function resizeGeometry(
  start: MaskGeometry,
  mode: ResizeMode,
  deltaX: number,
  deltaY: number,
): MaskGeometry {
  const normalized = normalizeGeometry(start);
  let left = normalized.x;
  let top = normalized.y;
  let right = normalized.x + normalized.width;
  let bottom = normalized.y + normalized.height;

  if (mode === "north-west" || mode === "south-west") {
    left = clamp(left + deltaX, 0, right - MIN_MASK_SIZE);
  } else {
    right = clamp(right + deltaX, left + MIN_MASK_SIZE, 1);
  }
  if (mode === "north-west" || mode === "north-east") {
    top = clamp(top + deltaY, 0, bottom - MIN_MASK_SIZE);
  } else {
    bottom = clamp(bottom + deltaY, top + MIN_MASK_SIZE, 1);
  }

  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  };
}

function percent(value: number) {
  return Number((value * 100).toFixed(2));
}

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

function MaskCanvas({
  mask,
  index,
  profile,
  media,
  coordinateOnly,
  onGeometryChange,
}: {
  mask: SceneMask;
  index: number;
  profile: OutputProfileValue;
  media?: MaskMedia;
  coordinateOnly: boolean;
  onGeometryChange: (geometry: MaskGeometry) => void;
}) {
  const canvas = useRef<HTMLDivElement>(null);
  const drag = useRef<MaskDrag | null>(null);
  const [dragMode, setDragMode] = useState<DragMode | null>(null);

  useEffect(
    () => () => {
      const active = drag.current;
      const element = canvas.current;
      if (active && element?.hasPointerCapture(active.pointerId)) {
        element.releasePointerCapture(active.pointerId);
      }
      drag.current = null;
    },
    [mask.sceneId],
  );

  const clearDrag = () => {
    drag.current = null;
    setDragMode(null);
  };

  const beginDrag = (
    event: ReactPointerEvent<HTMLElement>,
    mode: DragMode,
  ) => {
    if (event.button !== 0) return;
    const element = canvas.current;
    if (!element) return;
    const bounds = element.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;

    event.preventDefault();
    event.stopPropagation();
    element.setPointerCapture(event.pointerId);
    drag.current = {
      pointerId: event.pointerId,
      mode,
      startClientX: event.clientX,
      startClientY: event.clientY,
      canvasWidth: bounds.width,
      canvasHeight: bounds.height,
      start: geometryOf(mask),
    };
    setDragMode(mode);
  };

  const moveDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const active = drag.current;
    if (!active || active.pointerId !== event.pointerId) return;
    event.preventDefault();
    const deltaX = (event.clientX - active.startClientX) / active.canvasWidth;
    const deltaY = (event.clientY - active.startClientY) / active.canvasHeight;
    onGeometryChange(
      active.mode === "move"
        ? moveGeometry(active.start, deltaX, deltaY)
        : resizeGeometry(active.start, active.mode, deltaX, deltaY),
    );
  };

  const finishDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const active = drag.current;
    if (!active || active.pointerId !== event.pointerId) return;
    if (canvas.current?.hasPointerCapture(event.pointerId)) {
      canvas.current.releasePointerCapture(event.pointerId);
    }
    clearDrag();
  };

  const handleResizeStart =
    (mode: ResizeMode) => (event: ReactPointerEvent<HTMLSpanElement>) => {
      beginDrag(event, mode);
    };

  return (
    <>
      {coordinateOnly && (
        <p className="mask-coordinate-note">
          卡片没有可预览画面。下面的方块只表示输出画幅中的位置和尺寸，不代表真实卡片排版；
          请通过制作预览核对最终画面。
        </p>
      )}
      <div
        ref={canvas}
        className={`mask-canvas${media ? " media-backed" : ""}${dragMode ? " is-dragging" : ""}`}
        data-drag-mode={dragMode || undefined}
        aria-label={`遮罩 ${index + 1} 预览，可拖动方块移动，拖动四角缩放`}
        role="group"
        style={{
          aspectRatio: `${profile.width} / ${profile.height}`,
          width: `min(100%, ${Math.min(640, 480 * profile.width / profile.height)}px)`,
        }}
        onPointerMove={moveDrag}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
        onLostPointerCapture={(event) => {
          if (drag.current?.pointerId === event.pointerId) clearDrag();
        }}
      >
        {media && <MaskMediaLayer media={media} />}
        <div
          className="mask-selection"
          role="presentation"
          style={{
            left: `${mask.x * 100}%`,
            top: `${mask.y * 100}%`,
            width: `${mask.width * 100}%`,
            height: `${mask.height * 100}%`,
            background: mask.color,
          }}
          onPointerDown={(event) => beginDrag(event, "move")}
        >
          {(
            [
              ["north-west", "左上角"],
              ["north-east", "右上角"],
              ["south-west", "左下角"],
              ["south-east", "右下角"],
            ] as const
          ).map(([mode, label]) => (
            <span
              key={mode}
              className="mask-resize-handle"
              data-corner={mode}
              aria-hidden="true"
              title={label}
              onPointerDown={handleResizeStart(mode)}
            />
          ))}
        </div>
        {!media && (
          <small className="mask-canvas-summary">
            {coordinateOnly
              ? "当前是坐标示意"
              : "素材不可读取，当前仅显示归一化坐标示意。"}
          </small>
        )}
      </div>
    </>
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
  const update = (index: number, patch: MaskPatch) => {
    onChange(
      masks.map((mask, current) => {
        if (current !== index) return mask;
        const geometry = normalizeGeometry({
          x: patch.x ?? mask.x,
          y: patch.y ?? mask.y,
          width: patch.width ?? mask.width,
          height: patch.height ?? mask.height,
        });
        return {
          ...mask,
          ...patch,
          ...geometry,
        };
      }),
    );
  };
  return (
    <details className="mask-editor flex flex-col gap-3">
      <summary className="font-medium">遮罩草稿 · {masks.length}</summary>
      <p className="hint scene-editor-hint">
        拖动方块移动，拖动四角缩放。下方百分比输入可按键盘精调；坐标和尺寸均映射到输出画幅。
      </p>
      <div className="mask-preview-controls">
        <Field label="预览画面规格">
          <NativeSelect
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
          </NativeSelect>
        </Field>
        <small className="mask-preview-meta">
          {previewProfile.label} · {previewProfile.profile.width}×
          {previewProfile.profile.height}
        </small>
      </div>
      <div className="mask-grid">
        {masks.map((mask, index) => (
          <article className="mask-card" key={`${mask.sceneId}-${index}`}>
            <MaskCanvas
              mask={mask}
              index={index}
              profile={previewProfile.profile}
              media={media}
              coordinateOnly={coordinateOnly}
              onGeometryChange={(geometry) => update(index, geometry)}
            />
            <div className="mask-fields">
              {(
                [
                  ["x", "X"],
                  ["y", "Y"],
                  ["width", "宽"],
                  ["height", "高"],
                ] as const
              ).map(([key, label]) => (
                <Field key={key} label={`${label}（%）`}>
                  <input
                    type="number"
                    min={key === "x" || key === "y" ? "0" : "1"}
                    max="100"
                    step="0.1"
                    value={percent(mask[key])}
                    onChange={(event) => {
                      const value = Number(event.target.value);
                      if (!Number.isFinite(value)) return;
                      const geometry = geometryOf(mask);
                      const nextValue = value / 100;
                      if (key === "x") {
                        geometry.x = clamp(
                          nextValue,
                          0,
                          1 - geometry.width,
                        );
                      } else if (key === "y") {
                        geometry.y = clamp(
                          nextValue,
                          0,
                          1 - geometry.height,
                        );
                      } else {
                        geometry[key] = nextValue;
                      }
                      update(index, geometry);
                    }}
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
