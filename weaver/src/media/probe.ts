import { z, ProbeFact, Frames, Samples } from "../contracts/index.ts";
import { processRun } from "./process.ts";
import { WeaverError } from "../contracts/errors.ts";

const Stream = z.object({
  codec_type: z.string().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  avg_frame_rate: z.string().optional(),
  r_frame_rate: z.string().optional(),
  nb_frames: z.string().optional(),
  nb_read_frames: z.string().optional(),
  sample_aspect_ratio: z.string().optional(),
  color_transfer: z.string().optional(),
  time_base: z.string().optional(),
  start_pts: z.number().optional(),
  sample_rate: z.string().optional(),
  channels: z.number().optional(),
  duration: z.string().optional(),
  tags: z.object({ rotate: z.string().optional() }).optional(),
  side_data_list: z
    .array(z.object({ rotation: z.number().optional() }))
    .optional(),
});
export async function probe(
  file: string,
  signal?: AbortSignal,
  countFrames = false,
): Promise<z.infer<typeof ProbeFact>> {
  const { stdout } = await processRun(
    "ffprobe",
    [
      "-v",
      "error",
      ...(countFrames ? ["-count_frames"] : []),
      "-show_streams",
      "-show_format",
      "-of",
      "json",
      file,
    ],
    { signal },
  );
  const raw = z
    .object({
      streams: z.array(Stream),
      format: z.object({ duration: z.string().optional() }),
    })
    .parse(JSON.parse(stdout));
  const v = raw.streams.find((s) => s.codec_type === "video"),
    a = raw.streams.find((s) => s.codec_type === "audio");
  const duration = Number(
    raw.format.duration ?? v?.duration ?? a?.duration ?? "0",
  );
  if (!Number.isFinite(duration) || duration < 0)
    throw new WeaverError("INVALID_MEDIA", "媒体时长无效");
  const rate = (
    v?.avg_frame_rate && v.avg_frame_rate !== "0/0"
      ? v.avg_frame_rate
      : v?.r_frame_rate || "30/1"
  )
    .split("/")
    .map(Number);
  const frames = Number(v?.nb_read_frames ?? v?.nb_frames);
  return ProbeFact.parse({
    durationUs: Math.round(duration * 1e6),
    video: v
      ? {
          width: v.width,
          height: v.height,
          fps: { num: rate[0], den: rate[1] || 1 },
          frames: Number.isFinite(frames) ? Frames.parse(frames) : undefined,
          rotation:
            v.side_data_list?.find((s) => s.rotation !== undefined)?.rotation ??
            Number(v.tags?.rotate || 0),
          sar: v.sample_aspect_ratio || "1:1",
          colorTransfer: v.color_transfer || "unknown",
          timeBase: v.time_base || "unknown",
          startPts: v.start_pts,
        }
      : undefined,
    audio: a
      ? {
          sampleRate: Number(a.sample_rate),
          channels: a.channels,
          samples: Samples.parse(Math.round(duration * Number(a.sample_rate))),
        }
      : undefined,
  });
}
export async function verifyVideo(
  file: string,
  expected: {
    width: number;
    height: number;
    fps: { num: number; den: number };
    frames: number;
    audio: boolean;
    totalSamples?: number;
    paddingSamples?: number;
    colorTransfer?: string;
  },
  signal?: AbortSignal,
): Promise<z.infer<typeof ProbeFact>> {
  const fact = await probe(file, signal, true),
    v = fact.video;
  if (
    !v ||
    v.width !== expected.width ||
    v.height !== expected.height ||
    v.frames !== expected.frames ||
    v.fps.num * expected.fps.den !== expected.fps.num * v.fps.den ||
    (expected.colorTransfer !== undefined &&
      v.colorTransfer !== expected.colorTransfer) ||
    Boolean(fact.audio) !== expected.audio
  )
    throw new WeaverError("MEDIA_VALIDATION_FAILED", "媒体规格与计划不一致", {
      expected,
      actual: fact,
    });
  if (expected.audio && expected.totalSamples !== undefined) {
    const result = await processRun(
      "ffmpeg",
      [
        "-hide_banner",
        "-nostdin",
        "-i",
        file,
        "-map",
        "0:a:0",
        "-vn",
        "-af",
        "aresample=48000,astats=metadata=0:reset=0",
        "-f",
        "null",
        "-",
      ],
      { signal },
    );
    const match = [...result.stderr.matchAll(/Number of samples:\s*(\d+)/g)].at(
        -1,
      ),
      actual = match ? Number(match[1]) : NaN;
    if (
      !Number.isSafeInteger(actual) ||
      actual < expected.totalSamples ||
      actual > expected.totalSamples + (expected.paddingSamples ?? 2048)
    )
      throw new WeaverError(
        "MEDIA_VALIDATION_FAILED",
        "解码音频采样数与计划不一致",
        {
          expectedSamples: expected.totalSamples,
          paddingSamples: expected.paddingSamples ?? 2048,
          actualSamples: actual,
        },
      );
    if (fact.audio) fact.audio.samples = Samples.parse(actual);
  }
  await processRun("ffmpeg", ["-v", "error", "-i", file, "-f", "null", "-"], {
    signal,
  });
  return fact;
}
