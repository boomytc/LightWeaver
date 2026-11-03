import { useRef, useState } from "react";
import { z, refKey, type CaptionTrack } from "@lightweaver/weaver/contracts";
import { localeName } from "../domain/format";
import { useSession } from "../session/context";
import { Field } from "../ui/Field";
import { Button } from "../ui/Button";
import { Badge } from "../ui/Badge";
import { ViewHeader } from "../ui/ViewHeader";
import { UploadIcon } from "../ui/Icons";
import { CaptionAssistPanel } from "./CaptionAssistPanel";
import { CaptionTrackEditor } from "./CaptionEditors";
import { NativeSelect } from "../ui/NativeSelect";

const modes = z.enum(["none", "manual", "precise", "estimated"]);

export function CaptionWorkspace() {
  const session = useSession();
  const draft = session.draft;
  const ctx = session.ctx;
  const fileInput = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState("");
  const [locale, setLocale] = useState(session.locale);
  if (!draft || !ctx) return null;
  const track = draft.captions.find((item) => item.locale === locale);
  const sourceId = source ? draft.assets.find((asset) => refKey(asset) === source)?.assetId : undefined;
  const transcription = ctx.analysis.filter((entry) => entry.kind === "asr" && entry.state === "current" &&
    (entry.locale === undefined || entry.locale === locale) && (!sourceId || entry.source.assetId === sourceId));
  const captionsApplied = transcription.length > 0 && transcription.every((entry) => entry.captionLocales.includes(locale));
  const updateTrack = (next: CaptionTrack) =>
    session.edit({
      ...draft,
      captions: [...draft.captions.filter((item) => item.locale !== locale), next],
    });
  const defaultStyle = { font: "Noto Sans CJK SC", size: 48, color: "#FFFFFF", outline: 2, marginV: 80, maxChars: 24 };
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <ViewHeader
        title="字幕"
        description="导入、生成或编辑字幕。"
        actions={track?.translationLocale ? <Badge tone="accent">{localeName(track.translationLocale)}译文</Badge> : undefined}
      />
      {track?.translationLocale && <p className="notice-inline m-0 text-xs">这是 {localeName(locale)} 字幕的 {localeName(track.translationLocale)} 译文。项目输出语言与音频没有被改写。</p>}
      <section className="panel-card p-3" aria-label="字幕工具栏">
        <div className="grid gap-3 lg:grid-cols-[minmax(130px,.7fr)_minmax(180px,1.2fr)_minmax(160px,1fr)_auto]">
          <Field label="字幕语言">
            <NativeSelect value={locale} onChange={(event) => { setLocale(event.target.value); session.setLocale(event.target.value); }}>
              {draft.locales.map((item) => <option key={item} value={item}>{localeName(item)}</option>)}
            </NativeSelect>
          </Field>
          <Field label="导入字幕 / 来源对照">
            <NativeSelect value={source} onChange={(event) => setSource(event.target.value)}>
              <option value="">成片时间</option>
              {ctx.assets.filter((asset) => asset.kind === "video" || asset.kind === "audio").map((asset) => (
                <option key={asset.version} value={refKey(asset)}>{asset.kind === "audio" ? "音轨" : "源片"}：{asset.name}</option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="计时方式">
            <NativeSelect value={track?.mode || "none"} onChange={(event) => {
              const next = {
                locale,
                translationLocale: track?.translationLocale,
                mode: modes.parse(event.target.value),
                fps: track?.fps || draft.profiles[0].fps,
                style: track?.style || defaultStyle,
                cues: track?.cues || [],
              };
              session.edit({ ...draft, captions: [...draft.captions.filter((item) => item.locale !== locale), next] });
            }}>
              <option value="none">无字幕</option>
              <option value="manual">手动编辑 / 导入字幕</option>
              <option value="precise">实际语音对齐</option>
              <option value="estimated">估算字幕时间</option>
            </NativeSelect>
          </Field>
          <div className="flex items-end gap-2">
            <Button size="sm" onClick={() => fileInput.current?.click()}><UploadIcon />导入字幕</Button>
            <input
              ref={fileInput}
              className="hidden"
              aria-label={`导入 ${locale} 字幕`}
              type="file"
              accept=".srt,.vtt"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (!file) return;
                void file.text().then((body) => session.importCaption(locale, body, source));
              }}
            />
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between gap-3 border-t border-line pt-3">
          <small>{transcription.length ? "使用当前素材的转写结果生成字幕。" : "完成素材转写后，可在此生成字幕。"}</small>
          {captionsApplied ? <Badge tone="ok" dot>转写字幕已生成</Badge> : transcription.length > 0 && <Button
            size="sm"
            disabled={session.busy || session.dirty}
            onClick={() => void session.adoptAnalysisCaptions({ sourceId, locale })}
          >{track?.cues.length ? "更新转写字幕" : "从转写生成字幕"}</Button>}
        </div>
      </section>
      {track ? (
        <>
          <details className="panel-card p-4">
            <summary className="font-medium">字幕样式</summary>
            <div className="form-grid mt-4 md:grid-cols-3">
              <Field label="字体"><input value={track.style.font} onChange={(event) => updateTrack({ ...track, style: { ...track.style, font: event.target.value } })} /></Field>
              <Field label="字号"><input type="number" value={track.style.size} onChange={(event) => updateTrack({ ...track, style: { ...track.style, size: Number(event.target.value) } })} /></Field>
              <Field label="底部安全区"><input type="number" value={track.style.marginV} onChange={(event) => updateTrack({ ...track, style: { ...track.style, marginV: Number(event.target.value) } })} /></Field>
            </div>
          </details>
          <details className="panel-card p-4">
            <summary className="font-medium">字幕翻译</summary>
            <CaptionAssistPanel
              key={`${draft.id}:${locale}`}
              projectId={draft.id}
              sourceLocale={locale}
              expectedRevision={session.base}
              currentTrack={track}
              disabled={session.busy || session.dirty}
              fail={(reason) => session.setError(reason instanceof Error ? reason.message : String(reason))}
              onApply={(runId) => void session.applyCaptionAssist(runId)}
            />
          </details>
          <CaptionTrackEditor
            key={`${draft.id}:${locale}`}
            cues={track.cues}
            track={track}
            draft={draft}
            assets={ctx.assets}
            locale={locale}
            selectedSource={source}
            onCueChange={(next) => updateTrack({ ...track, cues: track.cues.map((cue) => cue.id === next.id ? next : cue) })}
            onRemoveCue={(cueId) => updateTrack({ ...track, cues: track.cues.filter((cue) => cue.id !== cueId) })}
          />
        </>
      ) : <div className="subtle-card p-6 text-center"><b>当前语言还没有字幕轨</b><p className="hint mx-auto mt-1 mb-0 text-xs">选择计时方式、导入字幕，或从转写生成字幕。</p></div>}
    </div>
  );
}
