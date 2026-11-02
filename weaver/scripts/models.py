#!/usr/bin/env python3
"""Product-local Qwen3 alignment and GGUF retrieval. No downloads or fallback."""
from contextlib import contextmanager, redirect_stdout
import importlib.metadata
import importlib.util
import json
import math
import os
from pathlib import Path
import secrets
import socket
import subprocess
import sys
import tempfile
import time
import unicodedata
from urllib import error, request

class ModelError(Exception):
    def __init__(self, code, message):
        super().__init__(message)
        self.code = code


def inspect(backend):
    packages = {"torch": ["qwen_asr", "torch", "numpy", "transformers", "tokenizers"],
                "gguf": []}[backend]
    versions, missing = {}, []
    for name in packages:
        if importlib.util.find_spec(name) is None:
            missing.append(name)
        try:
            versions[name] = importlib.metadata.version(name.replace("_", "-"))
        except importlib.metadata.PackageNotFoundError:
            missing.append(name)
    return {"python": sys.version.split()[0], "versions": versions,
            "available": not missing, "missing": sorted(set(missing))}


def canonical(text):
    return "".join(c for c in unicodedata.normalize("NFKC", text).casefold()
                   if unicodedata.category(c)[0] in {"L", "N"})


def sentences(text):
    parts, start, i = [], 0, 0
    while i < len(text):
        ch = text[i]
        if ch in "。！？!?；;\n" or (ch == "." and (i + 1 == len(text) or text[i + 1].isspace())):
            i += 1
            while i < len(text) and text[i] in '。！？!?；;.”’\"\')）」』':
                i += 1
            parts.append(text[start:i].strip())
            start = i
        else:
            i += 1
    parts.append(text[start:].strip())
    return [p for p in parts if p]


def aligned_segments(text, words, duration):
    expected = canonical(text)
    if not expected or canonical("".join(w["text"] for w in words)) != expected:
        raise ModelError("ALIGNMENT_TEXT_MISMATCH", "对齐结果未完整覆盖原文，不能生成精确字幕")
    offsets, offset = [], 0
    previous = 0.0
    for word in words:
        start, end = word["start"], word["end"]
        if not (math.isfinite(start) and math.isfinite(end) and
                0 <= start <= end <= duration + .1 and start >= previous):
            raise ModelError("PROVIDER_FORMAT", "强制对齐返回无效或倒序时间")
        word["start"], word["end"] = min(start, duration), min(end, duration)
        previous = start
        size = len(canonical(word["text"]))
        offsets.append((offset, offset + size, word))
        offset += size
    segments, offset, prefix = [], 0, ""
    for part in sentences(text):
        size = len(canonical(part))
        if not size:
            if segments:
                segments[-1]["text"] += part
            else:
                prefix += part
            continue
        selected = [w for a, b, w in offsets if a < offset + size and b > offset]
        offset += size
        start, end = selected[0]["start"], selected[-1]["end"]
        if end <= start or (segments and start < segments[-1]["end"]):
            raise ModelError("PROVIDER_FORMAT", "强制对齐返回空句界或重叠句界")
        segments.append({"text": prefix + part, "start": start, "end": end})
        prefix = ""
    return segments


def align(job):
    text = job["text"].strip()
    if not canonical(text) or not 0 < job["duration"] <= 180:
        raise ModelError("INVALID_INPUT", "强制对齐需要非空文本和不超过 180 秒的场景语音")
    model_path = Path(job["model"])
    config = json.loads((model_path / "config.json").read_text())
    if config.get("thinker_config", {}).get("model_type") != "qwen3_forced_aligner":
        raise ModelError("INVALID_INPUT", "alignment_model 必须指向 Qwen3 ForcedAligner 权重")
    if job["language"] not in config.get("support_languages", []):
        raise ModelError("ALIGNMENT_LANGUAGE_UNSUPPORTED", "强制对齐权重不支持所选语种")
    import numpy as np
    pcm = subprocess.run([job["ffmpeg"], "-v", "error", "-i", job["audio"], "-vn",
                          "-ac", "1", "-ar", "16000", "-f", "f32le", "-"],
                         check=True, capture_output=True).stdout
    waveform = np.frombuffer(pcm, dtype="<f4").copy()
    duration = len(waveform) / 16000
    if not len(waveform) or abs(duration - job["duration"]) > .1:
        raise ModelError("INVALID_MEDIA", "对齐音频为空或与冻结时长不一致")
    import torch
    from qwen_asr import Qwen3ForcedAligner
    model = Qwen3ForcedAligner.from_pretrained(str(model_path), dtype=torch.float32,
                                              device_map=job["device"], local_files_only=True)
    raw = model.align(audio=(waveform, 16000), text=text, language=job["language"])[0]
    version = importlib.metadata.version("qwen-asr")
    items = raw.items
    if not isinstance(items, (list, tuple)) or not items:
        raise ModelError("PROVIDER_FORMAT", "强制对齐没有返回词/字时间")
    words = [{"text": str(item.text), "start": float(item.start_time),
              "end": float(item.end_time)} for item in items]
    segments = aligned_segments(text, words, duration)
    return {"backend": "qwen3-torch", "version": version,
            "model": str(model_path), "words": words, "segments": segments}


@contextmanager
def gguf_server(job, rerank=False):
    model = Path(job["model"])
    with model.open("rb") as source:
        if source.read(4) != b"GGUF":
            raise ModelError("INVALID_INPUT", "检索模型必须是 GGUF 文件")
    with socket.socket() as reservation:
        reservation.bind(("127.0.0.1", 0))
        port = reservation.getsockname()[1]
    token = secrets.token_hex(32)
    alias = f"lightweaver-{secrets.token_hex(12)}"
    base = f"http://127.0.0.1:{port}"
    env = {k: v for k, v in os.environ.items() if not k.startswith("LLAMA_")}
    env["LLAMA_API_KEY"] = token
    args = [job["server"], "-m", str(model), "--host", "127.0.0.1", "--port", str(port),
            "--alias", alias, "--embedding", "--pooling", "rank" if rerank else "last",
            "-c", "8192", "-b", "8192", "-ub", "8192", "-np", "1", "-ngl", "99", "--no-warmup"]
    if rerank:
        args.append("--reranking")
    with tempfile.TemporaryFile() as log:
        process = subprocess.Popen(args, stdout=log, stderr=log, env=env)
        opener = request.build_opener(request.ProxyHandler({}))

        def call(endpoint, body=None, timeout=120):
            if body is not None and "model" in body:
                body = {**body, "model": alias}
            data = json.dumps(body).encode() if body is not None else None
            req = request.Request(base + endpoint, data=data,
                                  headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}"})
            try:
                with opener.open(req, timeout=timeout) as response:
                    return json.load(response)
            except error.HTTPError as exc:
                raise ModelError("PROVIDER_ERROR", f"本地 GGUF 服务返回 HTTP {exc.code}") from exc

        try:
            deadline = time.monotonic() + 180
            while True:
                if process.poll() is not None:
                    log.seek(0)
                    diagnostic = log.read().decode(errors="replace")[-2000:]
                    raise ModelError("PROCESS_FAILED", f"本地 GGUF 服务启动失败：{diagnostic}")
                try:
                    models = call("/v1/models", timeout=1)
                    if not any(m.get("id") == alias for m in models.get("data", [])):
                        raise ModelError("PROVIDER_FORMAT", "本地端口不属于本次模型作业")
                    break
                except (OSError, ModelError):
                    if time.monotonic() >= deadline:
                        raise ModelError("DEADLINE_EXCEEDED", "本地 GGUF 服务启动超时")
                    time.sleep(.1)
            yield call
        finally:
            if process.poll() is None:
                process.terminate()
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait(timeout=5)


def embed(job):
    texts = [f'Instruct: {job["instruction"]}\nQuery: {item["text"]}'
             if item["role"] == "query" else item["text"] for item in job["inputs"]]
    vectors = []
    if not texts:
        return {"model": job["model"], "vectors": vectors}
    with gguf_server(job) as call:
        for text in texts:
            tokens = call("/tokenize", {"content": text, "add_special": True})["tokens"]
            if len(tokens) > 8192:
                raise ModelError("INPUT_TOO_LONG", "检索文本超过 8192 tokens；请先拆分源证据")
            result = call("/v1/embeddings", {"model": "lightweaver-local", "input": [text],
                                            "encoding_format": "float", "truncate": False})
            rows = result.get("data", [])
            if len(rows) != 1 or rows[0].get("index") != 0:
                raise ModelError("PROVIDER_FORMAT", "向量响应数量或索引无效")
            vector = rows[0]["embedding"]
            if not vector or any(not isinstance(x, (int, float)) or not math.isfinite(x) for x in vector):
                raise ModelError("PROVIDER_FORMAT", "向量包含无效数值")
            norm = math.sqrt(sum(x * x for x in vector))
            if norm <= 1e-12:
                raise ModelError("PROVIDER_FORMAT", "模型返回零向量")
            vectors.append([x / norm for x in vector])
    return {"model": job["model"], "vectors": vectors}


def rerank(job):
    with gguf_server(job, rerank=True) as call:
        for document in job["documents"]:
            tokens = call("/tokenize", {"content": job["query"] + "\n" + document, "add_special": True})["tokens"]
            if len(tokens) > 7680:
                raise ModelError("INPUT_TOO_LONG", "重排查询和单条候选合计超过 7680 tokens；请先拆分源证据")
        result = call("/v1/rerank", {"model": "lightweaver-local", "query": job["query"],
                                     "documents": job["documents"], "top_n": len(job["documents"])})
    rows = result.get("results", result.get("data", []))
    scores = [None] * len(job["documents"])
    for row in rows:
        index = row.get("index")
        score = row.get("relevance_score")
        if (type(index) is not int or not 0 <= index < len(scores) or scores[index] is not None
                or not isinstance(score, (int, float)) or not math.isfinite(score)):
            raise ModelError("PROVIDER_FORMAT", "重排结果包含无效或重复索引")
        scores[index] = score
    if any(score is None for score in scores):
        raise ModelError("PROVIDER_FORMAT", "重排结果未覆盖全部候选")
    return {"model": job["model"], "scores": scores}


if __name__ == "__main__":
    try:
        kind = sys.argv[1]
        with redirect_stdout(sys.stderr):
            if kind == "inspect":
                result = inspect(sys.argv[2])
            else:
                job = json.loads(Path(sys.argv[2]).read_text())
                result = {"align": align, "embed": embed, "rerank": rerank}[kind](job)
    except ModelError as exc:
        result = {"error": {"code": exc.code, "message": str(exc)}}
    except (ImportError, FileNotFoundError) as exc:
        result = {"error": {"code": "CONFIG_MISSING", "message": str(exc)}}
    except Exception as exc:
        result = {"error": {"code": "PROVIDER_FORMAT", "message": str(exc)}}
    print(json.dumps(result, ensure_ascii=False, allow_nan=False))
