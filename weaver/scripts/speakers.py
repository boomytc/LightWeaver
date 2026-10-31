#!/usr/bin/env python3
"""MOSS speaker diarization through the configured native transcribe runtime."""

from __future__ import annotations

import argparse
import array
import json
import math
import os
from pathlib import Path
import subprocess
import sys
from types import ModuleType

RATE = 16000
MAX_SECONDS = 40.0
CONTRACT = "moss-diarize-on-segment-timestamps-v1"


class ModelError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


def require_file(value: object, field: str) -> Path:
    if not isinstance(value, str) or not value:
        raise ModelError("CONFIG_MISSING", f"缺少说话人模型配置：{field}")
    file = Path(value).resolve()
    if not file.is_file():
        raise ModelError("CONFIG_MISSING", f"说话人模型路径不存在：{field}={file}")
    return file


def require_directory(value: object, field: str) -> Path:
    if not isinstance(value, str) or not value:
        raise ModelError("CONFIG_MISSING", f"缺少说话人模型配置：{field}")
    directory = Path(value).resolve()
    if not directory.is_dir():
        raise ModelError("CONFIG_MISSING", f"说话人模型目录不存在：{field}={directory}")
    return directory


def load_native(library: Path, bindings: Path) -> ModuleType:
    os.environ["TRANSCRIBE_LIBRARY"] = str(library)
    sys.path.insert(0, str(bindings))
    try:
        import transcribe_cpp
    except (ImportError, FileNotFoundError, PermissionError) as exc:
        raise ModelError(
            "CONFIG_MISSING",
            f"无法加载 transcribe_cpp 绑定或原生库：{exc}",
        ) from exc
    except Exception as exc:
        raise ModelError(
            "MODEL_ABI_UNSUPPORTED",
            f"transcribe_cpp 或原生库 ABI 不兼容：{exc}",
        ) from exc
    actual = Path(transcribe_cpp.library_path()).resolve()
    if actual != library:
        raise ModelError(
            "MODEL_ABI_UNSUPPORTED",
            f"加载了非配置原生库：expected={library}, actual={actual}",
        )
    return transcribe_cpp


def inspect(library: Path, bindings: Path) -> dict[str, str]:
    transcribe_cpp = load_native(library, bindings)
    return {
        "nativeVersion": str(transcribe_cpp.native_version()),
        "nativeCommit": str(transcribe_cpp.native_commit()),
        "library": str(Path(transcribe_cpp.library_path()).resolve()),
        "python": sys.executable,
        "contract": CONTRACT,
    }


def validate_model(file: Path) -> Path:
    with file.open("rb") as source:
        if source.read(4) != b"GGUF":
            raise ModelError("INVALID_INPUT", f"diarization_model 不是 GGUF：{file}")
    return file


def load_pcm(audio: Path, ffmpeg: Path) -> array.array:
    try:
        result = subprocess.run(
            [
                str(ffmpeg),
                "-nostdin",
                "-v",
                "error",
                "-i",
                str(audio),
                "-vn",
                "-ac",
                "1",
                "-ar",
                str(RATE),
                "-f",
                "f32le",
                "-",
            ],
            check=True,
            capture_output=True,
            timeout=120,
        )
    except (OSError, subprocess.SubprocessError) as exc:
        detail = getattr(exc, "stderr", b"")
        message = detail.decode("utf-8", "replace")[-2000:] if detail else str(exc)
        raise ModelError("PROCESS_FAILED", f"说话人窗口音频解码失败：{message}") from exc
    if not result.stdout or len(result.stdout) % 4:
        raise ModelError("INVALID_MEDIA", "说话人窗口没有有效音频采样")
    pcm = array.array("f")
    pcm.frombytes(result.stdout)
    if sys.byteorder == "big":
        pcm.byteswap()
    if not pcm or not all(math.isfinite(value) for value in pcm):
        raise ModelError("INVALID_MEDIA", "说话人窗口音频包含空采样或非有限值")
    return pcm


def speaker_turns(result: object, duration: float) -> list[object]:
    turns = list(getattr(result, "speaker_segments", None) or [])
    if not turns:
        raise ModelError("PROVIDER_FORMAT", "MOSS 没有返回结构化说话人时段")
    for raw in turns:
        start = float(raw.t0_ms) / 1000
        end = float(raw.t1_ms) / 1000
        speaker = raw.speaker_id
        if (
            not math.isfinite(start)
            or not math.isfinite(end)
            or start < 0
            or end <= start
            or end > duration
            or isinstance(speaker, bool)
            or not isinstance(speaker, int)
            or speaker <= 0
        ):
            raise ModelError(
                "PROVIDER_FORMAT",
                f"MOSS 返回了无效说话人时段：start={start}, end={end}, speaker={speaker!r}",
            )
    return turns


def has_speaker_evidence(segment: object, turns: list[object]) -> bool:
    start = float(segment.t0_ms)
    end = float(segment.t1_ms)
    speaker = segment.speaker_id
    return any(
        turn.speaker_id == speaker
        and max(start, turn.t0_ms) < min(end, turn.t1_ms)
        for turn in turns
    )


def transcribe(job: dict[str, object]) -> dict[str, object]:
    audio = require_file(job.get("audio"), "audio")
    model = validate_model(require_file(job.get("model"), "model"))
    library = require_file(job.get("library"), "library")
    bindings = require_directory(job.get("bindings"), "bindings")
    # The configured VAD is part of the fixed speech runtime even though MOSS
    # emits its own speaker timing.
    require_file(job.get("vadLibrary"), "vadLibrary")
    ffmpeg = require_file(job.get("ffmpeg"), "ffmpeg")
    if not os.access(ffmpeg, os.X_OK):
        raise ModelError("CONFIG_MISSING", f"ffmpeg 不可执行：{ffmpeg}")

    language = str(job.get("language") or "")
    if language not in {"zh", "en"}:
        raise ModelError(
            "INVALID_INPUT",
            f"说话人分段仅支持中文或英文：{language}",
        )
    maximum = float(job.get("maximumSeconds") or MAX_SECONDS)
    if not math.isfinite(maximum) or maximum <= 0 or maximum > MAX_SECONDS:
        raise ModelError(
            "INVALID_INPUT",
            f"说话人窗口上限必须是 0 到 {MAX_SECONDS:g} 秒",
        )

    pcm = load_pcm(audio, ffmpeg)
    duration = len(pcm) / RATE
    if duration <= 0 or duration > maximum:
        raise ModelError(
            "INPUT_TOO_LONG",
            f"说话人窗口 {duration:.6f} 秒超过上限 {maximum:.6f} 秒",
        )

    transcribe_cpp = load_native(library, bindings)
    backend = str(job.get("backend") or "auto")
    try:
        native = transcribe_cpp.Model(str(model), backend=backend)
    except Exception as exc:
        raise ModelError(
            "MODEL_ABI_UNSUPPORTED",
            f"MOSS GGUF 或原生 ABI 不兼容：{exc}",
        ) from exc

    try:
        architecture = str(native.arch).lower()
        capabilities = native.capabilities
        if "moss" not in architecture:
            raise ModelError(
                "MODEL_ABI_UNSUPPORTED",
                f"diarization_model 架构不是 MOSS：{architecture or 'unknown'}",
            )
        if not native.supports("diarization"):
            raise ModelError("MODEL_ABI_UNSUPPORTED", "MOSS 模型未声明说话人分段能力")
        if capabilities.native_sample_rate != RATE:
            raise ModelError(
                "MODEL_ABI_UNSUPPORTED",
                f"MOSS 模型采样率必须是 {RATE}，实际为 {capabilities.native_sample_rate}",
            )
        if capabilities.max_timestamp_kind not in {"segment", "word", "token"}:
            raise ModelError(
                "MODEL_ABI_UNSUPPORTED",
                f"MOSS 模型不支持 segment 时码：{capabilities.max_timestamp_kind}",
            )
        with native.session() as session:
            limit = int(session.limits.effective_max_audio_ms)
            if limit > 0 and len(pcm) * 1000 / RATE > limit:
                raise ModelError(
                    "INPUT_TOO_LONG",
                    f"说话人窗口超过模型会话上限 {limit} ms",
                )
            try:
                result = session.run(
                    pcm,
                    language=language,
                    timestamps="segment",
                    diarize="on",
                )
            except transcribe_cpp.InputTooLong as exc:
                raise ModelError("INPUT_TOO_LONG", str(exc)) from exc
            except (
                transcribe_cpp.NotImplementedByModel,
                transcribe_cpp.UnsupportedRequest,
            ) as exc:
                raise ModelError(
                    "MODEL_ABI_UNSUPPORTED",
                    f"MOSS 原生运行时拒绝 diarize=on、timestamps=segment：{exc}",
                ) from exc
            except Exception as exc:
                raise ModelError("PROVIDER_ERROR", f"MOSS 推理失败：{exc}") from exc
    finally:
        native.close()

    timestamp_kind = str(result.timestamp_kind or "")
    if timestamp_kind not in {"segment", "none"}:
        raise ModelError(
            "PROVIDER_FORMAT",
            f"MOSS 返回了 {timestamp_kind or 'unknown'} 时码，并且没有受支持的结构化说话人结果",
        )
    raw_segments = list(result.segments or [])
    if not raw_segments:
        raise ModelError("PROVIDER_FORMAT", "MOSS 没有返回结构化说话人分段")

    turns = speaker_turns(result, duration)
    segments: list[dict[str, object]] = []
    for raw in raw_segments:
        text = str(raw.text)
        if not text.strip():
            raise ModelError("PROVIDER_FORMAT", "MOSS 返回了空语音分段")
        start = float(raw.t0_ms) / 1000
        end = float(raw.t1_ms) / 1000
        speaker = raw.speaker_id
        if (
            not math.isfinite(start)
            or not math.isfinite(end)
            or start < 0
            or end <= start
            or end > duration
        ):
            raise ModelError(
                "PROVIDER_FORMAT",
                f"MOSS 返回的时码无效：start={start}, end={end}, duration={duration}",
            )
        if isinstance(speaker, bool) or not isinstance(speaker, int) or speaker <= 0:
            raise ModelError(
                "PROVIDER_FORMAT",
                f"MOSS 没有返回有效说话人编号：{speaker!r}",
            )
        # The native contract ties text rows to speaker turns directly. Accept
        # metadata none only when those real rows still agree.
        if not has_speaker_evidence(raw, turns):
            raise ModelError(
                "PROVIDER_FORMAT",
                "MOSS 的文字分段与说话人时段不一致",
            )
        segments.append(
            {
                "text": text,
                "start": start,
                "end": end,
                "speakerId": f"s{speaker}",
            }
        )
    segments.sort(
        key=lambda segment: (
            float(segment["start"]),
            float(segment["end"]),
            str(segment["speakerId"]),
        )
    )
    return {"segments": segments}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("operation", choices=("inspect", "transcribe"))
    parser.add_argument("value")
    parser.add_argument("bindings", nargs="?")
    args = parser.parse_args()
    if args.operation == "inspect":
        if not args.bindings:
            raise ModelError("INVALID_INPUT", "inspect 缺少 transcribe_cpp 绑定目录")
        result = inspect(
            require_file(args.value, "library"),
            require_directory(args.bindings, "bindings"),
        )
    else:
        raw = json.loads(Path(args.value).read_text(encoding="utf-8"))
        if not isinstance(raw, dict):
            raise ModelError("INVALID_INPUT", "说话人作业必须是 JSON 对象")
        result = transcribe(raw)
    print(json.dumps(result, ensure_ascii=False, allow_nan=False))


if __name__ == "__main__":
    try:
        main()
    except ModelError as exc:
        result = {"error": {"code": exc.code, "message": str(exc)}}
    except (ImportError, FileNotFoundError, PermissionError) as exc:
        result = {"error": {"code": "CONFIG_MISSING", "message": str(exc)}}
    except Exception as exc:
        result = {"error": {"code": "PROVIDER_FORMAT", "message": str(exc)}}
    else:
        result = None
    if result is not None:
        print(json.dumps(result, ensure_ascii=False, allow_nan=False))
