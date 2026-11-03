"""Local TEN VAD + Qwen3 GGUF process boundary. Paths are explicit configuration."""
from __future__ import annotations

import argparse
import array
import ctypes as ct
import json
import os
from pathlib import Path
import subprocess
import sys

RATE = 16000
HOP = 256
CONTEXT_SAMPLES = 40 * RATE


def load_pcm(audio: str, ffmpeg: str) -> array.array:
    result = subprocess.run(
        [ffmpeg, "-v", "error", "-i", audio, "-vn", "-ac", "1", "-ar", str(RATE), "-f", "s16le", "-"],
        check=True, capture_output=True,
    )
    pcm = array.array("h", result.stdout)
    if sys.byteorder == "big":
        pcm.byteswap()
    return pcm


def speech_ranges(pcm: array.array, library: str) -> tuple[list[tuple[int, int]], str]:
    lib = ct.CDLL(library)
    lib.ten_vad_create.argtypes = [ct.POINTER(ct.c_void_p), ct.c_size_t, ct.c_float]
    lib.ten_vad_create.restype = ct.c_int
    lib.ten_vad_process.argtypes = [ct.c_void_p, ct.POINTER(ct.c_int16), ct.c_size_t, ct.POINTER(ct.c_float), ct.POINTER(ct.c_int)]
    lib.ten_vad_process.restype = ct.c_int
    lib.ten_vad_destroy.argtypes = [ct.POINTER(ct.c_void_p)]
    lib.ten_vad_destroy.restype = ct.c_int
    lib.ten_vad_get_version.restype = ct.c_char_p
    handle = ct.c_void_p()
    if lib.ten_vad_create(ct.byref(handle), HOP, 0.5):
        raise RuntimeError("TEN VAD create failed")
    flags = []
    try:
        # Flush the final partial hop with zeroes so trailing speech is not lost.
        for offset in range(0, len(pcm), HOP):
            values = pcm[offset:offset + HOP]
            frame = (ct.c_int16 * HOP)(*values, *([0] * (HOP - len(values))))
            probability, flag = ct.c_float(), ct.c_int()
            if lib.ten_vad_process(handle, frame, HOP, ct.byref(probability), ct.byref(flag)):
                raise RuntimeError("TEN VAD inference failed")
            flags.append(flag.value)
    finally:
        lib.ten_vad_destroy(ct.byref(handle))
    raw = []
    start = None
    last_voice = 0
    for index, flag in enumerate(flags):
        if flag:
            if start is None:
                start = index
            last_voice = index + 1
        elif start is not None and (index + 1 - last_voice) * HOP >= int(.35 * RATE):
            if (last_voice - start) * HOP >= int(.08 * RATE):
                raw.append((max(0, start * HOP - 2400), min(len(pcm), last_voice * HOP + 2400)))
            start = None
    if start is not None and (last_voice - start) * HOP >= int(.08 * RATE):
        raw.append((max(0, start * HOP - 2400), min(len(pcm), last_voice * HOP + 2400)))
    merged = []
    for start, end in raw:
        if merged and start <= merged[-1][1]:
            merged[-1] = (merged[-1][0], end)
        else:
            merged.append((start, end))
    return merged, lib.ten_vad_get_version().decode("utf-8", "replace")


def context_windows(sample_count: int, speech: list[tuple[int, int]]) -> list[tuple[int, int]]:
    windows = []
    start, voice = 0, 0
    while start < sample_count:
        while voice < len(speech) and speech[voice][1] <= start:
            voice += 1
        end = min(sample_count, start + CONTEXT_SAMPLES)
        for index in range(voice, len(speech)):
            voice_start, voice_end = speech[index]
            if voice_start >= end:
                break
            if voice_start < end < voice_end:
                if index > voice:
                    end = max(start + 1, (speech[index - 1][1] + voice_start) // 2)
                else:
                    span = voice_end - start
                    parts = (span + CONTEXT_SAMPLES - 1) // CONTEXT_SAMPLES
                    end = start + (span + parts - 1) // parts
                break
        if voice < len(speech) and speech[voice][0] < end:
            windows.append((start, end))
        start = end
    return windows


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--job", required=True)
    job = json.loads(Path(parser.parse_args().job).read_text())
    for field in ("audio", "model", "library", "bindings", "vadLibrary", "ffmpeg"):
        if not isinstance(job.get(field), str) or not Path(job[field]).exists():
            raise ValueError(f"ASR configuration path missing: {field}")
    os.environ["TRANSCRIBE_LIBRARY"] = job["library"]
    sys.path.insert(0, job["bindings"])
    import transcribe_cpp

    pcm = load_pcm(job["audio"], job["ffmpeg"])
    ranges, version = speech_ranges(pcm, job["vadLibrary"])
    language = str(job.get("language") or "").split("-")[0]
    language = None if language in ("", "auto") else language
    sentences = []
    if ranges:
        with transcribe_cpp.Model(job["model"]) as native:
            with native.session() as session:
                for start, end in context_windows(len(pcm), ranges):
                    samples = array.array("f", (value / 32768.0 for value in pcm[start:end]))
                    result = session.run(samples, language=language, timestamps="none")
                    text = str(result.text or "").strip()
                    if text:
                        sentences.append({"text": text, "start": start / RATE, "end": end / RATE})
    # Acoustic activity bounds are not word/sentence forced alignment.
    print(json.dumps({
        "text": " ".join(s["text"] for s in sentences), "language": language or "auto",
        "seconds": len(pcm) / RATE, "sentences": sentences, "timingQuality": "estimated",
        "vad": {"backend": "ten-vad", "version": version,
                "ranges": [{"start": start / RATE, "end": end / RATE} for start, end in ranges]},
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
