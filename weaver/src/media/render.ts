import fs from "node:fs";
import path from "node:path";
import {
  z,
  TimelineManifest,
  RunSnapshot,
  refKey,
  CardRenderInput,
  AudioSegment,
} from "../contracts/index.ts";
import { WeaverError } from "../contracts/errors.ts";
import { Store, canonical } from "../store/index.ts";
import { nodeScriptInvocation, processRun } from "./process.ts";
import { verifyVideo } from "./probe.ts";
import { frameUs, frameSamples } from "../timeline/clock.ts";
import { toSrt, toAss } from "../timeline/captions.ts";
import { currentRuntime } from "../runtime.ts";

export const RENDER_ALGORITHM = "unified-ffmpeg-v7-visual-masks";

const seconds = (frames: number, manifest: TimelineManifest) =>
  (frames * manifest.output.fps.den) / manifest.output.fps.num;
function tempo(speed: number): string {
  const filters: string[] = [];
  while (speed < 0.5) {
    filters.push("atempo=0.5");
    speed /= 0.5;
  }
  while (speed > 2) {
    filters.push("atempo=2");
    speed /= 2;
  }
  filters.push(`atempo=${speed}`);
  return filters.join(",");
}

export async function renderAudioSegment(input: {
  store: Store;
  segment: z.infer<typeof AudioSegment>;
  manifest: TimelineManifest;
  workDir: string;
  stem: string;
  dest: string;
  signal?: AbortSignal;
  padTimeline?: boolean;
}): Promise<void> {
  const {
      store,
      segment: a,
      manifest: m,
      workDir,
      stem,
      dest,
      signal,
      padTimeline,
    } = input,
    p = m.output;
  if (!store.verifyBlob(a.digest))
    throw new WeaverError("INTEGRITY_FAILED", "指定音轨不存在");
  const ff = (args: string[]) =>
    processRun("ffmpeg", ["-v", "error", "-nostdin", "-y", ...args], {
      signal,
    });
  const trimmed = path.join(workDir, `${stem}-source.wav`);
  try {
    await ff([
      "-ss",
      String(a.trimUs / 1e6),
      "-t",
      String(a.sourceDurationUs / 1e6),
      "-i",
      store.blobPath(a.digest),
      "-vn",
      "-ar",
      "48000",
      "-ac",
      "2",
      "-c:a",
      "pcm_f32le",
      trimmed,
    ]);
    const durationSamples = frameSamples(a.durationFrames, p.fps);
    let filter = `aresample=48000,${tempo(a.speed)},volume=${a.gainDb}dB`;
    if (a.fadeInFrames)
      filter += `,afade=t=in:ss=0:ns=${frameSamples(a.fadeInFrames, p.fps)}`;
    if (a.fadeOutFrames)
      filter += `,afade=t=out:ss=${Math.max(0, durationSamples - frameSamples(a.fadeOutFrames, p.fps))}:ns=${frameSamples(a.fadeOutFrames, p.fps)}`;
    filter += `,apad=whole_len=${durationSamples},atrim=end_sample=${durationSamples}`;
    if (padTimeline)
      filter += `,adelay=${frameSamples(a.startFrame, p.fps)}S:all=1,apad=whole_len=${m.totalSamples},atrim=end_sample=${m.totalSamples}`;
    await ff([
      ...(a.loop ? ["-stream_loop", "-1"] : []),
      "-i",
      trimmed,
      "-af",
      filter,
      "-ar",
      "48000",
      "-ac",
      "2",
      "-c:a",
      "pcm_f32le",
      dest,
    ]);
  } finally {
    fs.rmSync(trimmed, { force: true });
  }
}

export async function renderTimeline(input: {
  store: Store;
  manifest: TimelineManifest;
  snapshot: z.infer<typeof RunSnapshot>;
  workDir: string;
  signal: AbortSignal;
}): Promise<{ files: Record<string, string>; receipt: unknown }> {
  const { store, manifest: m, snapshot, workDir, signal } = input,
    p = m.output,
    fps = `${p.fps.num}/${p.fps.den}`;
  const ff = async (args: string[]) =>
    processRun("ffmpeg", ["-hide_banner", "-nostdin", "-y", ...args], {
      signal,
    });
  const asset = (ref: { assetId: string; version: string }): string => {
    const a = snapshot.assets.find(
      (a) => a.assetId === ref.assetId && a.version === ref.version,
    );
    if (!a || !store.verifyBlob(a.digest))
      throw new WeaverError("INTEGRITY_FAILED", "素材摘要缺失", { ref });
    return store.blobPath(a.digest);
  };
  const segmentFiles: string[] = [];
  for (const [i, visual] of m.visuals.entries()) {
    signal.throwIfAborted();
    const dest = path.join(
      workDir,
      `segment-${String(i).padStart(5, "0")}.mp4`,
    );
    const maskFilters = m.masks
      .filter((mask) => mask.sceneId === visual.sceneId)
      .map(
        (mask) =>
          `drawbox=x=${mask.x}*iw:y=${mask.y}*ih:w=${mask.width}*iw:h=${mask.height}*ih:color=${mask.color}:t=fill`,
      );
    const segmentArgs: string[] = [];
    const filters: string[] = [];
    const shouldEncode = visual.kind !== "card" || maskFilters.length > 0;
    if (visual.kind === "card") {
      const job = path.join(workDir, `card-${i}.json`);
      fs.writeFileSync(
        job,
        canonical(
          CardRenderInput.parse({
            cardSpec: visual.cardSpec,
            locale: m.locale,
            output: p,
            durationFrames: visual.durationFrames,
            adapterFingerprint:
              m.tools.cardAdapter && m.tools.cardAdapter !== "unused"
                ? z
                    .object({ fingerprint: z.string() })
                    .parse(JSON.parse(m.tools.cardAdapter)).fingerprint
                : undefined,
          }),
        ),
      );
      const rawCard = path.join(workDir, `card-raw-${i}.mp4`);
      const card = nodeScriptInvocation(currentRuntime().tools.cardRenderer, [
        job,
        rawCard,
      ]);
      await processRun(card.command, card.args, { signal, env: card.env });
      await verifyVideo(
        rawCard,
        {
          width: p.width,
          height: p.height,
          fps: p.fps,
          frames: visual.durationFrames,
          audio: false,
        },
        signal,
      );
      segmentArgs.push("-i", rawCard);
      filters.push("format=yuv420p");
    } else {
      const framing = visual.framing,
        source = asset(visual.kind === "still" ? visual.image : visual.source);
      const normalize =
        framing.fit === "contain"
          ? `scale=${p.width}:${p.height}:force_original_aspect_ratio=decrease:force_divisible_by=2,pad=${p.width}:${p.height}:(ow-iw)/2:(oh-ih)/2:color=black`
          : `scale=${p.width}:${p.height}:force_original_aspect_ratio=increase:force_divisible_by=2,crop=${p.width}:${p.height}:(iw-ow)*${framing.focusX}:(ih-oh)*${framing.focusY}`;
      if (visual.kind === "still") {
        const name =
          snapshot.assets.find(
            (a) =>
              a.assetId === visual.image.assetId &&
              a.version === visual.image.version,
          )?.name || "still.png";
        const linked = path.join(
          workDir,
          `still-${i}${path.extname(name) || ".png"}`,
        );
        fs.copyFileSync(source, linked);
        segmentArgs.push("-loop", "1", "-framerate", fps, "-i", linked);
        filters.push("setpts=PTS-STARTPTS");
      } else {
        segmentArgs.push(
          "-ss",
          String(visual.sourceRange.startUs / 1e6),
          "-t",
          String(visual.sourceRange.durationUs / 1e6),
          "-i",
          source,
        );
        filters.push(
          `trim=duration=${visual.sourceRange.durationUs / 1e6},setpts=(PTS-STARTPTS)/${visual.speed}`,
        );
        if (visual.freezeFrames)
          filters.push(
            `tpad=stop_mode=clone:stop_duration=${seconds(visual.freezeFrames, m)}`,
          );
      }
      filters.push(
        `scale=trunc(iw*sar/2)*2:ih,setsar=1,${normalize},fps=${fps},format=yuv420p`,
      );
    }
    if (shouldEncode) {
      await ff([
        ...segmentArgs,
        "-an",
        "-vf",
        [...filters, ...maskFilters].join(","),
        "-frames:v",
        String(visual.durationFrames),
        "-c:v",
        "libx264",
        "-preset",
        "fast",
        "-crf",
        String(p.crf),
        "-pix_fmt",
        p.pixelFormat,
        "-color_primaries",
        "bt709",
        "-color_trc",
        "bt709",
        "-colorspace",
        "bt709",
        "-video_track_timescale",
        String(p.fps.num),
        dest,
      ]);
    } else {
      await ff([
        ...segmentArgs,
        "-map",
        "0:v:0",
        "-an",
        "-c:v",
        "copy",
        "-video_track_timescale",
        String(p.fps.num),
        dest,
      ]);
    }
    await verifyVideo(
      dest,
      {
        width: p.width,
        height: p.height,
        fps: p.fps,
        frames: visual.durationFrames,
        audio: false,
      },
      signal,
    );
    segmentFiles.push(dest);
  }
  const list = path.join(workDir, "segments.txt");
  fs.writeFileSync(
    list,
    segmentFiles
      .map((file) => `file '${file.replace(/'/g, "'\\''")}'`)
      .join("\n"),
  );
  const joined = path.join(workDir, "picture.mp4");
  await ff([
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    list,
    "-map",
    "0:v:0",
    "-c",
    "copy",
    joined,
  ]);
  const tracks: { file: string; role: string; ducking: boolean }[] = [];
  for (const [i, a] of m.audio.entries()) {
    if (!store.verifyBlob(a.digest))
      throw new WeaverError("INTEGRITY_FAILED", "指定音轨不存在", {
        digest: a.digest,
      });
    const dest = path.join(workDir, `audio-track-${i}.wav`);
    await renderAudioSegment({
      store,
      segment: a,
      manifest: m,
      workDir,
      stem: `audio-${i}`,
      dest,
      signal,
      padTimeline: true,
    });
    tracks.push({ file: dest, role: a.role, ducking: a.ducking });
  }
  let finalAudio: string | undefined,
    loudness: unknown = null;
  if (tracks.length) {
    const mixed = path.join(workDir, "mix.wav"),
      graphs: string[] = [],
      labels: string[] = [];
    const speechIndices = tracks.flatMap((t, i) =>
      t.role === "speech" ? [i] : [],
    );
    let index = tracks.length;
    const extraInputs: string[] = [];
    for (let i = 0; i < tracks.length; i++) {
      const label = `a${i}`;
      if (tracks[i].ducking && speechIndices.length) {
        const side = speechIndices
          .map((j) => {
            extraInputs.push("-i", tracks[j].file);
            return `[${index++}:a]`;
          })
          .join("");
        graphs.push(
          `${side}amix=inputs=${speechIndices.length}:normalize=0[side${i}]`,
        );
        graphs.push(
          `[${i}:a][side${i}]sidechaincompress=threshold=0.03:ratio=8:attack=15:release=250[${label}]`,
        );
      } else graphs.push(`[${i}:a]anull[${label}]`);
      labels.push(`[${label}]`);
    }
    graphs.push(
      `${labels.join("")}amix=inputs=${labels.length}:normalize=0:duration=longest,atrim=end_sample=${m.totalSamples}[mix]`,
    );
    await ff([
      ...tracks.flatMap((t) => ["-i", t.file]),
      ...extraInputs,
      "-filter_complex",
      graphs.join(";"),
      "-map",
      "[mix]",
      "-c:a",
      "pcm_f32le",
      mixed,
    ]);
    const loud = p.loudness,
      measured = await ff([
        "-i",
        mixed,
        "-af",
        `loudnorm=I=${loud.integratedLufs}:TP=${loud.truePeakDb}:LRA=11:print_format=json`,
        "-f",
        "null",
        "-",
      ]);
    const json = measured.stderr.match(/\{\s*"input_i"[\s\S]*?\}/)?.[0];
    if (!json) throw new WeaverError("LOUDNESS_FAILED", "没有获得响度测量结果");
    const stats = z
      .object({
        input_i: z.string(),
        input_tp: z.string(),
        input_lra: z.string(),
        input_thresh: z.string(),
        target_offset: z.string(),
      })
      .parse(JSON.parse(json));
    if (Number.isFinite(Number(stats.input_i))) {
      finalAudio = path.join(workDir, "master.wav");
      await ff([
        "-i",
        mixed,
        "-af",
        `loudnorm=I=${loud.integratedLufs}:TP=${loud.truePeakDb}:LRA=11:measured_I=${stats.input_i}:measured_TP=${stats.input_tp}:measured_LRA=${stats.input_lra}:measured_thresh=${stats.input_thresh}:offset=${stats.target_offset}:linear=true,aresample=48000,atrim=end_sample=${m.totalSamples}`,
        "-ac",
        "2",
        "-c:a",
        "pcm_s24le",
        finalAudio,
      ]);
      loudness = { measuredBeforeNormalization: stats, target: loud };
    } else {
      finalAudio = mixed;
      loudness = { silent: true, integratedLufs: null, truePeakDb: null };
    }
  }
  const srt = path.join(workDir, "captions.srt"),
    ass = path.join(workDir, "captions.ass"),
    manifestFile = path.join(workDir, "timeline.json"),
    video = path.join(workDir, "film.mp4");
  fs.writeFileSync(srt, toSrt(m));
  fs.writeFileSync(ass, toAss(m));
  fs.writeFileSync(manifestFile, canonical(m));
  const burn = m.captions.length && ["burn", "both"].includes(p.subtitles);
  const args = [
    "-i",
    joined,
    ...(finalAudio ? ["-i", finalAudio] : []),
    "-map",
    "0:v:0",
    ...(finalAudio
      ? [
          "-map",
          "1:a:0",
          "-c:a",
          "aac",
          "-b:a",
          "192k",
          "-ar",
          "48000",
          "-ac",
          "2",
        ]
      : ["-an"]),
  ];
  if (burn)
    args.push(
      "-vf",
      "ass=captions.ass",
      "-c:v",
      "libx264",
      "-crf",
      String(p.crf),
      "-preset",
      "fast",
      "-pix_fmt",
      "yuv420p",
    );
  else args.push("-c:v", "copy");
  args.push(
    "-frames:v",
    String(m.totalFrames),
    "-movflags",
    "+faststart",
    "-bsf:v",
    "h264_metadata=colour_primaries=1:transfer_characteristics=1:matrix_coefficients=1",
    "-color_primaries",
    "bt709",
    "-color_trc",
    "bt709",
    "-colorspace",
    "bt709",
    video,
  );
  await processRun("ffmpeg", ["-hide_banner", "-nostdin", "-y", ...args], {
    signal,
    cwd: workDir,
  });
  const verification = await verifyVideo(
    video,
    {
      width: p.width,
      height: p.height,
      fps: p.fps,
      frames: m.totalFrames,
      audio: !!finalAudio,
      totalSamples: m.totalSamples,
      colorTransfer: "bt709",
    },
    signal,
  );
  const proxy = path.join(workDir, "proxy.mp4"),
    proxyScale = Math.min(1, 640 / Math.max(p.width, p.height)),
    proxyWidth = Math.max(2, Math.floor((p.width * proxyScale) / 2) * 2),
    proxyHeight = Math.max(2, Math.floor((p.height * proxyScale) / 2) * 2);
  await ff([
    "-i",
    video,
    "-vf",
    `scale=${proxyWidth}:${proxyHeight}`,
    "-frames:v",
    String(m.totalFrames),
    "-c:v",
    "libx264",
    "-crf",
    "28",
    "-bsf:v",
    "h264_metadata=colour_primaries=1:transfer_characteristics=1:matrix_coefficients=1",
    "-preset",
    "fast",
    "-c:a",
    "copy",
    proxy,
  ]);
  await verifyVideo(
    proxy,
    {
      width: proxyWidth,
      height: proxyHeight,
      fps: p.fps,
      frames: m.totalFrames,
      audio: !!finalAudio,
      totalSamples: m.totalSamples,
      colorTransfer: "bt709",
    },
    signal,
  );
  const receipt = {
    schemaVersion: 2,
    deliverable: true,
    estimatedTiming: m.captions.some((cue) => cue.timingQuality === "estimated"),
    timingQualities: [...new Set(m.captions.map((c) => c.timingQuality))],
    totalFrames: m.totalFrames,
    totalSamples: m.totalSamples,
    audioPadding: "AAC 编码允许最多 2048 个 48kHz 样本 padding",
    verification,
    loudness,
    output: p,
    tools: m.tools,
  };
  const receiptFile = path.join(workDir, "delivery-receipt.json");
  fs.writeFileSync(receiptFile, canonical(receipt));
  return {
    files: {
      video,
      proxy,
      srt,
      ass,
      manifest: manifestFile,
      receipt: receiptFile,
      ...(finalAudio ? { audio: finalAudio } : {}),
      ...Object.fromEntries(
        segmentFiles.map((file, i) => [`segment-${i}`, file]),
      ),
    },
    receipt,
  };
}
