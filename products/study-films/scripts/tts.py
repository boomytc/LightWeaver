#!/usr/bin/env python3
"""Synthesize project narration via VoxCPM2 Hi-Fi clone.

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


def synthesize_hifi(api_url: str, key: str, text: str, ref_wav: Path, ref_text: str) -> bytes:
    return post_speech(
        api_url,
        key,
        {
            "model": "VoxCPM2",
            "input": text,
            "voice": "default",
            "ref_audio": as_data_wav(ref_wav),
            "ref_text": ref_text,
            "response_format": "wav",
            "do_normalize": True,
        },
    )


def maybe_seed(api_url: str, key: str, ref_wav: Path, ref_text: str, style: str, force: bool) -> None:
    sidecar = ref_wav.with_suffix(".txt")
    if ref_wav.is_file() and sidecar.is_file() and sidecar.read_text(encoding="utf-8").strip() == ref_text and not force:
        print(f"reuse prompt {ref_wav}  {wav_seconds(ref_wav):.2f}s", file=sys.stderr)
        return
    print("seed prompt (voice design → hifi reference)", file=sys.stderr)
    payload_text = f"({style}){ref_text}" if style else ref_text
    audio = post_speech(
        api_url,
        key,
        {
            "model": "VoxCPM2",
            "input": payload_text,
            "voice": "default",
            "response_format": "wav",
            "do_normalize": True,
        },
    )
    seconds = write_wav(ref_wav, audio)
    sidecar.write_text(ref_text + "\n", encoding="utf-8")
    print(f"  {ref_wav}  {seconds:.2f}s", file=sys.stderr)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--job", required=True, help="weaver TTS job JSON")
    args = parser.parse_args()
    job = json.loads(Path(args.job).read_text(encoding="utf-8"))
    project_root = Path(job["projectRoot"])
    base, key = load_backend(job.get("configDirs") or [])
    api_url = f"{base}/audio/speech"
    ref_wav = Path(job["refAudio"])
    ref_text = str(job.get("refText") or "").strip()
    maybe_seed(api_url, key, ref_wav, ref_text, str(job.get("style") or ""), bool(job.get("seed")))

    wrote = []
    for item in job.get("items") or []:
        dest = project_root / item["dest"]
        print(f"hifi {job['locale']}/{item['id']}", file=sys.stderr)
        audio = synthesize_hifi(api_url, key, item["text"], ref_wav, ref_text)
        seconds = write_wav(dest, audio)
        print(f"  {dest}  {seconds:.2f}s", file=sys.stderr)
        wrote.append({"scene": item["id"], "file": item["dest"], "seconds": round(seconds, 3)})

    print(json.dumps({"wrote": wrote}, ensure_ascii=False))


if __name__ == "__main__":
    main()
