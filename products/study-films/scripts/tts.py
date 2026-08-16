#!/usr/bin/env python3
"""Synthesize project narration via VoxCPM2.

Mint (Studio /voices):
  instruct     input = "(style)text" without ref_audio
               keep the result as the clone source
Film lines:
  hifi-clone   the one clone source + ref_text，保证一致性

Language is not an API parameter; change input text only.

Reads a weaver job JSON (--job). Logs go to stderr. The last stdout line is
the result JSON.
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import subprocess
import sys
from pathlib import Path

import requests
import yaml

MAX_REF_BYTES = 5 * 1024 * 1024


def _load_yaml(path: Path) -> dict:
    if not path.is_file():
        return {}
    return yaml.safe_load(path.read_text(encoding="utf-8")) or {}


def load_backend(config_dirs: list[str]) -> tuple[str, str]:
    base = (os.environ.get("MODELBEST_BASE_URL") or "").rstrip("/")
    key = (os.environ.get("MODELBEST_API_KEY") or "").strip()
    cfg: dict = {}
    extra = os.environ.get("VOXCPM_CONFIG")
    if extra:
        extra_path = Path(extra)
        if extra_path.is_dir():
            cfg.update(_load_yaml(extra_path / "config.yaml"))
            cfg.update(_load_yaml(extra_path / "config.local.yaml"))
        else:
            cfg.update(_load_yaml(extra_path))
    for folder in config_dirs:
        cfg.update(_load_yaml(Path(folder) / "config.local.yaml"))
    base = base or str(cfg.get("modelbest_base_url") or "").rstrip("/")
    key = key or str(cfg.get("modelbest_api_key") or "").strip()
    if not base:
        raise SystemExit("Missing MODELBEST_BASE_URL or modelbest_base_url in config.local.yaml")
    if not key:
        raise SystemExit("Missing MODELBEST_API_KEY or modelbest_api_key in config.local.yaml")
    return base, key


def post_speech(api_url: str, key: str, payload: dict) -> bytes:
    resp = requests.post(
        api_url,
        headers={"Authorization": f"Bearer {key}"},
        json=payload,
        timeout=180,
    )
    resp.raise_for_status()
    chunks: list[bytes] = []
    for line in resp.text.splitlines():
        if not line.startswith("data: "):
            continue
        body = line.removeprefix("data: ").strip()
        if not body or body == "[DONE]":
            continue
        event = json.loads(body)
        etype = event.get("type")
        if etype == "speech.audio.delta":
            audio_b64 = event.get("audio") or event.get("delta") or ""
            if audio_b64:
                chunks.append(base64.b64decode(audio_b64))
        elif etype == "speech.audio.done":
            break
    if not chunks:
        raise RuntimeError(f"no audio: {resp.text[:180]!r}")
    return b"".join(chunks)


def rewrite_wav(path: Path) -> None:
    tmp = path.with_suffix(".fixed.wav")
    subprocess.run(
        ["ffmpeg", "-y", "-i", str(path), "-c:a", "pcm_s16le", str(tmp)],
        check=True,
        capture_output=True,
    )
    tmp.replace(path)


def wav_seconds(path: Path) -> float:
    out = subprocess.check_output(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            str(path),
        ],
        text=True,
    )
    return float(out.strip())


def as_data_wav(path: Path) -> str:
    raw = path.read_bytes()
    if len(raw) > MAX_REF_BYTES:
        raise SystemExit(f"ref_audio exceeds 5 MiB: {path}")
    return "data:audio/wav;base64," + base64.b64encode(raw).decode("ascii")


def write_wav(path: Path, audio: bytes) -> float:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(audio)
    rewrite_wav(path)
    return wav_seconds(path)


def speech_input(text: str, style: str) -> str:
    text = text.strip()
    style = style.strip()
    return f"({style}){text}" if style else text


def speech_payload(
    text: str,
    *,
    ref_wav: Path | None,
    style: str = "",
    denoise: bool | None = None,
    do_normalize: bool = True,
    cfg_value: float | None = None,
    ref_text: str = "",
) -> dict:
    payload: dict = {
        "model": "VoxCPM2",
        "input": speech_input(text, style),
        "voice": "default",
        "response_format": "wav",
        "do_normalize": do_normalize,
    }
    if ref_wav and ref_wav.is_file():
        payload["ref_audio"] = as_data_wav(ref_wav)
        payload["denoise"] = True if denoise is None else bool(denoise)
        if ref_text.strip():
            payload["ref_text"] = ref_text.strip()
    elif denoise is True:
        payload["denoise"] = True
    if cfg_value is not None:
        payload["cfg_value"] = float(cfg_value)
    return payload


def _opt_bool(job: dict, key: str) -> bool | None:
    if key not in job or job.get(key) is None:
        return None
    return bool(job.get(key))


def _opt_float(job: dict, key: str) -> float | None:
    if key not in job or job.get(key) is None or job.get(key) == "":
        return None
    return float(job[key])


def mint_one(api_url: str, key: str, job: dict) -> dict:
    dest = Path(str(job.get("dest") or ""))
    text = str(job.get("text") or "").strip()
    if not dest or not text:
        raise SystemExit("mint 需要 dest 与 text")
    ref_raw = str(job.get("refAudio") or "").strip()
    ref_wav = Path(ref_raw) if ref_raw else None
    style = str(job.get("style") or "").strip()
    audio = post_speech(
        api_url,
        key,
        speech_payload(
            text,
            ref_wav=ref_wav,
            style=style,
            denoise=_opt_bool(job, "denoise"),
            do_normalize=True if job.get("do_normalize") is None else bool(job.get("do_normalize")),
            cfg_value=_opt_float(job, "cfg_value"),
            ref_text=str(job.get("refText") or ""),
        ),
    )
    seconds = write_wav(dest, audio)
    print(f"mint {dest}  {seconds:.2f}s", file=sys.stderr)
    return {"wrote": [{"scene": "mint", "file": str(dest), "seconds": round(seconds, 3)}]}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--job", required=True, help="weaver TTS job JSON")
    args = parser.parse_args()
    job = json.loads(Path(args.job).read_text(encoding="utf-8"))
    base, key = load_backend(job.get("configDirs") or [])
    api_url = f"{base}/audio/speech"
    if job.get("kind") == "mint":
        print(json.dumps(mint_one(api_url, key, job), ensure_ascii=False))
        return

    project_root = Path(job["projectRoot"])
    ref_raw = str(job.get("refAudio") or "").strip()
    ref_wav = Path(ref_raw) if ref_raw else None
    ref_text = str(job.get("refText") or "").strip()
    if job.get("seed"):
        print("ignore seed: 铸库请在 Studio /voices，出片不改参考声", file=sys.stderr)
    if not ref_wav or not ref_wav.is_file():
        raise SystemExit("出片需要克隆源 wav。先在 /voices 用 instruct 铸一支再收，或上传 wav。")
    if not ref_text:
        raise SystemExit("出片 Hi-Fi 需要克隆源逐字稿（这支在说）。")

    wrote = []
    for item in job.get("items") or []:
        dest = project_root / item["dest"]
        text = str(item.get("text") or "").strip()
        if not text:
            continue
        print(f"hifi {job.get('locale')}/{item['id']}", file=sys.stderr)
        audio = post_speech(
            api_url,
            key,
            speech_payload(text, ref_wav=ref_wav, style="", ref_text=ref_text),
        )
        seconds = write_wav(dest, audio)
        print(f"  {dest}  {seconds:.2f}s", file=sys.stderr)
        wrote.append({"scene": item["id"], "file": item["dest"], "seconds": round(seconds, 3)})

    print(json.dumps({"wrote": wrote}, ensure_ascii=False))


if __name__ == "__main__":
    main()
