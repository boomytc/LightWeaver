import { useEffect, useRef, useState } from "react";
import { IconClose, IconPause, IconPlay } from "../icons";
import { PEAK_CACHE_MIN, decodePeaksFromUrl, formatClock, paintWaveform } from "../lib/waveform";

export function VoiceWave({ src, busy, onClear }: { src: string; busy?: boolean; onClear: () => void }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const peaksRef = useRef<number[] | null>(null);
  const durationRef = useRef(0);
  const messageRef = useRef<string | undefined>(undefined);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [loading, setLoading] = useState(true);
  const [playError, setPlayError] = useState("");
  const [ratio, setRatio] = useState(0);

  function durationOf(audio?: HTMLAudioElement | null): number {
    if (audio && Number.isFinite(audio.duration) && audio.duration > 0) return audio.duration;
    return durationRef.current;
  }

  function syncTime() {
    const audio = audioRef.current;
    const nextDuration = durationOf(audio);
    const nextCurrent = audio?.currentTime ?? 0;
    durationRef.current = nextDuration;
    setCurrent(nextCurrent);
    setDuration(nextDuration);
    setRatio(nextDuration > 0 ? Math.min(1, Math.max(0, nextCurrent / nextDuration)) : 0);
  }

  function paint(message?: string) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    paintWaveform(canvas, peaksRef.current, message ?? messageRef.current);
  }

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onMeta = () => syncTime();
    const onEnded = () => {
      setPlaying(false);
      syncTime();
    };
    const onPause = () => {
      if (!audio.ended) setPlaying(false);
    };
    const onPlay = () => setPlaying(true);
    const onError = () => {
      setPlaying(false);
      setPlayError("当前文件无法预览播放");
    };
    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("timeupdate", onMeta);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("error", onError);
    return () => {
      audio.pause();
      audio.removeEventListener("loadedmetadata", onMeta);
      audio.removeEventListener("timeupdate", onMeta);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("error", onError);
    };
  }, [src]);

  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    const tick = () => {
      syncTime();
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing]);

  useEffect(() => {
    let alive = true;
    const ac = new AbortController();
    peaksRef.current = null;
    messageRef.current = undefined;
    durationRef.current = 0;
    setLoading(true);
    setPlayError("");
    setPlaying(false);
    setCurrent(0);
    setDuration(0);
    setRatio(0);
    const width = canvasRef.current?.clientWidth || 400;
    decodePeaksFromUrl(src, Math.max(width, PEAK_CACHE_MIN), ac.signal)
      .then((decoded) => {
        if (!alive) return;
        if (!decoded?.peaks.length) {
          messageRef.current = "无法解码音频波形";
          setLoading(false);
          paint("无法解码音频波形");
          return;
        }
        peaksRef.current = decoded.peaks;
        if (!durationRef.current) {
          durationRef.current = decoded.duration;
          setDuration(decoded.duration);
        }
        setLoading(false);
        paint();
      })
      .catch((err: unknown) => {
        if (!alive || ac.signal.aborted) return;
        if (err instanceof DOMException && err.name === "AbortError") return;
        messageRef.current = "无法解码音频波形";
        setLoading(false);
        paint("无法解码音频波形");
      });
    return () => {
      alive = false;
      ac.abort();
    };
  }, [src]);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const redraw = () => paint();
    const ro = new ResizeObserver(redraw);
    ro.observe(wrap);
    const mo = new MutationObserver(redraw);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => {
      ro.disconnect();
      mo.disconnect();
    };
  }, [src]);

  function seekTo(time: number) {
    const audio = audioRef.current;
    if (!audio) return;
    const nextDuration = durationOf(audio);
    const target = nextDuration ? Math.min(Math.max(0, time), nextDuration) : Math.max(0, time);
    try {
      audio.currentTime = target;
    } catch {
      return;
    }
    syncTime();
  }

  function toggle() {
    const audio = audioRef.current;
    if (!audio || audio.error) return;
    if (audio.paused) {
      void audio
        .play()
        .then(() => setPlayError(""))
        .catch(() => setPlayError("无法播放该文件"));
      return;
    }
    audio.pause();
  }

  return (
    <div className="voice-wave">
      <audio ref={audioRef} className="voice-wave-audio" src={src} preload="metadata" />
      <button
        type="button"
        className="voice-wave-close"
        aria-label="清除已选录音"
        title="清除"
        disabled={busy}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          audioRef.current?.pause();
          onClear();
        }}
      >
        <IconClose size={14} />
      </button>
      <div className="voice-wave-toolbar">
        <button
          type="button"
          className="voice-wave-play"
          aria-label={playing ? "暂停" : "播放"}
          disabled={Boolean(playError)}
          onClick={(event) => {
            event.stopPropagation();
            toggle();
          }}
        >
          {playing ? <IconPause /> : <IconPlay />}
        </button>
        <span className="voice-wave-time">
          {formatClock(current)} / {formatClock(duration)}
        </span>
        {playError ? <span className="voice-wave-error">{playError}</span> : null}
      </div>
      <div className="voice-wave-body" ref={wrapRef}>
        {loading ? (
          <div className="voice-wave-loading" aria-live="polite">
            正在计算波形…
          </div>
        ) : null}
        <div
          className={duration > 0 ? "voice-wave-playhead" : "voice-wave-playhead is-hidden"}
          style={{ left: `${ratio * 100}%` }}
          aria-hidden="true"
        >
          <span className="voice-wave-playhead-dot" />
        </div>
        <canvas
          ref={canvasRef}
          className="voice-wave-canvas"
          role="slider"
          tabIndex={0}
          aria-label="音频波形，点击跳转播放位置"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(ratio * 100)}
          onClick={(event) => {
            const canvas = canvasRef.current;
            const nextDuration = durationOf(audioRef.current);
            if (!canvas || !nextDuration) return;
            const rect = canvas.getBoundingClientRect();
            if (!rect.width) return;
            seekTo(((event.clientX - rect.left) / rect.width) * nextDuration);
          }}
          onKeyDown={(event) => {
            if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
            event.preventDefault();
            const step = event.shiftKey ? 5 : 1;
            seekTo(current + (event.key === "ArrowRight" ? step : -step));
          }}
        />
      </div>
    </div>
  );
}
