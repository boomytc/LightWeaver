#!/usr/bin/env python3
"""Describe sampled video frames via MiniCPM-V (ModelBest OpenAI-compatible).

Job (weaver --job JSON):
  kind        describe
  model       MiniCPM-V-4.6 (or override)
  prompt      weaver-owned instruction
  frames      [{ "t": seconds, "path": absolute jpeg }]
  configDirs  yaml lookup roots

Logs go to stderr. The last stdout line is:
  {"observation":"…"}
"""

from __future__ import annotations

import argparse
import base64
import json
import mimetypes
import os
import sys
from pathlib import Path

import requests
import yaml

DEFAULT_BASE = "https://api.modelbest.cn/v1"
DEFAULT_MODEL = "MiniCPM-V-4.6"


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
    base = base or str(cfg.get("modelbest_base_url") or DEFAULT_BASE).rstrip("/")
    key = key or str(cfg.get("modelbest_api_key") or "").strip()
    if not base:
        raise SystemExit("缺少 MODELBEST_BASE_URL 或 modelbest_base_url")
    if not key:
        raise SystemExit("缺少 MODELBEST_API_KEY 或 modelbest_api_key")
    return base, key


def image_part(path: str) -> dict:
    raw = Path(path).read_bytes()
    mime = mimetypes.guess_type(path)[0] or "image/jpeg"
    url = "data:" + mime + ";base64," + base64.b64encode(raw).decode("ascii")
    return {"type": "image_url", "image_url": {"url": url}}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--job", required=True)
    args = parser.parse_args()
    job = json.loads(Path(args.job).read_text(encoding="utf-8"))
    if job.get("kind") not in (None, "describe"):
        raise SystemExit(f"不支持的 job kind：{job.get('kind')}")
    frames = job.get("frames") or []
    if not frames:
        raise SystemExit("job 没有 frames")
    prompt = str(job.get("prompt") or "").strip()
    if not prompt:
        raise SystemExit("job 没有 prompt")
    model = str(job.get("model") or DEFAULT_MODEL).strip() or DEFAULT_MODEL
    base, key = load_backend([str(item) for item in (job.get("configDirs") or [])])
    content = [image_part(str(frame["path"])) for frame in frames]
    content.append({"type": "text", "text": prompt})
    print(f"vlm model={model} frames={len(frames)}", file=sys.stderr)
    response = requests.post(
        f"{base}/chat/completions",
        headers={"Authorization": f"Bearer {key}"},
        json={
            "model": model,
            "messages": [{"role": "user", "content": content}],
            "temperature": 0.2,
            "max_tokens": 256,
            "extra_body": {"chat_template_kwargs": {"enable_thinking": False}},
        },
        timeout=180,
    )
    if response.status_code >= 400:
        raise SystemExit(f"VLM HTTP {response.status_code}: {response.text[:400]}")
    body = response.json()
    try:
        text = str(body["choices"][0]["message"]["content"] or "").strip()
    except (KeyError, IndexError, TypeError) as exc:
        raise SystemExit(f"VLM 返回无法解析：{json.dumps(body, ensure_ascii=False)[:400]}") from exc
    if not text:
        raise SystemExit("VLM 没有观察文本")
    print(json.dumps({"observation": text}, ensure_ascii=False))


if __name__ == "__main__":
    main()
