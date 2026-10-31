import {
  z,
  RunSnapshot,
  VerifiedFacts,
  TimelineManifest,
  Issue,
  OutputProfile,
  Frames,
  Samples,
  Microseconds,
  CaptionStyle,
  refKey,
  speechOf,
  type Scene,
  type CaptionCue,
} from "../contracts/index.ts";
import {
  add,
  rational,
  usSeconds,
  frameSeconds,
  secondsFrames,
  frameSamples,
  frameUs,
  type Rational,
} from "./clock.ts";

export function compileTimeline(
  snapshot: z.infer<typeof RunSnapshot>,
  facts: z.infer<typeof VerifiedFacts>,
  locale: string,
  output: OutputProfile,
): { ok: true; manifest: TimelineManifest } | { ok: false; issues: Issue[] } {
  const doc = snapshot.projectRevision.document,
    issues: Issue[] = [];
  const visuals: TimelineManifest["visuals"] = [],
    audio: TimelineManifest["audio"] = [],
    captions: TimelineManifest["captions"] = [];
  let cursor = 0,
    exact = rational(0n, 1n);
  const problem = (
    code: string,
    path: string,
    message: string,
    hints: string[] = [],
  ): void => {
    issues.push(Issue.parse({ code, path, message, severity: "error", hints }));
  };
  const media = (ref: { assetId: string; version: string }) =>
    snapshot.assets.find(
      (a) => a.assetId === ref.assetId && a.version === ref.version,
    );
  const track = doc.captions.find((t) => t.locale === locale);
  const style = track?.style || CaptionStyle.parse({});
  if (track && track.mode !== "none")
    for (const cue of track.cues) {
      const time = cue.time;
      if (
        time.kind === "speech" &&
        !doc.scenes.some((s) => s.id === time.sceneId && speechOf(s))
      )
        problem(
          "CAPTION_SCENE_MISSING",
          `captions.${cue.id}`,
          "语音字幕没有对应的旁白场景",
        );
    }
  if (!doc.scenes.length)
    problem("EMPTY_PROJECT", "scenes", "草稿没有场景", [
      "添加 card、still 或 clip 场景",
    ]);
  if (!doc.locales.includes(locale))
    problem("LOCALE_MISSING", "locales", `没有声明语言 ${locale}`);
  for (const method of snapshot.library.filter(
    (v) => doc.method?.itemId === v.itemId && doc.method.version === v.version,
  )) {
    if (method.payload.kind !== "method") {
      problem("METHOD_KIND", "method", "绑定的库项不是方法");
      continue;
    }
    if (method.payload.clipAlignment === "observed-sequences") {
      const observationKey = (
        source: Parameters<typeof refKey>[0],
        range: { startUs: number; durationUs: number },
      ) => `${refKey(source)}:${range.startUs}:${range.durationUs}`;
      const windows = new Set(
        snapshot.observations.map((o) => observationKey(o.source, o.range)),
      );
      const clips = doc.scenes.filter((s) => s.kind === "clip"),
        used = new Set<string>();
      for (const clip of clips) {
        const key = observationKey(clip.source, clip.sourceRange);
        if (!windows.has(key) || used.has(key))
          problem(
            "METHOD_CONSTRAINT",
            `scenes.${clip.id}`,
            "方法要求按观察时间窗逐场选段且不重复",
          );
        else used.add(key);
      }
      if (used.size !== windows.size)
        problem("METHOD_CONSTRAINT", "scenes", "方法要求覆盖全部已绑定观察场");
    }
    for (const s of doc.scenes)
      if (
        method.payload.clipAudio &&
        s.kind === "clip" &&
        s.playback.audio.kind !== method.payload.clipAudio
      )
        problem(
          "METHOD_CONSTRAINT",
          `scenes.${s.id}`,
          `方法要求 ${method.payload.clipAudio} 声音策略`,
        );
  }
  for (const scene of doc.scenes) {
    const p = `scenes.${scene.id}`,
      speech = speechOf(scene),
      sf = facts.speech[`${locale}:${scene.id}`];
    if (speech && !sf) {
      problem("SPEECH_MISSING", p, "缺少真实旁白事实", [
        "检查语言、音色版本与准备作业",
      ]);
      continue;
    }
    const speechFrames = sf
      ? secondsFrames(
          rational(BigInt(sf.durationSamples), 48000n),
          output.fps,
          true,
        )
      : Frames.parse(0);
    let duration: Rational,
      sourceRange = scene.kind === "clip" ? scene.sourceRange : undefined,
      speed = 1,
      freezeFrames = 0;
    if (
      scene.kind === "card" &&
      (!scene.cardSpec.copy[locale] ||
        (!scene.cardSpec.copy[locale].headline.trim() &&
          !scene.cardSpec.copy[locale].lede.trim() &&
          !scene.cardSpec.copy[locale].points.some((p) => p.trim())))
    ) {
      problem("CARD_COPY_MISSING", p, `卡片缺 ${locale} 内容`);
      continue;
    }
    if (scene.kind === "still") {
      const a = media(scene.image);
      if (!a || a.kind !== "image" || !facts.media[refKey(scene.image)]) {
        problem("IMAGE_MISSING", p, "缺少已验证图片");
        continue;
      }
    }
    if (scene.kind !== "clip")
      duration = frameSeconds(
        scene.timing.kind === "fixed"
          ? scene.timing.frames
          : speechFrames + scene.timing.tailFrames,
        output.fps,
      );
    else {
      const fact = facts.media[refKey(scene.source)];
      if (!fact?.video) {
        problem("VIDEO_MISSING", p, "源片没有视频流或未完成探测");
        continue;
      }
      if (["smpte2084", "arib-std-b67"].includes(fact.video.colorTransfer))
        problem(
          "HDR_UNSUPPORTED",
          p,
          "当前 SDR profile 拒绝 HDR 源，请先显式转换",
        );
      const range = scene.sourceRange;
      if (range.startUs + range.durationUs > fact.durationUs) {
        problem("SOURCE_RANGE", p, "源窗超出真实媒体时长");
        continue;
      }
      duration =
        scene.playback.kind === "source"
          ? usSeconds(range.durationUs)
          : frameSeconds(speechFrames + scene.playback.tailFrames, output.fps);
      const plannedUs = (Number(duration.n) / Number(duration.d)) * 1e6;
      if (scene.playback.kind === "speech") {
        if (plannedUs > range.durationUs + 0.001) {
          switch (scene.playback.overflow.kind) {
            case "reject":
              problem("NARRATION_OVERFLOW", p, "旁白超过选定源窗", [
                "缩短旁白、重选源窗，或显式选择有限定格/变速",
              ]);
              break;
            case "freeze": {
              freezeFrames =
                secondsFrames(duration, output.fps) -
                secondsFrames(usSeconds(range.durationUs), output.fps);
              if (freezeFrames > scene.playback.overflow.maxFrames)
                problem("FREEZE_LIMIT", p, "末帧定格超过作者允许上限");
              break;
            }
            case "speed": {
              speed = range.durationUs / plannedUs;
              if (
                speed < scene.playback.overflow.min ||
                speed > scene.playback.overflow.max
              )
                problem("SPEED_LIMIT", p, "画面速度超出作者允许范围");
              break;
            }
          }
        } else
          sourceRange = {
            startUs: range.startUs,
            durationUs: Microseconds.parse(
              Math.min(range.durationUs, Math.max(1, Math.round(plannedUs))),
            ),
          };
      }
    }
    exact = add(exact, duration);
    const end = secondsFrames(exact, output.fps);
    if (end <= cursor) {
      problem("SCENE_TOO_SHORT", p, "场景不足一个成片帧，请调整源窗");
      continue;
    }
    const durationFrames = Frames.parse(end - cursor);
    if (
      speech &&
      sf &&
      frameSamples(durationFrames, output.fps) < sf.durationSamples
    )
      problem("NARRATION_OVERFLOW", p, "场景时长会截断旁白");
    const base = {
      sceneId: scene.id,
      startFrame: Frames.parse(cursor),
      durationFrames,
      sourceEvidence:
        scene.kind === "clip"
          ? `选定源窗 ${scene.sourceRange.startUs}+${scene.sourceRange.durationUs} 微秒`
          : "作者修订",
    };
    if (scene.kind === "card")
      visuals.push({ ...base, kind: "card", cardSpec: scene.cardSpec });
    if (scene.kind === "still")
      visuals.push({
        ...base,
        kind: "still",
        image: scene.image,
        framing: scene.framing,
      });
    if (scene.kind === "clip" && sourceRange)
      visuals.push({
        ...base,
        kind: "clip",
        source: scene.source,
        sourceRange,
        speed,
        freezeFrames: Frames.parse(Math.max(0, freezeFrames)),
        framing: scene.framing,
      });
    if (sf) {
      const gainDb =
        scene.kind === "clip" &&
        (scene.playback.audio.kind === "mix" ||
          scene.playback.audio.kind === "narration")
          ? scene.playback.audio.gainDb
          : 0;
      audio.push({
        role: "speech",
        digest: sf.digest,
        startFrame: base.startFrame,
        durationFrames,
        trimUs: Microseconds.parse(0),
        sourceDurationUs: Microseconds.parse(
          Math.round((sf.durationSamples / 48000) * 1e6),
        ),
        speed: 1,
        loop: false,
        gainDb,
        fadeInFrames: Frames.parse(0),
        fadeOutFrames: Frames.parse(0),
        ducking: false,
        sceneId: scene.id,
      });
    }
    if (
      scene.kind === "clip" &&
      sourceRange &&
      (scene.playback.audio.kind === "original" ||
        scene.playback.audio.kind === "mix") &&
      facts.media[refKey(scene.source)]?.audio
    ) {
      const a = media(scene.source),
        policy = scene.playback.audio;
      if (!a) problem("MEDIA_MISSING", p, "源版本不存在");
      else
        audio.push({
          role: "source",
          digest: a.digest,
          startFrame: base.startFrame,
          durationFrames,
          trimUs: sourceRange.startUs,
          sourceDurationUs: sourceRange.durationUs,
          speed,
          loop: false,
          gainDb:
            policy.kind === "original" ? policy.gainDb : policy.sourceGainDb,
          fadeInFrames: Frames.parse(0),
          fadeOutFrames: Frames.parse(0),
          ducking: policy.kind === "mix" && policy.ducking,
          sceneId: scene.id,
        });
    }
    if (track && track.mode !== "none") {
      let cues = [
        ...track.cues.filter(
          (c) => c.time.kind === "speech" && c.time.sceneId === scene.id,
        ),
      ];
      if (!cues.length && speech && sf) {
        if (track.mode === "precise") {
          cues = sf.cues;
          if (
            !cues.length ||
            cues.some(
              (c) =>
                c.timingQuality !== "aligned" && c.timingQuality !== "native",
            )
          )
            problem("ALIGNMENT_REQUIRED", p, "精确字幕缺少对齐结果", [
              "配置 Qwen3 强制对齐或导入人工 SRT",
            ]);
        }
        if (track.mode === "estimated") {
          const text =
            speech.kind === "authored"
              ? speech.text[locale]
              : speech.text[locale];
          if (text) {
            const parts = text.match(/[^。！？.!?；;]+[。！？.!?；;]?/gu) || [
              text,
            ];
            let offset = 0;
            cues = parts.map((text, i) => {
              const start = offset;
              offset += text.length;
              return {
                id: `${scene.id}-estimated-${i}`,
                text,
                timingQuality: "estimated",
                provenance: "显式选择估算字幕",
                time: {
                  kind: "speech",
                  sceneId: scene.id,
                  range: {
                    startUs: Microseconds.parse(
                      Math.round(
                        (((start / parts.join("").length) *
                          sf.durationSamples) /
                          48000) *
                          1e6,
                      ),
                    ),
                    durationUs: Microseconds.parse(
                      Math.max(
                        1,
                        Math.round(
                          (((text.length / parts.join("").length) *
                            sf.durationSamples) /
                            48000) *
                            1e6,
                        ),
                      ),
                    ),
                  },
                },
              };
            });
          }
        }
      }
      for (const cue of cues)
        if (cue.time.kind === "speech") {
          const start = secondsFrames(
              usSeconds(cue.time.range.startUs),
              output.fps,
            ),
            stop = secondsFrames(
              usSeconds(cue.time.range.startUs + cue.time.range.durationUs),
              output.fps,
            );
          if (stop > durationFrames || start >= durationFrames || stop <= start)
            problem(
              "CAPTION_RANGE",
              `captions.${cue.id}`,
              "字幕超过场景时长或不足一帧",
            );
          else
            captions.push({
              id: cue.id,
              text: cue.text,
              startFrame: Frames.parse(cursor + start),
              durationFrames: Frames.parse(stop - start),
              timingQuality: cue.timingQuality,
              provenance: cue.provenance,
              mapping: cue.time,
            });
        }
    }
    cursor += durationFrames;
  }
  if (track && track.mode !== "none")
    for (const cue of track.cues) {
      if (cue.time.kind === "timeline") {
        const from = secondsFrames(
            frameSeconds(cue.time.startFrame, track.fps),
            output.fps,
          ),
          end = secondsFrames(
            frameSeconds(
              cue.time.startFrame + cue.time.durationFrames,
              track.fps,
            ),
            output.fps,
          );
        if (end > cursor || end <= from)
          problem(
            "CAPTION_RANGE",
            `captions.${cue.id}`,
            "字幕超过成片时长或不足一帧",
          );
        else
          captions.push({
            id: cue.id,
            text: cue.text,
            startFrame: from,
            durationFrames: Frames.parse(end - from),
            timingQuality: cue.timingQuality,
            provenance: cue.provenance,
            mapping: cue.time,
          });
      }
      if (cue.time.kind === "source") {
        const time = cue.time;
        for (const visual of visuals)
          if (
            visual.kind === "clip" &&
            refKey(visual.source) === refKey(time.source)
          ) {
            const start = Math.max(
                time.range.startUs,
                visual.sourceRange.startUs,
              ),
              end = Math.min(
                time.range.startUs + time.range.durationUs,
                visual.sourceRange.startUs + visual.sourceRange.durationUs,
              );
            if (end <= start) continue;
            const from = secondsFrames(
                usSeconds(
                  Math.round(
                    (start - visual.sourceRange.startUs) / visual.speed,
                  ),
                ),
                output.fps,
              ),
              to = secondsFrames(
                usSeconds(
                  Math.round((end - visual.sourceRange.startUs) / visual.speed),
                ),
                output.fps,
              );
            const clippedEnd = Math.min(visual.durationFrames, to);
            if (clippedEnd <= from) continue;
            captions.push({
              id: `${cue.id}-${visual.sceneId}`,
              text: cue.text,
              startFrame: Frames.parse(visual.startFrame + from),
              durationFrames: Frames.parse(clippedEnd - from),
              timingQuality: cue.timingQuality,
              provenance: cue.provenance,
              mapping: time,
            });
          }
      }
    }
  if (doc.bgm) {
    const bgm = doc.bgm,
      fact = facts.media[refKey(bgm.source)],
      asset = media(bgm.source);
    if (!asset || !fact?.audio)
      problem("BGM_MISSING", "bgm", "指定的背景音乐不存在或没有音轨");
    else if (bgm.range.startUs + bgm.range.durationUs > fact.durationUs)
      problem("BGM_RANGE", "bgm", "音乐裁剪超出真实时长");
    else
      audio.push({
        role: "bgm",
        digest: asset.digest,
        startFrame: Frames.parse(0),
        durationFrames: Frames.parse(cursor),
        trimUs: bgm.range.startUs,
        sourceDurationUs: bgm.range.durationUs,
        speed: 1,
        loop: bgm.loop,
        gainDb: bgm.gainDb,
        fadeInFrames: bgm.fadeInFrames,
        fadeOutFrames: bgm.fadeOutFrames,
        ducking: bgm.ducking,
      });
  }
  if (issues.some((i) => i.severity === "error")) return { ok: false, issues };
  return {
    ok: true,
    manifest: TimelineManifest.parse({
      schemaVersion: 2,
      locale,
      output,
      totalFrames: cursor,
      totalSamples: frameSamples(cursor, output.fps),
      visuals,
      audio,
      captions: captions.sort(
        (a, b) => a.startFrame - b.startFrame || a.id.localeCompare(b.id),
      ),
      captionStyle: style,
      masks: doc.masks,
      tools: facts.tools,
    }),
  };
}
