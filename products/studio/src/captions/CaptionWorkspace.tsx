import { useState } from "react";
import { z, refKey, type CaptionTrack } from "@lightweaver/weaver/contracts";
import { localeName } from "../domain/format";
import { useSession } from "../session/context";
import { Field } from "../ui/Field";
import { CaptionAssistPanel } from "./CaptionAssistPanel";
import { CaptionTrackEditor } from "./CaptionEditors";

const modes = z.enum(["none", "manual", "precise", "estimated"]);

export function CaptionWorkspace() {
  const session = useSession();
  const draft = session.draft;
  const ctx = session.ctx;
  const [source, setSource] = useState("");
  const [locale, setLocale] = useState(session.locale);
  if (!draft || !ctx) return null;
  const track = draft.captions.find((item) => item.locale === locale);
  const updateTrack = (next: CaptionTrack) =>
    session.edit({
      ...draft,
      captions: [...draft.captions.filter((item) => item.locale !== locale), next],
    });
  const defaultStyle = {
    font: "Noto Sans CJK SC",
    size: 48,
    color: "#FFFFFF",
    outline: 2,
    marginV: 80,
    maxChars: 24,
  };
  return (
    <div className="min-w-0">
      <p>
        人工字幕、语音对齐和估算字幕使用同一条 cue。编辑文本或时码会标为人工，并清掉逐词时间。原始转写保留。源片时间、场景语音时间和成片时间分开保存。
      </p>
      <div className="actions">
        <Field label="字幕语言">
          <select
            value={locale}
            onChange={(event) => {
              setLocale(event.target.value);
              session.setLocale(event.target.value);
            }}
          >
            {draft.locales.map((item) => (
              <option key={item} value={item}>
                {localeName(item)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="导入字幕 / 来源对照">
          <select value={source} onChange={(event) => setSource(event.target.value)}>
            <option value="">成片时间</option>
            {ctx.assets
              .filter((asset) => asset.kind === "video" || asset.kind === "audio")
              .map((asset) => (
                <option key={asset.version} value={refKey(asset)}>
                  {asset.kind === "audio" ? "音轨" : "源片"}：{asset.name}
                </option>
              ))}
          </select>
        </Field>
        <button
          type="button"
          disabled={
            session.busy ||
            session.dirty ||
            !ctx.analysis.some(
              (entry) => entry.kind === "asr" && entry.state === "current" && (entry.locale === undefined || entry.locale === locale),
            )
          }
          onClick={() =>
            void session.adoptAnalysisCaptions({
              sourceId: source ? draft.assets.find((asset) => refKey(asset) === source)?.assetId : undefined,
              locale,
            })
          }
        >
          从转写采用为{localeName(locale)}
        </button>
      </div>
      <h2>
        {localeName(locale)}字幕
        {track?.translationLocale ? ` · ${localeName(track.translationLocale)}译文` : ""}
      </h2>
      {track?.translationLocale && (
        <p className="notice-inline">
          这是 {localeName(locale)} 字幕的 {localeName(track.translationLocale)} 译文。项目输出语言与音频没有被改写。
        </p>
      )}
      <Field label="计时方式">
        <select
          value={track?.mode || "none"}
          onChange={(event) => {
            const next = {
              locale,
              translationLocale: track?.translationLocale,
              mode: modes.parse(event.target.value),
              fps: track?.fps || draft.profiles[0].fps,
              style: track?.style || defaultStyle,
              cues: track?.cues || [],
            };
            session.edit({
              ...draft,
              captions: [...draft.captions.filter((item) => item.locale !== locale), next],
            });
          }}
        >
          <option value="none">无字幕</option>
          <option value="manual">人工 cue / 导入 SRT</option>
          <option value="precise">实际语音对齐</option>
          <option value="estimated">显式估算</option>
        </select>
      </Field>
      <Field label={`导入 ${locale} SRT`}>
        <input
          aria-label={`导入 ${locale} SRT`}
          type="file"
          accept=".srt,.vtt"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;
            void file.text().then((body) => session.importCaption(locale, body, source));
          }}
        />
      </Field>
      {track && (
        <>
          <div className="actions">
            <Field label="字体">
              <input value={track.style.font} onChange={(event) => updateTrack({ ...track, style: { ...track.style, font: event.target.value } })} />
            </Field>
            <Field label="字号">
              <input
                type="number"
                value={track.style.size}
                onChange={(event) => updateTrack({ ...track, style: { ...track.style, size: Number(event.target.value) } })}
              />
            </Field>
            <Field label="底部安全区">
              <input
                type="number"
                value={track.style.marginV}
                onChange={(event) => updateTrack({ ...track, style: { ...track.style, marginV: Number(event.target.value) } })}
              />
            </Field>
          </div>
          <CaptionAssistPanel
            projectId={draft.id}
            sourceLocale={locale}
            expectedRevision={session.base}
            disabled={session.busy || session.dirty}
            fail={(reason) => session.setError(reason instanceof Error ? reason.message : String(reason))}
            onApply={(runId) => void session.applyCaptionAssist(runId)}
            onRunChange={() => void session.reload().catch((reason) => session.setError(String(reason)))}
          />
          <CaptionTrackEditor
            key={`${draft.id}:${locale}`}
            cues={track.cues}
            track={track}
            draft={draft}
            assets={ctx.assets}
            locale={locale}
            selectedSource={source}
            onCueChange={(next) => updateTrack({ ...track, cues: track.cues.map((cue) => (cue.id === next.id ? next : cue)) })}
            onRemoveCue={(cueId) => updateTrack({ ...track, cues: track.cues.filter((cue) => cue.id !== cueId) })}
          />
          <CueTimes cues={track.cues} />
        </>
      )}
    </div>
  );
}

function CueTimes({ cues }: { cues: CaptionTrack["cues"] }) {
  const [page, setPage] = useState(1);
  const pageSize = 25;
  const pageCount = Math.max(1, Math.ceil(cues.length / pageSize));
  const current = Math.min(page, pageCount);
  const visible = cues.slice((current - 1) * pageSize, current * pageSize);
  return (
    <div>
      <div className="section-title">
        <b>字幕时间</b>
        <div>
          <button type="button" disabled={current <= 1} onClick={() => setPage(current - 1)}>
            上一页
          </button>
          <button type="button" disabled={current >= pageCount} onClick={() => setPage(current + 1)}>
            下一页
          </button>
        </div>
      </div>
      <ul className="m-0 list-none p-0">
        {visible.map((cue, index) => (
          <li key={cue.id}>
            <small>
              {(current - 1) * pageSize + index + 1}. {cue.timingQuality} · {cue.time.kind === "source" ? "源片" : cue.time.kind === "speech" ? "场景语音" : "成片"} · {cue.text}
            </small>
          </li>
        ))}
      </ul>
    </div>
  );
}
