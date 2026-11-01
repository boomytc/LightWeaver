import { useState } from "react";
import {
  Frames,
  LibraryVersion,
  MediaAssetVersion,
  ProjectDocument,
  Scene,
  refKey,
  speechOf,
  z,
  type Speech,
} from "@lightweaver/weaver/contracts";
import { mediaUrl } from "../api";
import { localeName } from "../domain/format";
import { MaskEditor, type SceneMask } from "./MaskEditor";
import { SourceWindowPlayer } from "./SourceWindowPlayer";
import { Field } from "../ui/Field";
import { MediaSourceDetails } from "../assets/MediaSourceDetails";

export function SceneEditor({
  scene: s,
  locale,
  assets,
  profile,
  voices,
  masks = [],
  onMasksChange,
  onChange,
  preview = true,
}: {
  scene: Scene;
  locale: string;
  assets: z.infer<typeof MediaAssetVersion>[];
  profile: ProjectDocument["profiles"][number];
  voices: z.infer<typeof LibraryVersion>[];
  masks?: SceneMask[];
  onMasksChange?: (masks: SceneMask[]) => void;
  onChange: (s: Scene) => void;
  preview?: boolean;
}) {
  const speech = speechOf(s),
    [localError, setLocalError] = useState("");
  const patch = (value: unknown) => {
    const r = Scene.safeParse(value);
    if (r.success) {
      setLocalError("");
      onChange(r.data);
    } else setLocalError(r.error.issues[0]?.message || "字段无效");
  };
  const speechChange = (next: Speech | undefined) => {
    if (s.kind !== "clip")
      onChange({
        ...s,
        timing:
          s.timing.kind === "fixed"
            ? { ...s.timing, speech: next }
            : next
              ? { ...s.timing, speech: next }
              : { kind: "fixed", frames: Frames.parse(90) },
      });
    else if (next) {
      const audio =
        s.playback.audio.kind === "mix"
          ? { ...s.playback.audio, speech: next }
          : { kind: "narration" as const, speech: next, gainDb: 0 };
      onChange({
        ...s,
        playback:
          s.playback.kind === "speech"
            ? { ...s.playback, audio }
            : { kind: "source", audio },
      });
    } else
      onChange({
        ...s,
        playback: { kind: "source", audio: { kind: "silent" } },
      });
  };
  const newSpeech = (): Speech => ({
    kind: "authored",
    text: { [locale]: "" },
    voice: voices[0]
      ? { [locale]: { itemId: voices[0].itemId, version: voices[0].version } }
      : {},
  });
  const selectAsset = (value: string) =>
    assets.find((a) => refKey(a) === value);
  const selectedAsset =
    s.kind === "card"
      ? undefined
      : selectAsset(refKey(s.kind === "clip" ? s.source : s.image));
  return (
    <div className="flex flex-col gap-4">
      {localError && <p className="error">{localError}</p>}
      <section className="flex flex-col gap-3 border-b border-line pb-5">
        <h3 className="m-0 text-xs font-semibold text-muted">01 · 视觉源与画幅裁剪</h3>
      {s.kind === "card" ? (
        <>
          <Field label="卡片样式">
            <select
              value={s.cardSpec.template}
              onChange={(e) =>
                onChange({
                  ...s,
                  cardSpec: {
                    ...s.cardSpec,
                    template: z
                      .enum(["title", "points", "close"])
                      .parse(e.target.value),
                  },
                })
              }
            >
              <option value="title">标题</option>
              <option value="points">要点</option>
              <option value="close">收束</option>
            </select>
          </Field>
          <Field label="标题">
            <input
              value={s.cardSpec.copy[locale]?.headline || ""}
              onChange={(e) =>
                onChange({
                  ...s,
                  cardSpec: {
                    ...s.cardSpec,
                    copy: {
                      ...s.cardSpec.copy,
                      [locale]: {
                        ...(s.cardSpec.copy[locale] || {
                          kicker: "",
                          lede: "",
                          points: [],
                          tags: [],
                          headline: "",
                        }),
                        headline: e.target.value,
                      },
                    },
                  },
                })
              }
            />
          </Field>
          <Field label="要点（每行一条，左右对照用 ||）">
            <textarea
              value={s.cardSpec.copy[locale]?.points.join("\n") || ""}
              onChange={(e) =>
                onChange({
                  ...s,
                  cardSpec: {
                    ...s.cardSpec,
                    copy: {
                      ...s.cardSpec.copy,
                      [locale]: {
                        ...(s.cardSpec.copy[locale] || {
                          kicker: "",
                          lede: "",
                          points: [],
                          tags: [],
                          headline: "",
                        }),
                        points: e.target.value.split("\n"),
                      },
                    },
                  },
                })
              }
            />
          </Field>
        </>
      ) : (
        <>
          <Field label={s.kind === "clip" ? "源片" : "图片"}>
            <select
              value={refKey(s.kind === "clip" ? s.source : s.image)}
              onChange={(e) => {
                const a = selectAsset(e.target.value);
                if (!a) return;
                const ref = { assetId: a.assetId, version: a.version };
                onChange(
                  s.kind === "clip"
                    ? { ...s, source: ref }
                    : { ...s, image: ref },
                );
              }}
            >
              {assets
                .filter(
                  (a) => a.kind === (s.kind === "clip" ? "video" : "image"),
                )
                .map((a) => (
                  <option value={refKey(a)} key={a.version}>
                    {a.name}
                  </option>
                ))}
            </select>
          </Field>
          <MediaSourceDetails asset={selectedAsset} assets={assets} />
          {preview && s.kind === "clip" && (
            <SourceWindowPlayer
              sourceUrl={
                selectedAsset ? mediaUrl(selectedAsset.digest) : undefined
              }
              sourceKey={refKey(s.source)}
              range={s.sourceRange}
              label="当前片段源窗"
            />
          )}
          {preview && s.kind === "still" && selectedAsset && (
            <div className="scene-preview">
              <img
                className="scene-still"
                src={mediaUrl(selectedAsset.digest)}
                alt="当前静帧"
              />
            </div>
          )}
          <div className="actions">
            <Field label="画面适配">
              <select
                value={s.framing.fit}
                onChange={(e) =>
                  onChange({
                    ...s,
                    framing: {
                      ...s.framing,
                      fit: z.enum(["contain", "cover"]).parse(e.target.value),
                    },
                  })
                }
              >
                <option value="contain">完整显示</option>
                <option value="cover">填满画幅</option>
              </select>
            </Field>
            {s.kind === "clip" && (
              <>
                <Field label="源入点（秒）">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={s.sourceRange.startUs / 1e6}
                    onChange={(e) =>
                      patch({
                        ...s,
                        sourceRange: {
                          ...s.sourceRange,
                          startUs: Math.round(Number(e.target.value) * 1e6),
                        },
                      })
                    }
                  />
                </Field>
                <Field label="源窗时长（秒）">
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={s.sourceRange.durationUs / 1e6}
                    onChange={(e) =>
                      patch({
                        ...s,
                        sourceRange: {
                          ...s.sourceRange,
                          durationUs: Math.round(Number(e.target.value) * 1e6),
                        },
                      })
                    }
                  />
                </Field>
              </>
            )}
          </div>
        </>
      )}
      </section>
      <section className="flex flex-col gap-3 border-b border-line pb-5">
        <h3 className="m-0 text-xs font-semibold text-muted">02 · 声音策略与旁白</h3>
      {s.kind === "clip" && (
        <Field label="声音策略">
          <select
            value={s.playback.audio.kind}
            onChange={(e) => {
              const kind = e.target.value;
              if (kind === "silent" || kind === "original")
                onChange({
                  ...s,
                  playback: {
                    kind: "source",
                    audio: kind === "silent" ? { kind } : { kind, gainDb: 0 },
                  },
                });
              else {
                const sp = speech || newSpeech();
                const audio =
                  kind === "mix"
                    ? {
                        kind: "mix" as const,
                        speech: sp,
                        gainDb: 0,
                        sourceGainDb: -12,
                        ducking: true,
                      }
                    : { kind: "narration" as const, speech: sp, gainDb: 0 };
                onChange({
                  ...s,
                  playback:
                    s.playback.kind === "speech"
                      ? { ...s.playback, audio }
                      : { kind: "source", audio },
                });
              }
            }}
          >
            <option value="silent">静音</option>
            <option value="original">保留原声</option>
            <option value="narration">旁白</option>
            <option value="mix">旁白与原声混音</option>
          </select>
        </Field>
      )}
      {s.kind !== "clip" && (
        <label className="check">
          <input
            type="checkbox"
            checked={!!speech}
            onChange={(e) =>
              speechChange(e.target.checked ? newSpeech() : undefined)
            }
          />
          添加旁白
        </label>
      )}
      {speech && (
        <>
          <Field label="旁白来源">
            <select
              value={speech.kind}
              onChange={(e) => {
                const a = assets.find((a) => a.kind === "audio");
                speechChange(
                  e.target.value === "authored"
                    ? newSpeech()
                    : {
                        kind: "imported",
                        text: {},
                        audio: a
                          ? {
                              [locale]: {
                                assetId: a.assetId,
                                version: a.version,
                              },
                            }
                          : {},
                      },
                );
              }}
            >
              <option value="authored">文案与音色</option>
              <option value="imported">已上传音频</option>
            </select>
          </Field>
          {speech.kind === "authored" ? (
            <>
              <Field label="旁白文案">
                <textarea
                  value={speech.text[locale] || ""}
                  onChange={(e) =>
                    speechChange({
                      ...speech,
                      text: { ...speech.text, [locale]: e.target.value },
                    })
                  }
                />
              </Field>
              <Field label="精确音色版本">
                <select
                  value={
                    speech.voice[locale]
                      ? `${speech.voice[locale].itemId}@${speech.voice[locale].version}`
                      : ""
                  }
                  onChange={(e) => {
                    const v = voices.find(
                      (v) => `${v.itemId}@${v.version}` === e.target.value,
                    );
                    if (v)
                      speechChange({
                        ...speech,
                        voice: {
                          ...speech.voice,
                          [locale]: { itemId: v.itemId, version: v.version },
                        },
                      });
                  }}
                >
                  <option value="">选择音色</option>
                  {voices.map((v) => (
                    <option
                      key={`${v.itemId}@${v.version}`}
                      value={`${v.itemId}@${v.version}`}
                    >
                      {v.payload.name} · {v.version.slice(0, 8)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={`场景语气（可选，${localeName(locale)}）`}>
                <textarea
                  value={speech.style?.[locale] || ""}
                  placeholder="例如：克制、略带迟疑；留空时沿用音色版本默认语气"
                  onChange={(event) => {
                    const style = {
                      ...(speech.style || {}),
                      [locale]: event.target.value,
                    };
                    if (!event.target.value.trim()) delete style[locale];
                    speechChange({
                      ...speech,
                      style: Object.keys(style).length ? style : undefined,
                    });
                  }}
                />
              </Field>
            </>
          ) : (
            <Field label="旁白音频">
              <select
                value={speech.audio[locale] ? refKey(speech.audio[locale]) : ""}
                onChange={(e) => {
                  const a = selectAsset(e.target.value);
                  if (a)
                    speechChange({
                      ...speech,
                      audio: {
                        ...speech.audio,
                        [locale]: { assetId: a.assetId, version: a.version },
                      },
                    });
                }}
              >
                <option value="">选择音频</option>
                {assets
                  .filter((a) => a.kind === "audio")
                  .map((a) => (
                    <option key={a.version} value={refKey(a)}>
                      {a.name}
                    </option>
                  ))}
              </select>
            </Field>
          )}
        </>
      )}
      </section>
      <section className="flex flex-col gap-3 border-b border-line pb-5">
        <h3 className="m-0 text-xs font-semibold text-muted">03 · 时长与超窗处理</h3>
      {s.kind !== "clip" ? (
        <div className="actions">
          <Field label="时长策略">
            <select
              value={s.timing.kind}
              onChange={(e) => {
                if (e.target.value === "speech" && speech)
                  patch({
                    ...s,
                    timing: { kind: "speech", speech, tailFrames: 8 },
                  });
                else
                  patch({
                    ...s,
                    timing: { kind: "fixed", frames: 90, speech },
                  });
              }}
            >
              <option value="fixed">固定帧长</option>
              {speech && <option value="speech">真实旁白加尾帧</option>}
            </select>
          </Field>
          <Field label={s.timing.kind === "fixed" ? "帧数" : "尾帧数"}>
            <input
              type="number"
              min="0"
              value={
                s.timing.kind === "fixed"
                  ? s.timing.frames
                  : s.timing.tailFrames
              }
              onChange={(e) =>
                patch({
                  ...s,
                  timing: {
                    ...s.timing,
                    [s.timing.kind === "fixed" ? "frames" : "tailFrames"]:
                      Number(e.target.value),
                  },
                })
              }
            />
          </Field>
        </div>
      ) : (
        <>
          <Field label="画面时长">
            <select
              value={s.playback.kind}
              onChange={(e) => {
                const audio = s.playback.audio;
                if (
                  e.target.value === "speech" &&
                  (audio.kind === "narration" || audio.kind === "mix")
                )
                  patch({
                    ...s,
                    playback: {
                      kind: "speech",
                      audio,
                      tailFrames: 0,
                      overflow: { kind: "reject" },
                    },
                  });
                else patch({ ...s, playback: { kind: "source", audio } });
              }}
            >
              <option value="source">由选定源窗决定</option>
              {speech && <option value="speech">由真实旁白决定</option>}
            </select>
          </Field>
          {s.playback.kind === "speech" && (
            <div className="actions">
              <Field label="旁白超窗处理">
                <select
                  value={s.playback.overflow.kind}
                  onChange={(e) =>
                    patch({
                      ...s,
                      playback: {
                        ...s.playback,
                        overflow:
                          e.target.value === "freeze"
                            ? { kind: "freeze", maxFrames: 30 }
                            : e.target.value === "speed"
                              ? { kind: "speed", min: 0.5, max: 2 }
                              : { kind: "reject" },
                      },
                    })
                  }
                >
                  <option value="reject">报错并保留草稿</option>
                  <option value="freeze">允许有限末帧定格</option>
                  <option value="speed">允许限定速度适配</option>
                </select>
              </Field>
              {s.playback.overflow.kind === "freeze" && (
                <Field label="最多定格帧数">
                  <input
                    type="number"
                    min="0"
                    value={s.playback.overflow.maxFrames}
                    onChange={(e) =>
                      patch({
                        ...s,
                        playback: {
                          ...s.playback,
                          overflow: {
                            kind: "freeze",
                            maxFrames: Number(e.target.value),
                          },
                        },
                      })
                    }
                  />
                </Field>
              )}
              {s.playback.overflow.kind === "speed" && (
                <>
                  <Field label="最小速度">
                    <input
                      type="number"
                      step="0.1"
                      value={s.playback.overflow.min}
                      onChange={(e) =>
                        patch({
                          ...s,
                          playback: {
                            ...s.playback,
                            overflow: {
                              ...(s.playback.kind === "speech"
                                ? s.playback.overflow
                                : {}),
                              min: Number(e.target.value),
                            },
                          },
                        })
                      }
                    />
                  </Field>
                  <Field label="最大速度">
                    <input
                      type="number"
                      step="0.1"
                      value={s.playback.overflow.max}
                      onChange={(e) =>
                        patch({
                          ...s,
                          playback: {
                            ...s.playback,
                            overflow: {
                              ...(s.playback.kind === "speech"
                                ? s.playback.overflow
                                : {}),
                              max: Number(e.target.value),
                            },
                          },
                        })
                      }
                    />
                  </Field>
                </>
              )}
            </div>
          )}
          {s.playback.audio.kind === "original" && (
            <Field label="原声增益（dB）">
              <input
                type="number"
                value={s.playback.audio.gainDb}
                onChange={(e) =>
                  patch({
                    ...s,
                    playback: {
                      ...s.playback,
                      audio: {
                        ...s.playback.audio,
                        gainDb: Number(e.target.value),
                      },
                    },
                  })
                }
              />
            </Field>
          )}
          {s.playback.audio.kind === "mix" && (
            <div className="actions">
              <Field label="原声增益（dB）">
                <input
                  type="number"
                  value={s.playback.audio.sourceGainDb}
                  onChange={(e) =>
                    patch({
                      ...s,
                      playback: {
                        ...s.playback,
                        audio: {
                          ...s.playback.audio,
                          sourceGainDb: Number(e.target.value),
                        },
                      },
                    })
                  }
                />
              </Field>
              <label className="check">
                <input
                  type="checkbox"
                  checked={s.playback.audio.ducking}
                  onChange={(e) =>
                    patch({
                      ...s,
                      playback: {
                        ...s.playback,
                        audio: {
                          ...s.playback.audio,
                          ducking: e.target.checked,
                        },
                      },
                    })
                  }
                />
                旁白驱动原声压低
              </label>
            </div>
          )}
        </>
      )}
      </section>
      {onMasksChange && (
        <section className="flex flex-col gap-3">
          <h3 className="m-0 text-xs font-semibold text-muted">04 · 遮罩编辑器</h3>
          <MaskEditor
            sceneId={s.id}
            masks={masks}
            profile={profile}
            coordinateOnly={s.kind === "card"}
            media={
              s.kind !== "card" && selectedAsset
                ? {
                    kind: s.kind === "clip" ? "video" : "image",
                    url: mediaUrl(selectedAsset.digest),
                    sourceKey: refKey(s.kind === "clip" ? s.source : s.image),
                    startUs:
                      s.kind === "clip" ? s.sourceRange.startUs : undefined,
                    framing: s.framing,
                  }
                : undefined
            }
            onChange={onMasksChange}
          />
        </section>
      )}
    </div>
  );
}
