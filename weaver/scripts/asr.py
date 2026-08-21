#!/usr/bin/env python3
"""Transcribe a clone-source wav via Qwen3-ASR-0.6B GGUF.

Job (weaver --job JSON):
  kind        transcribe
  audio       absolute wav/path
  language    optional short code (zh/en/…); empty = auto LID
  model       optional GGUF path
  library     optional libtranscribe path (also TRANSCRIBE_LIBRARY)
  bindings    optional transcribe_cpp python src dir
  backend     auto | metal | cpu | …
  configDirs  yaml lookup roots (weaver root, study-films)

Logs go to stderr. The last stdout line is the result JSON:
  {"text":"…","language":"zh","seconds":3.2}

Does not import LightASR product/explore Python. Model, library, and
bindings come from the job, env, or config — never a machine default.
"""

from __future__ import annotations

import argparse
import array
import json
import os
import subprocess
import sys
import tempfile
import wave
from pathlib import Path

LIB_NAMES = ("libtranscribe.dylib", "libtranscribe.so", "transcribe.dll")


def _load_yaml(path: Path) -> dict:
    if not path.is_file():
        return {}
    try:
        import yaml  # type: ignore
    except ImportError:
        return _load_yaml_scalars(path)
    return yaml.safe_load(path.read_text(encoding="utf-8")) or {}


def _load_yaml_scalars(path: Path) -> dict:
    cfg: dict = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        if ":" not in line or line.lstrip().startswith("#"):
            continue
        key, raw = line.split(":", 1)
        value = raw.strip()
        if value.startswith("'") and value.endswith("'"):
            value = value[1:-1].replace("''", "'")
        elif value.startswith('"') and value.endswith('"'):
            value = value[1:-1]
        cfg[key.strip()] = value
    return cfg


def load_cfg(config_dirs: list[str]) -> dict:
    cfg: dict = {}
    extra = os.environ.get("LIGHTWEAVER_ASR_CONFIG")
    if extra:
        extra_path = Path(extra)
        if extra_path.is_dir():
            cfg.update(_load_yaml(extra_path / "config.yaml"))
            cfg.update(_load_yaml(extra_path / "config.local.yaml"))
        elif extra_path.is_file():
            cfg.update(_load_yaml(extra_path))
    for folder in config_dirs:
        cfg.update(_load_yaml(Path(folder) / "config.local.yaml"))
    return cfg


def find_lightasr(job: dict) -> Path | None:
    for raw in (os.environ.get("LIGHTASR_ROOT"), job.get("lightasr"), job.get("lightasrRoot")):
        value = str(raw or "").strip()
        if not value:
            continue
        path = Path(value).expanduser()
        if path.is_dir():
            return path
    return None


def first_file(candidates: list[Path | str | None]) -> Path | None:
    for raw in candidates:
        if not raw:
            continue
        path = Path(str(raw)).expanduser()
        if path.is_file():
            return path
        if path.is_dir():
            ggufs = sorted(path.glob("*.gguf"))
            if ggufs:
                return ggufs[0]
            for name in LIB_NAMES:
                lib = path / name
                if lib.is_file():
                    return lib
    return None


def first_dir(candidates: list[Path | str | None]) -> Path | None:
    for raw in candidates:
        if not raw:
            continue
        path = Path(str(raw)).expanduser()
        if (path / "transcribe_cpp").is_dir():
            return path
    return None


def resolve_model(job: dict, cfg: dict) -> Path:
    found = first_file(
        [
            job.get("model"),
            os.environ.get("LIGHTWEAVER_ASR_MODEL"),
            cfg.get("asr_model"),
        ]
    )
    if not found:
        raise SystemExit(
            "找不到 Qwen3-ASR GGUF。设置 LIGHTWEAVER_ASR_MODEL 或 config.local.yaml 的 asr_model。"
        )
    return found


def resolve_library(job: dict, cfg: dict, lightasr: Path | None) -> Path:
    extras: list[Path | str | None] = []
    if lightasr:
        extras.extend(
            [
                lightasr / "explore/light_transcribe_cpp/build-shared/src",
                lightasr / "products/audio_studio/data/engine",
            ]
        )
    found = first_file(
        [
            job.get("library"),
            os.environ.get("TRANSCRIBE_LIBRARY"),
            cfg.get("asr_library"),
            *extras,
        ]
    )
    if not found:
        raise SystemExit(
            "找不到 libtranscribe。设置 TRANSCRIBE_LIBRARY 或 config.local.yaml 的 asr_library。"
        )
    return found


def resolve_bindings(job: dict, cfg: dict, lightasr: Path | None) -> Path:
    extras: list[Path | str | None] = []
    if lightasr:
        extras.extend(
            [
                lightasr
                / "explore/light_transcribe_cpp/third_party/transcribe.cpp/bindings/python/src",
                lightasr
                / "products/audio_studio/third_party/transcribe.cpp/bindings/python/src",
            ]
        )
    found = first_dir(
        [
            job.get("bindings"),
            os.environ.get("LIGHTWEAVER_ASR_BINDINGS"),
            cfg.get("asr_bindings"),
            *extras,
        ]
    )
    if not found:
        raise SystemExit(
            "找不到 transcribe_cpp 绑定。设置 LIGHTWEAVER_ASR_BINDINGS 或 config.local.yaml 的 asr_bindings。"
        )
    return found


def load_pcm(audio: Path) -> tuple[array.array, float]:
    handle, tmp_name = tempfile.mkstemp(suffix=".wav")
    os.close(handle)
    tmp = Path(tmp_name)
    try:
        subprocess.run(
            [
                "ffmpeg",
                "-y",
                "-i",
                str(audio),
                "-ac",
                "1",
                "-ar",
                "16000",
                "-c:a",
                "pcm_s16le",
                str(tmp),
            ],
            check=True,
            capture_output=True,
        )
        with wave.open(str(tmp), "rb") as wav_file:
            if wav_file.getsampwidth() != 2:
                raise SystemExit(f"{audio}: 转 16-bit PCM 失败")
            pcm16 = array.array("h")
            pcm16.frombytes(wav_file.readframes(wav_file.getnframes()))
            if sys.byteorder == "big":
                pcm16.byteswap()
        pcm = array.array("f", (sample / 32768.0 for sample in pcm16))
        seconds = len(pcm) / 16000.0
        return pcm, seconds
    except subprocess.CalledProcessError as exc:
        err = (exc.stderr or b"").decode("utf-8", "replace")[-400:]
        raise SystemExit(f"ffmpeg 无法读 {audio}: {err}") from exc
    finally:
        tmp.unlink(missing_ok=True)


def normalize_language(raw: object) -> str | None:
    value = str(raw or "").strip()
    if not value or value.lower() in {"auto", "none", "null"}:
        return None
    aliases = {
        "chinese": "zh",
        "zh-cn": "zh",
        "cmn": "zh",
        "english": "en",
        "cantonese": "yue",
    }
    return aliases.get(value.lower(), value)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--job", required=True, help="weaver ASR job JSON")
    args = parser.parse_args()
    job = json.loads(Path(args.job).read_text(encoding="utf-8"))
    if job.get("kind") not in (None, "", "transcribe"):
        raise SystemExit(f"未知 asr job：{job.get('kind')}")
    audio = Path(str(job.get("audio") or "")).expanduser()
    if not audio.is_file():
        raise SystemExit("转写需要 audio 文件")
    config_dirs = [str(item) for item in (job.get("configDirs") or [])]
    cfg = load_cfg(config_dirs)
    lightasr = find_lightasr(job)
    model = resolve_model(job, cfg)
    library = resolve_library(job, cfg, lightasr)
    bindings = resolve_bindings(job, cfg, lightasr)
    os.environ["TRANSCRIBE_LIBRARY"] = str(library)
    bind_text = str(bindings)
    if bind_text not in sys.path:
        sys.path.insert(0, bind_text)
    try:
        import transcribe_cpp  # type: ignore
    except Exception as exc:
        raise SystemExit(f"无法加载 transcribe_cpp：{exc}") from exc

    pcm, seconds = load_pcm(audio)
    backend = str(job.get("backend") or cfg.get("asr_backend") or "auto").strip() or "auto"
    language = normalize_language(job.get("language"))
    print(f"asr model={model}", file=sys.stderr)
    print(f"asr audio={audio} {seconds:.2f}s lang={language or 'auto'}", file=sys.stderr)
    with transcribe_cpp.Model(str(model), backend=backend) as native:
        with native.session() as session:
            result = session.run(pcm, language=language, timestamps="none")
    text = str(getattr(result, "text", "") or "").strip()
    detected = str(getattr(result, "language", "") or language or "").strip()
    payload = {"text": text, "language": detected, "seconds": round(seconds, 3)}
    raw_sentences = getattr(result, "sentences", None)
    if raw_sentences:
        payload["sentences"] = [
            {
                "text": str(getattr(item, "text", "") or ""),
                "start": float(getattr(item, "start", 0) or 0),
                "end": float(getattr(item, "end", 0) or 0),
                "words": [
                    {
                        "token": str(getattr(word, "token", "") or ""),
                        "start": float(getattr(word, "start", 0) or 0),
                        "end": float(getattr(word, "end", 0) or 0),
                    }
                    for word in (getattr(item, "words", None) or [])
                ],
            }
            for item in raw_sentences
        ]
    print(f"asr text={text[:80]}", file=sys.stderr)
    print(json.dumps(payload, ensure_ascii=False))


if __name__ == "__main__":
    main()
