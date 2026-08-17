export const WAVEFORM_HEIGHT = 80;
export const PEAK_CACHE_MIN = 2048;

export function formatClock(s: number | null | undefined): string {
  if (s == null || !Number.isFinite(s)) return "00:00";
  const total = Math.max(0, Math.round(s));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");
  if (hours > 0) return `${hours}:${mm}:${ss}`;
  return `${mm}:${ss}`;
}

export function bucketPeaks(channel: ArrayLike<number>, bucketCount: number): number[] {
  const count = Math.max(1, bucketCount);
  const peaks = new Array<number>(count);
  const samplesPerBucket = channel.length / count;
  let globalMax = 0;
  for (let i = 0; i < count; i++) {
    const start = Math.floor(i * samplesPerBucket);
    const end = Math.floor((i + 1) * samplesPerBucket);
    let max = 0;
    for (let j = start; j < end; j++) {
      const value = Math.abs(channel[j] ?? 0);
      if (value > max) max = value;
    }
    peaks[i] = max;
    if (max > globalMax) globalMax = max;
  }
  if (globalMax > 0) {
    for (let i = 0; i < count; i++) peaks[i]! /= globalMax;
  }
  return peaks;
}

export function resamplePeaks(peaks: number[], bucketCount: number): number[] {
  if (!peaks.length || bucketCount <= 0) return [];
  if (peaks.length === bucketCount) return peaks;
  const out = new Array<number>(bucketCount);
  for (let i = 0; i < bucketCount; i++) {
    const src = (i / bucketCount) * peaks.length;
    const idx = Math.min(peaks.length - 1, Math.floor(src));
    out[i] = peaks[idx] ?? 0;
  }
  return out;
}

export function mixChannels(buffer: AudioBuffer): Float32Array {
  const length = buffer.length;
  const mixed = new Float32Array(length);
  const channels = buffer.numberOfChannels;
  for (let channel = 0; channel < channels; channel++) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < length; i++) mixed[i]! += data[i] ?? 0;
  }
  if (channels > 1) {
    for (let i = 0; i < length; i++) mixed[i]! /= channels;
  }
  return mixed;
}

export async function decodePeaksFromUrl(
  url: string,
  bucketCount: number,
  signal?: AbortSignal,
): Promise<{ peaks: number[]; duration: number } | null> {
  const buckets = Math.max(1, bucketCount);
  const res = await fetch(url, { signal });
  if (!res.ok) return null;
  const arrayBuffer = await res.arrayBuffer();
  if (signal?.aborted) return null;
  const AudioCtx = window.AudioContext;
  if (!AudioCtx) return null;
  const ctx = new AudioCtx();
  try {
    const buffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
    return { peaks: bucketPeaks(mixChannels(buffer), buckets), duration: buffer.duration };
  } finally {
    await ctx.close().catch(() => undefined);
  }
}

export function paintWaveform(canvas: HTMLCanvasElement, peaks: number[] | null, message?: string): void {
  const dpr = window.devicePixelRatio || 1;
  const cssWidth = canvas.clientWidth || 400;
  canvas.width = Math.max(1, Math.floor(cssWidth * dpr));
  canvas.height = Math.floor(WAVEFORM_HEIGHT * dpr);
  canvas.style.height = `${WAVEFORM_HEIGHT}px`;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssWidth, WAVEFORM_HEIGHT);
  const styles = getComputedStyle(canvas);
  if (!peaks?.length) {
    if (!message) return;
    ctx.fillStyle = styles.getPropertyValue("--wave-muted").trim() || "#94a3b8";
    ctx.font = "13px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(message, cssWidth / 2, WAVEFORM_HEIGHT / 2);
    return;
  }
  const sampled = resamplePeaks(peaks, cssWidth);
  const barWidth = 3;
  const step = 4;
  const midY = WAVEFORM_HEIGHT / 2;
  ctx.fillStyle = styles.getPropertyValue("--wave-bar").trim() || "#94a3b8";
  for (let x = 0; x < cssWidth; x += step) {
    const peakIdx = Math.min(sampled.length - 1, Math.floor((x / cssWidth) * sampled.length));
    const height = Math.max(2, (sampled[peakIdx] ?? 0) * (WAVEFORM_HEIGHT * 0.9));
    ctx.fillRect(x, midY - height / 2, barWidth, height);
  }
}
