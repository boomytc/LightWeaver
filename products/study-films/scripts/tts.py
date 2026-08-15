#!/usr/bin/env python3
"""Synthesize study-film narration via VoxCPM2 Hi-Fi clone.

Each locale has its own prompt wav. Every line in that locale is cloned
from it with ref_audio + ref_text so timbre stays the same.
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

HERE = Path(__file__).resolve().parent
FILMS_ROOT = HERE.parent
NARRATION_PATH = HERE / "narration.json"
MAX_REF_BYTES = 5 * 1024 * 1024
LOCALES = ("zh", "en")


def _load_yaml(path: Path) -> dict:
    if not path.is_file():
        return {}
    return yaml.safe_load(path.read_text(encoding="utf-8")) or {}


def load_backend() -> tuple[str, str]:
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
    cfg.update(_load_yaml(FILMS_ROOT / "config.local.yaml"))
    base = base or str(cfg.get("modelbest_base_url") or "").rstrip("/")
    key = key or str(cfg.get("modelbest_api_key") or "").strip()
    if not base:
        raise SystemExit(
            "Missing MODELBEST_BASE_URL, or modelbest_base_url in products/study-films/config.local.yaml"
        )
    if not key:
        raise SystemExit(
            "Missing MODELBEST_API_KEY, or modelbest_api_key in products/study-films/config.local.yaml"
        )
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


def ensure_prompt(api_url: str, key: str, narration: dict, locale: str, *, force: bool) -> tuple[Path, str]:
    prompt = narration["prompts"][locale]
    text = str(prompt["text"]).strip()
    dest = FILMS_ROOT / prompt["audio"]
    sidecar = dest.with_suffix(".txt")
    if dest.is_file() and sidecar.is_file() and sidecar.read_text(encoding="utf-8").strip() == text and not force:
        print(f"reuse prompt {locale} {dest}  {wav_seconds(dest):.2f}s", file=sys.stderr)
        return dest, text

    print(f"seed prompt {locale} (voice design → hifi reference)", file=sys.stderr)
    voice = narration.get("voices", {}).get(locale) or ""
    audio = post_speech(
        api_url,
        key,
        {
            "model": "VoxCPM2",
            "input": f"({voice}){text}" if voice else text,
            "voice": "default",
            "response_format": "wav",
            "do_normalize": True,
        },
    )
    seconds = write_wav(dest, audio)
    sidecar.write_text(text + "\n", encoding="utf-8")
    print(f"  {dest}  {seconds:.2f}s", file=sys.stderr)
    return dest, text


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


def main() -> None:
    parser = argparse.ArgumentParser()
    narration = json.loads(NARRATION_PATH.read_text(encoding="utf-8"))
    film_ids = list(narration["films"])
    parser.add_argument("--film", choices=[*film_ids, "all"], default="all")
    parser.add_argument("--locale", choices=["zh", "en", "all"], default="all")
    parser.add_argument("--seed", action="store_true", help="regenerate the Hi-Fi prompt wav")
    args = parser.parse_args()

    base, key = load_backend()
    api_url = f"{base}/audio/speech"
    locales = list(LOCALES) if args.locale == "all" else [args.locale]
    films = film_ids if args.film == "all" else [args.film]
    manifest: dict = {"mode": "hifi-clone", "locales": {}}

    for locale in locales:
        ref_wav, ref_text = ensure_prompt(api_url, key, narration, locale, force=args.seed)
        locale_meta: dict = {
            "prompt": {"text": ref_text, "audio": str(ref_wav.relative_to(FILMS_ROOT))},
            "films": {},
        }
        for film_id in films:
            lines = narration["films"][film_id][locale]
            out_dir = FILMS_ROOT / "public" / "voice" / locale / film_id
            out_dir.mkdir(parents=True, exist_ok=True)
            film_meta = []
            for line in lines:
                dest = out_dir / f"{line['id']}.wav"
                print(f"hifi {locale}/{film_id}/{line['id']}", file=sys.stderr)
                audio = synthesize_hifi(api_url, key, line["text"], ref_wav, ref_text)
                seconds = write_wav(dest, audio)
                film_meta.append({"id": line["id"], "file": dest.name, "seconds": round(seconds, 3)})
                print(f"  {dest}  {seconds:.2f}s")
            locale_meta["films"][film_id] = film_meta
        manifest["locales"][locale] = locale_meta

    (FILMS_ROOT / "public" / "voice" / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
