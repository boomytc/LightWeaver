#!/usr/bin/env python3
"""Product-local Hy-MT2 subtitle translation through an owned llama-server."""

import json
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


LANGUAGES = {
    "en": "English",
    "de": "German",
    "es": "Spanish",
    "fr": "French",
    "it": "Italian",
    "pt": "Portuguese",
    "ru": "Russian",
    "ko": "Korean",
    "ja": "Japanese",
    "yue": "Cantonese",
    "zh": "Simplified Chinese",
}


def validate_model(model):
    path = Path(model)
    if not path.is_file() or path.stat().st_size <= 4:
        raise ModelError("CONFIG_MISSING", "translation_model 必须指向 Hy-MT2 GGUF 文件")
    with path.open("rb") as source:
        if source.read(4) != b"GGUF":
            raise ModelError("INVALID_INPUT", "translation_model 不是 GGUF 文件")
    return path


def inspect(model, server):
    missing = []
    model_valid = False
    model_error = ""
    try:
        validate_model(model)
        model_valid = True
    except ModelError as exc:
        model_error = str(exc)
        if exc.code == "CONFIG_MISSING":
            missing.append("translation_model")
    server_path = Path(server)
    if not server_path.is_file() or not os.access(server_path, os.X_OK):
        missing.append("llama_server")
        server_version = ""
    else:
        result = subprocess.run(
            [str(server_path), "--version"],
            capture_output=True,
            text=True,
            timeout=10,
            check=False,
        )
        if result.returncode != 0:
            raise ModelError(
                "PROCESS_FAILED",
                (result.stderr or result.stdout).strip()[-2000:]
                or "llama-server --version 失败",
            )
        server_version = (result.stdout or result.stderr).strip()
    return {
        "available": not missing and model_valid,
        "missing": sorted(set(missing)),
        "model": str(model),
        "modelFormat": "gguf",
        "modelValid": model_valid,
        "modelError": model_error,
        "server": str(server),
        "serverVersion": server_version,
    }


def language_name(target_locale):
    locale = target_locale.strip().lower().replace("_", "-")
    if locale in LANGUAGES:
        return LANGUAGES[locale]
    parts = locale.split("-")
    base = parts[0]
    if base == "zh" and {"hant", "tw", "hk", "mo"}.intersection(parts[1:]):
        return "Traditional Chinese"
    if base in LANGUAGES:
        return LANGUAGES[base]
    raise ModelError("TRANSLATION_LOCALE_UNSUPPORTED", f"Hy-MT2 不支持目标语种 {target_locale}")


def translation_prompt(text, language):
    return (
        f"Translate the following text into {language}. "
        "Note that you should only output the translated result without any additional explanation:"
        f"\n\n{text}"
    )


def isolated_environment(token):
    env = {
        key: value
        for key, value in os.environ.items()
        if not key.startswith("LLAMA_")
        and key.upper() not in {"ALL_PROXY", "HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY"}
    }
    env["LLAMA_API_KEY"] = token
    env["LLAMA_ARG_OFFLINE"] = "1"
    env["HF_HUB_OFFLINE"] = "1"
    env["TRANSFORMERS_OFFLINE"] = "1"
    env["PYTHONPATH"] = ""
    env["PYTHONNOUSERSITE"] = "1"
    env["PYTHONDONTWRITEBYTECODE"] = "1"
    env.pop("PYTHONHOME", None)
    return env


def choose_port():
    with socket.socket() as reservation:
        reservation.bind(("127.0.0.1", 0))
        return reservation.getsockname()[1]


def server_log_tail(log):
    log.flush()
    log.seek(0)
    return log.read().decode("utf-8", "replace").strip()[-4000:]


def clean_output(text):
    value = text.strip()
    for opening, closing in (("<target>", "</target>"),):
        if value.startswith(opening):
            value = value[len(opening) :].strip()
        if value.endswith(closing):
            value = value[: -len(closing)].strip()
    for prefix in ("译文：", "翻译：", "Translation:", "Output:"):
        if value.startswith(prefix):
            value = value[len(prefix) :].strip()
    return value


def translate(job):
    model = validate_model(job["model"])
    server = Path(job["server"])
    if not server.is_file() or not os.access(server, os.X_OK):
        raise ModelError("CONFIG_MISSING", "llama_server 不存在或不可执行")
    target_locale = str(job.get("targetLocale") or "")
    language = language_name(target_locale)
    texts = job.get("texts")
    if not isinstance(texts, list) or not texts:
        raise ModelError("INVALID_INPUT", "字幕翻译输入不能为空")
    for item in texts:
        if (
            not isinstance(item, dict)
            or not isinstance(item.get("id"), str)
            or not item["id"]
            or not isinstance(item.get("text"), str)
            or not item["text"].strip()
        ):
            raise ModelError("INVALID_INPUT", "字幕标识或文本无效")

    port = choose_port()
    token = secrets.token_hex(32)
    alias = f"lightweaver-hymt2-{secrets.token_hex(8)}"
    base = f"http://127.0.0.1:{port}"
    args = [
        str(server),
        "-m",
        str(model),
        "--host",
        "127.0.0.1",
        "--port",
        str(port),
        "--alias",
        alias,
        "-c",
        "8192",
        "-ngl",
        "99",
        "-np",
        "1",
        "--jinja",
        "--no-webui",
        "--offline",
    ]
    opener = request.build_opener(request.ProxyHandler({}))

    def call(endpoint, body=None, timeout=180):
        data = json.dumps(body, ensure_ascii=False).encode("utf-8") if body is not None else None
        req = request.Request(
            base + endpoint,
            data=data,
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            },
        )
        try:
            with opener.open(req, timeout=timeout) as response:
                value = json.load(response)
        except error.HTTPError as exc:
            detail = exc.read().decode("utf-8", "replace")[-2000:]
            raise ModelError(
                "PROVIDER_ERROR",
                f"本地 Hy-MT2 服务返回 HTTP {exc.code}: {detail}",
            ) from exc
        except (OSError, ValueError) as exc:
            raise ModelError("PROVIDER_ERROR", f"本地 Hy-MT2 请求失败：{exc}") from exc
        if not isinstance(value, dict):
            raise ModelError("PROVIDER_FORMAT", "本地 Hy-MT2 响应不是对象")
        return value

    with tempfile.TemporaryFile() as log:
        process = subprocess.Popen(
            args,
            stdin=subprocess.DEVNULL,
            stdout=log,
            stderr=log,
            env=isolated_environment(token),
        )
        try:
            deadline = time.monotonic() + 180
            while True:
                if process.poll() is not None:
                    detail = server_log_tail(log)
                    raise ModelError(
                        "PROCESS_FAILED",
                        f"llama-server 启动失败：{detail or '未知错误'}",
                    )
                try:
                    models = call("/v1/models", timeout=2)
                    if not any(
                        item.get("id") == alias
                        for item in models.get("data", [])
                        if isinstance(item, dict)
                    ):
                        raise ModelError("PROVIDER_FORMAT", "随机本地端口不属于本次模型作业")
                    break
                except (ModelError, error.URLError):
                    if time.monotonic() >= deadline:
                        raise ModelError("DEADLINE_EXCEEDED", "llama-server 启动超时")
                    time.sleep(0.2)

            translated = []
            for item in texts:
                source = item["text"].strip()
                body = call(
                    "/v1/chat/completions",
                    {
                        "model": alias,
                        "messages": [
                            {
                                "role": "user",
                                "content": translation_prompt(source, language),
                            }
                        ],
                        "temperature": 0.7,
                        "top_p": 0.6,
                        "top_k": 20,
                        "repeat_penalty": 1.05,
                        "max_tokens": 4096,
                        "seed": 42,
                        "stream": False,
                    },
                    timeout=900,
                )
                choices = body.get("choices")
                if not isinstance(choices, list) or len(choices) != 1:
                    raise ModelError("PROVIDER_FORMAT", "Hy-MT2 响应缺少唯一结果")
                choice = choices[0] if isinstance(choices[0], dict) else {}
                if choice.get("finish_reason") == "length":
                    raise ModelError("OUTPUT_TRUNCATED", "Hy-MT2 译文超过输出上限")
                message = choice.get("message")
                content = message.get("content") if isinstance(message, dict) else None
                if not isinstance(content, str):
                    raise ModelError("PROVIDER_FORMAT", "Hy-MT2 响应缺少译文")
                value = clean_output(content)
                if not value:
                    raise ModelError("PROVIDER_FORMAT", "Hy-MT2 返回空译文")
                translated.append({"id": item["id"], "text": value})
            return {"items": translated}
        finally:
            if process.poll() is None:
                process.terminate()
                try:
                    process.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait(timeout=5)


if __name__ == "__main__":
    try:
        kind = sys.argv[1]
        if kind == "inspect":
            result = inspect(sys.argv[2], sys.argv[3])
        elif kind == "translate":
            job = json.loads(Path(sys.argv[2]).read_text(encoding="utf-8"))
            result = translate(job)
        else:
            raise ModelError("INVALID_INPUT", f"未知操作：{kind}")
    except ModelError as exc:
        result = {"error": {"code": exc.code, "message": str(exc)}}
    except (ImportError, FileNotFoundError, PermissionError) as exc:
        result = {"error": {"code": "CONFIG_MISSING", "message": str(exc)}}
    except subprocess.TimeoutExpired:
        result = {"error": {"code": "DEADLINE_EXCEEDED", "message": "Hy-MT2 检查超时"}}
    except Exception as exc:
        result = {"error": {"code": "PROVIDER_FORMAT", "message": str(exc)}}
    print(json.dumps(result, ensure_ascii=False, allow_nan=False))
