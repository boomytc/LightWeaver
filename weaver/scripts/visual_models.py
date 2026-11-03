#!/usr/bin/env python3
"""Product-local EmbeddingGemma visual embeddings through a job-owned llama-server."""

from contextlib import contextmanager, redirect_stdout
import base64
import json
import math
import mimetypes
import os
from pathlib import Path
import secrets
import socket
import subprocess
import sys
import tempfile
import time
from urllib import error, request


class ModelError(Exception):
    def __init__(self, code, message):
        super().__init__(message)
        self.code = code


def inspect():
    return {
        "python": sys.version.split()[0],
        "serverProtocol": "openai-embeddings-v1",
        "pooling": "mean",
        "context": 8192,
        "batch": 8192,
        "ubatch": 8192,
        "parallel": 1,
        "gpuLayers": 99,
        "warmup": False,
    }


def regular_file(value, label):
    file = Path(value)
    if not file.is_file():
        raise ModelError("CONFIG_MISSING", f"{label} 不存在: {file}")
    return file


def executable(value):
    file = regular_file(value, "llama_server")
    if not os.access(file, os.X_OK):
        raise ModelError("CONFIG_MISSING", f"llama_server 不可执行: {file}")
    return file


def server_environment():
    proxy_names = {
        "ALL_PROXY",
        "HTTP_PROXY",
        "HTTPS_PROXY",
        "NO_PROXY",
        "http_proxy",
        "https_proxy",
        "no_proxy",
    }
    env = {
        key: value
        for key, value in os.environ.items()
        if key not in proxy_names
        and not key.startswith("LLAMA_")
        and not key.startswith("MTMD_")
        and not key.upper().endswith("_PROXY")
    }
    env.update(
        {
            "HF_HUB_OFFLINE": "1",
            "TRANSFORMERS_OFFLINE": "1",
            "PYTHONDONTWRITEBYTECODE": "1",
        }
    )
    return env


def free_port():
    with socket.socket() as reservation:
        reservation.bind(("127.0.0.1", 0))
        return reservation.getsockname()[1]


def image_content(file):
    mime, _ = mimetypes.guess_type(file.name)
    if not mime or not mime.startswith("image/"):
        raise ModelError("INVALID_INPUT", f"无法识别图像类型: {file}")
    encoded = base64.b64encode(file.read_bytes()).decode("ascii")
    return {
        "content": [
            {"type": "text", "text": "<|image|>"},
            {
                "type": "image_url",
                "image_url": {"url": f"data:{mime};base64,{encoded}"},
            },
        ]
    }


def prepared_inputs(raw):
    if not isinstance(raw, list) or not raw:
        raise ModelError("INVALID_INPUT", "视觉嵌入输入必须是非空数组")
    prepared = []
    for item in raw:
        if not isinstance(item, dict):
            raise ModelError("INVALID_INPUT", "视觉嵌入输入格式无效")
        kind = item.get("kind")
        if kind == "text":
            text = item.get("text")
            if not isinstance(text, str) or not text.strip():
                raise ModelError("INVALID_INPUT", "视觉查询文本不能为空")
            prepared.append(text.strip())
        elif kind == "image":
            path = item.get("file")
            if not isinstance(path, str) or not path:
                raise ModelError("INVALID_INPUT", "视觉图像必须提供文件路径")
            prepared.append(image_content(regular_file(path, "视觉图像")))
        else:
            raise ModelError("INVALID_INPUT", "未知视觉输入类型")
    return prepared


@contextmanager
def visual_server(job):
    model = regular_file(job["model"], "visual_model")
    mmproj = regular_file(job["mmproj"], "visual_mmproj")
    server = executable(job["server"])
    for file, label in ((model, "visual_model"), (mmproj, "visual_mmproj")):
        with file.open("rb") as source:
            if source.read(4) != b"GGUF":
                raise ModelError("INVALID_INPUT", f"{label} 必须是 GGUF 文件")

    port = free_port()
    token = secrets.token_urlsafe(32)
    alias = f"lightweaver-visual-{secrets.token_hex(12)}"
    base = f"http://127.0.0.1:{port}"
    args = [
        str(server),
        "-m",
        str(model),
        "--mmproj",
        str(mmproj),
        "--host",
        "127.0.0.1",
        "--port",
        str(port),
        "--alias",
        alias,
        "--api-key",
        token,
        "--embedding",
        "--pooling",
        "mean",
        "-c",
        "8192",
        "-b",
        "8192",
        "-ub",
        "8192",
        "-np",
        "1",
        "-ngl",
        "99",
        "--no-warmup",
        "--offline",
    ]
    opener = request.build_opener(request.ProxyHandler({}))

    def call(endpoint, body=None, timeout=120):
        payload = None
        if body is not None:
            if isinstance(body, dict) and "model" in body:
                body = {**body, "model": alias}
            payload = json.dumps(body).encode("utf-8")
        req = request.Request(
            base + endpoint,
            data=payload,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {token}",
            },
        )
        try:
            with opener.open(req, timeout=timeout) as response:
                return json.load(response)
        except error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")[-1000:]
            raise ModelError(
                "PROVIDER_ERROR",
                f"视觉模型服务返回 HTTP {exc.code}: {detail}",
            ) from exc
        except OSError as exc:
            raise ModelError("NETWORK_ERROR", f"视觉模型服务请求失败: {exc}") from exc

    with tempfile.TemporaryFile() as log:
        process = subprocess.Popen(
            args,
            stdout=log,
            stderr=log,
            env=server_environment(),
        )
        try:
            deadline = time.monotonic() + 180
            last_failure = None
            while True:
                if process.poll() is not None:
                    log.seek(0)
                    diagnostic = log.read().decode("utf-8", errors="replace")[-4000:]
                    diagnostic = diagnostic.replace(token, "[redacted]").replace(
                        alias, "[alias]"
                    )
                    raise ModelError(
                        "PROCESS_FAILED",
                        f"视觉模型服务启动失败: {diagnostic}",
                    )
                try:
                    models = call("/v1/models", timeout=1)
                    rows = models.get("data") if isinstance(models, dict) else None
                    if not isinstance(rows, list):
                        raise ModelError("PROVIDER_FORMAT", "视觉模型列表响应无效")
                    if any(
                        isinstance(row, dict) and row.get("id") == alias
                        for row in rows
                    ):
                        break
                except ModelError as exc:
                    last_failure = exc
                if time.monotonic() >= deadline:
                    detail = f": {last_failure}" if last_failure else ""
                    raise ModelError(
                        "DEADLINE_EXCEEDED",
                        f"视觉模型服务启动超时{detail}",
                    )
                time.sleep(0.1)
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
    inputs = prepared_inputs(job.get("inputs"))
    model = str(regular_file(job["model"], "visual_model"))
    vectors = []
    with visual_server(job) as call:
        for item in inputs:
            response = call(
                "/v1/embeddings",
                {
                    "model": "lightweaver-visual",
                    "input": [item],
                    "encoding_format": "float",
                    "truncate": False,
                },
                timeout=900,
            )
            rows = response.get("data", [])
            if (
                len(rows) != 1
                or rows[0].get("index") != 0
                or not isinstance(rows[0].get("embedding"), list)
            ):
                raise ModelError("PROVIDER_FORMAT", "视觉向量响应数量或索引无效")
            vector = rows[0]["embedding"]
            if not vector or any(
                not isinstance(value, (int, float)) or not math.isfinite(value)
                for value in vector
            ):
                raise ModelError("PROVIDER_FORMAT", "视觉向量包含无效数值")
            norm = math.sqrt(sum(value * value for value in vector))
            if norm <= 1e-12:
                raise ModelError("PROVIDER_FORMAT", "视觉模型返回零向量")
            vectors.append([value / norm for value in vector])
    return {"model": model, "vectors": vectors}


if __name__ == "__main__":
    try:
        kind = sys.argv[1]
        with redirect_stdout(sys.stderr):
            if kind == "inspect":
                result = inspect()
            elif kind == "embed":
                job = json.loads(Path(sys.argv[2]).read_text(encoding="utf-8"))
                result = embed(job)
            else:
                raise ModelError("INVALID_INPUT", f"未知视觉模型操作: {kind}")
    except ModelError as exc:
        result = {"error": {"code": exc.code, "message": str(exc)}}
    except (ImportError, FileNotFoundError) as exc:
        result = {"error": {"code": "CONFIG_MISSING", "message": str(exc)}}
    except Exception as exc:
        result = {"error": {"code": "PROVIDER_FORMAT", "message": str(exc)}}
    print(json.dumps(result, ensure_ascii=False, allow_nan=False))
