import { useEffect, useRef, useState } from "react";
import { MICROS_PER_SECOND, clamp, normalizeWindow, seconds, type SourceWindow } from "../domain/time";
import { Button } from "../ui/Button";
import { PauseIcon, PlayIcon } from "../ui/Icons";

export type { SourceWindow };

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
    if (element && element.readyState >= HTMLMediaElement.HAVE_METADATA) element.currentTime = seconds(boundedUs);
  };
  useEffect(() => {
    const element = video.current;
    setMediaError("");
    setPositionUs(startUs);
    if (!element) return;
    element.pause();
    if (element.readyState >= HTMLMediaElement.HAVE_METADATA) element.currentTime = seconds(startUs);
  }, [sourceKey, sourceUrl, startUs, durationUs]);
  const updateRange = (next: SourceWindow) => {
    if (onRangeChange) onRangeChange(normalizeWindow(next, bounds));
  };
  return (
    <section className="source-window flex flex-col gap-2">
      <div className="source-window-head">
        <b>{label}</b>
        <small className="numeric">{startSecond.toFixed(2)}–{endSecond.toFixed(2)} 秒 · {seconds(durationUs).toFixed(2)} 秒</small>
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
            } else setPositionUs(Math.round(current * MICROS_PER_SECOND));
          }}
          onError={() => setMediaError("这个版本的本机媒体不可读取")}
        />
      ) : <p className="hint m-0">当前项目上下文中没有可播放的媒体版本。</p>}
      {mediaError && <p className="error m-0">{mediaError}</p>}
      <div className="source-window-controls">
        <Button size="sm" disabled={!sourceUrl} onClick={() => {
          const element = video.current;
          if (!element) return;
          if (positionUs >= endUs) seek(startUs);
          void element.play().catch(() => setMediaError("浏览器没有允许播放这个预览"));
        }}><PlayIcon />播放选区</Button>
        <Button size="sm" variant="ghost" disabled={!sourceUrl} onClick={() => video.current?.pause()}><PauseIcon />暂停</Button>
        <input
          aria-label={`${label}定位`}
          type="range"
          min={startSecond}
          max={endSecond}
          step="0.01"
          value={positionSecond}
          disabled={!sourceUrl}
          onChange={(event) => seek(Number(event.target.value) * MICROS_PER_SECOND)}
        />
      </div>
      {editable && onRangeChange && (
        <div className="source-window-trim">
          <label className="field"><span>入点（秒）</span><input type="number" min={seconds(bounds.startUs)} max={seconds(bounds.startUs + bounds.durationUs - 1)} step="0.01" value={startSecond} onChange={(event) => updateRange({ startUs: Number(event.target.value) * MICROS_PER_SECOND, durationUs })} /></label>
          <label className="field"><span>时长（秒）</span><input type="number" min="0.001" max={seconds(bounds.startUs + bounds.durationUs - Math.max(bounds.startUs, startUs))} step="0.01" value={seconds(durationUs)} onChange={(event) => updateRange({ startUs, durationUs: Number(event.target.value) * MICROS_PER_SECOND })} /></label>
        </div>
      )}
    </section>
  );
}
