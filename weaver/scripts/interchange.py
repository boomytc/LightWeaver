#!/usr/bin/env python3
"""OTIO 0.18.1 and Jianying macOS 11.7.0 / schema 360000 adapter v1."""
import json
import os
import sys
import uuid
from pathlib import Path

PLACEHOLDER = "##_draftpath_placeholder_0E685133-18CE-45ED-8CB8-2904A212EC80_##/"


def otio_export(root, handoff):
    import opentimelineio as otio
    m = handoff["manifest"]
    fps = m["output"]["fps"]["num"] / m["output"]["fps"]["den"]
    rt = otio.opentime.RationalTime
    tr = otio.opentime.TimeRange
    timeline = otio.schema.Timeline(name=handoff["title"])
    video = otio.schema.Track(name="Picture", kind=otio.schema.TrackKind.Video)
    for item in handoff["visuals"]:
        clip = otio.schema.Clip(name=item["sceneId"],
            media_reference=otio.schema.ExternalReference(target_url=item["file"],
                available_range=tr(rt(0, fps), rt(item["durationFrames"], fps))),
            source_range=tr(rt(0, fps), rt(item["durationFrames"], fps)))
        clip.metadata["lightweaver"] = item["mapping"]
        video.append(clip)
    timeline.tracks.append(video)
    if handoff.get("master"):
        track = otio.schema.Track(name="Master (ducking / loudness baked)", kind=otio.schema.TrackKind.Audio)
        track.append(otio.schema.Clip(name="Master", media_reference=otio.schema.ExternalReference(target_url=handoff["master"]), source_range=tr(rt(0, fps), rt(m["totalFrames"], fps))))
        timeline.tracks.append(track)
    for item in handoff["audio"]:
        track = otio.schema.Track(name=f"Editable {item['mapping']['role']} (muted)", kind=otio.schema.TrackKind.Audio)
        track.enabled = False
        a = item.get("playback", item["mapping"])
        start = a["startFrame"]
        if start:
            track.append(otio.schema.Gap(source_range=tr(rt(0, fps), rt(start, fps))))
        clip = otio.schema.Clip(name=item["mapping"]["role"], media_reference=otio.schema.ExternalReference(target_url=item["file"]), source_range=tr(rt(a["trimUs"] * fps / 1e6, fps), rt(a["durationFrames"], fps)))
        clip.metadata["lightweaver"] = item["mapping"]
        track.append(clip)
        timeline.tracks.append(track)
    timeline.metadata["lightweaver"] = {"timelineDigest": handoff["timelineDigest"], "captions": m["captions"], "sidecars": ["captions.srt", "captions.ass"], "report": "handoff-report.json"}
    file = root / "timeline.otio"
    otio.adapters.write_to_file(timeline, str(file))
    loaded = otio.adapters.read_from_file(str(file))
    if abs(loaded.duration().rescaled_to(fps).value - m["totalFrames"]) > .001:
        raise ValueError("OTIO duration differs from TimelineManifest")
    return {"library": "opentimelineio", "version": otio.__version__, "reloaded": True, "frames": m["totalFrames"]}


def jianying_export(root, handoff):
    import pyJianYingDraft as draft
    m = handoff["manifest"]
    fps = m["output"]["fps"]["num"] / m["output"]["fps"]["den"]
    script = draft.ScriptFile(m["output"]["width"], m["output"]["height"], fps, False)
    video = script.append_track(draft.TrackSpec(draft.TrackType.video, "画面"))
    micros = lambda frame: round(frame * m["output"]["fps"]["den"] * 1e6 / m["output"]["fps"]["num"])
    for item in handoff["visuals"]:
        script.add_segment(draft.VideoSegment(str(root / item["file"]), draft.Timerange(micros(item["startFrame"]), micros(item["startFrame"] + item["durationFrames"]) - micros(item["startFrame"])), volume=0), video)
    if handoff.get("master"):
        master = script.append_track(draft.TrackSpec(draft.TrackType.audio, "节目母带（响度与闪避已烘焙）"))
        script.add_segment(draft.AudioSegment(str(root / handoff["master"]), draft.Timerange(0, micros(m["totalFrames"]))), master)
    for index, item in enumerate(handoff["audio"]):
        a = item.get("playback", item["mapping"])
        track = script.append_track(draft.TrackSpec(draft.TrackType.audio, f"可编辑 {item['mapping']['role']} {index + 1}（静音备选）", mute=True))
        # 单独可编辑原声已抽为音频；动态处理由母带保真。
        script.add_segment(draft.AudioSegment(str(root / item["file"]), draft.Timerange(micros(a["startFrame"]), micros(a["startFrame"] + a["durationFrames"]) - micros(a["startFrame"])), source_timerange=draft.Timerange(a["trimUs"], a["sourceDurationUs"]), speed=a["speed"], volume=10 ** (a["gainDb"] / 20)), track)
    if m["captions"]:
        text_track = script.append_track(draft.TrackSpec(draft.TrackType.text, "字幕"))
        style = m["captionStyle"]
        color = tuple(int(style["color"][i:i + 2], 16) / 255 for i in (1, 3, 5))
        for cue in m["captions"]:
            script.add_segment(draft.TextSegment(cue["text"], draft.Timerange(micros(cue["startFrame"]), micros(cue["startFrame"] + cue["durationFrames"]) - micros(cue["startFrame"])), style=draft.TextStyle(size=style["size"] / 6, color=color, align=1, auto_wrapping=True), border=draft.TextBorder(width=style["outline"] * 10), clip_settings=draft.ClipSettings(transform_y=-.8 + style["marginV"] / m["output"]["height"])), text_track)
    profile = handoff["jianyingProfile"]
    content = json.loads(script.dumps())
    content["id"] = uuid.uuid4().hex.upper()
    content["name"] = handoff["title"]
    platform = {"app_id": 3704, "app_source": "lv", "app_version": profile["appVersion"], "os": "mac"}
    content.update({"platform": platform, "last_modified_platform": platform, "version": profile["schemaVersion"], "new_version": "110.0.0"})
    registry = []
    for category in ("videos", "audios"):
        for material in content["materials"].get(category, []):
            original = material.get("path", "")
            if not original:
                continue
            relative = os.path.relpath(original, root).replace(os.sep, "/")
            if relative.startswith("../"):
                raise ValueError("Media escapes export root")
            locator = PLACEHOLDER + relative
            local_id = uuid.uuid4().hex.upper()
            material["path"] = locator
            material["local_material_id"] = local_id
            if category == "videos":
                material.setdefault("check_flag", 65535)
                material.setdefault("video_algorithm", None)
                material.setdefault("matting", {"flag": 0, "interactiveTime": [], "path": ""})
            registry.append({"id": local_id, "file_Path": locator, "extra_info": Path(original).name, "duration": material.get("duration", 0), "width": material.get("width", 0), "height": material.get("height", 0), "metetype": "video" if category == "videos" else "music", "type": 0, "item_source": 1, "create_time": -1, "import_time": -1, "import_time_ms": -1, "roughcut_time_range": {"start": -1, "duration": -1}, "sub_time_range": {"start": -1, "duration": -1}, "md5": ""})
    # pyJianYingDraft supplies complete text/segment schemas; patch local Mac font paths only.
    font = "/Applications/VideoFusion-macOS.app/Contents/Resources/Font/SystemFont/en.ttf"
    for material in content["materials"].get("texts", []):
        if Path(font).is_file():
            material["font_path"] = font
    (root / "draft_info.json").write_text(json.dumps(content, ensure_ascii=False), encoding="utf-8")
    meta = {"draft_id": content["id"], "draft_name": handoff["title"], "draft_fold_path": ".", "draft_root_path": ".", "draft_json_file": "draft_info.json", "draft_cover": "", "draft_type": "normal", "draft_cloud_last_action_download": False, "draft_cloud_purchase_info": "", "draft_cloud_template_id": "", "draft_cloud_tutorial_info": "", "draft_cloud_videocut_purchase_info": "", "draft_deeplink_url": "", "draft_enterprise_info": {"draft_enterprise_extra": "", "draft_enterprise_id": "", "draft_enterprise_name": "", "enterprise_material": []}, "draft_is_ai_shorts": False, "draft_is_invisible": False, "draft_is_web_article_video": False, "draft_materials": [{"type": 0, "value": registry}, {"type": 1, "value": []}, {"type": 2, "value": []}, {"type": 3, "value": []}], "draft_materials_copied_info": [], "draft_segment_extra_info": [], "draft_removable_storage_device": "", "draft_timeline_materials_size": sum((root / p["file"]).stat().st_size for p in handoff["visuals"]), "tm_draft_create": 0, "tm_draft_modified": 0, "tm_draft_removed": 0, "tm_duration": micros(m["totalFrames"])}
    (root / "draft_meta_info.json").write_text(json.dumps(meta, ensure_ascii=False), encoding="utf-8")
    return {"application": "com.lemon.lvpro", "version": profile["appVersion"], "schema": profile["schemaVersion"], "adapter": profile["adapterVersion"], "generator": "pyJianYingDraft==0.3.1", "mediaRegistered": len(registry), "nativeSubtitles": len(m["captions"]), "openedInApplication": False}


if __name__ == "__main__":
    root = Path(sys.argv[2]).resolve()
    handoff = json.loads((root / "handoff.json").read_text(encoding="utf-8"))
    if sys.argv[1] == "otio":
        result = otio_export(root, handoff)
    else:
        result = jianying_export(root, handoff)
    print(json.dumps(result, ensure_ascii=False))
