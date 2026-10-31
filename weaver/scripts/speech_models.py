#!/usr/bin/env python3
"""Product-local VoxCPM2 synthesis with no downloads or runtime sibling imports."""

from contextlib import redirect_stdout
import importlib.metadata
import importlib.util
import json
import os
from pathlib import Path
import sys
import sysconfig
import wave


class ModelError(Exception):
    def __init__(self, code, message):
        super().__init__(message)
        self.code = code


def distribution_version():
    for name in ("voxcpm", "tts-voxcpm"):
        try:
            return name, importlib.metadata.version(name)
        except importlib.metadata.PackageNotFoundError:
            continue
    return "", ""


def has_voxcpm2_core():
    spec = importlib.util.find_spec("voxcpm")
    if spec is None:
        return False
    return any(
        (Path(location) / "model" / "voxcpm2.py").is_file()
        for location in (spec.submodule_search_locations or [])
    )


def validate_model(model):
    path = Path(model)
    if not path.is_dir():
        raise ModelError("CONFIG_MISSING", "local_tts_model 必须指向 VoxCPM2 权重目录")
    config_path = path / "config.json"
    try:
        config = json.loads(config_path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise ModelError("CONFIG_MISSING", f"缺少 VoxCPM2 配置：{config_path}") from exc
    if not isinstance(config, dict) or config.get("architecture") != "voxcpm2":
        raise ModelError("INVALID_INPUT", "local_tts_model 不是 VoxCPM2 权重")
    for name in ("model.safetensors", "audiovae.pth", "tokenizer.json"):
        file = path / name
        if not file.is_file() or file.stat().st_size <= 0:
            raise ModelError("CONFIG_MISSING", f"缺少 VoxCPM2 权重文件：{file}")
    return path


def inspect(model):
    missing = [] if has_voxcpm2_core() else ["voxcpm>=2.0.3"]
    versions = {}
    for module in (
        "torch",
        "torchaudio",
        "transformers",
        "numpy",
        "soundfile",
        "librosa",
    ):
        if importlib.util.find_spec(module) is None:
            missing.append(module)
    distribution, version = distribution_version()
    if version:
        versions[distribution] = version
    for name in ("torch", "torchaudio", "transformers", "numpy"):
        try:
            versions[name] = importlib.metadata.version(name)
        except importlib.metadata.PackageNotFoundError:
            if name not in missing:
                missing.append(name)
    valid_model = True
    model_error = ""
    try:
        validate_model(model)
    except ModelError as exc:
        valid_model = False
        model_error = str(exc)
        if exc.code == "CONFIG_MISSING":
            missing.append("local_tts_model")
    return {
        "available": not missing and valid_model,
        "missing": sorted(set(missing)),
        "python": sys.version.split()[0],
        "versions": versions,
        "model": str(model),
        "modelValid": valid_model,
        "modelError": model_error,
        "packagePaths": sorted({sysconfig.get_path("purelib"), sysconfig.get_path("platlib")}),
    }


def compose_text(text, style):
    prefix = (style or "").strip()
    if not prefix:
        return text
    if prefix.startswith("(") and prefix.endswith(")"):
        return f"{prefix}{text}"
    return f"({prefix}){text}"


def write_wav(dest, samples, sample_rate):
    target = Path(dest)
    target.parent.mkdir(parents=True, exist_ok=True)
    partial = target.with_name(f".{target.name}.{os.getpid()}.partial")
    try:
        import numpy as np

        waveform = np.asarray(samples, dtype=np.float32).reshape(-1)
        if not waveform.size or not np.isfinite(waveform).all():
            raise ModelError("PROVIDER_FORMAT", "VoxCPM2 返回空音频或非有限数值")
        pcm = np.rint(np.clip(waveform, -1.0, 1.0) * 32767).astype("<i2")
        with wave.open(str(partial), "wb") as output:
            output.setnchannels(1)
            output.setsampwidth(2)
            output.setframerate(sample_rate)
            output.writeframes(pcm.tobytes())
        os.replace(partial, target)
    finally:
        if partial.exists():
            partial.unlink()


def synthesize(job):
    model_path = validate_model(job["model"])
    text = str(job.get("text") or "").strip()
    if not text:
        raise ModelError("INVALID_INPUT", "VoxCPM2 合成文本不能为空")
    reference = str(job.get("reference") or "").strip()
    reference_text = str(job.get("referenceText") or "").strip()
    if reference and not Path(reference).is_file():
        raise ModelError("INVALID_INPUT", "VoxCPM2 参考音频不存在")
    if reference_text and not reference:
        raise ModelError("INVALID_INPUT", "referenceText 必须与 reference 一起使用")

    mode = job.get("mode")
    if mode not in {"design", "controlled-clone", "continuation-clone"}:
        raise ModelError("INVALID_INPUT", "未知 VoxCPM2 合成模式")
    if mode != "design" and not reference:
        raise ModelError("INVALID_INPUT", "克隆模式需要参考音频")
    if mode == "continuation-clone" and (not reference_text or str(job.get("style") or "").strip()):
        raise ModelError("INVALID_INPUT", "续写克隆需要参考文本，且不能同时使用风格控制")

    from voxcpm import VoxCPM

    model = VoxCPM.from_pretrained(
        str(model_path),
        load_denoiser=False,
        local_files_only=True,
        optimize=False,
    )
    kwargs = {
        "text": compose_text(text, job.get("style")),
        "cfg_value": 2.0,
        "inference_timesteps": 10,
    }
    if mode != "design":
        kwargs["reference_wav_path"] = reference
        if mode == "continuation-clone":
            kwargs["prompt_wav_path"] = reference
            kwargs["prompt_text"] = reference_text
    samples = model.generate(**kwargs)
    sample_rate = int(getattr(model.tts_model, "sample_rate", 48000))
    if sample_rate <= 0:
        raise ModelError("PROVIDER_FORMAT", "VoxCPM2 返回无效采样率")
    dest = Path(job["dest"])
    write_wav(dest, samples, sample_rate)
    return {
        "provider": "local-voxcpm2",
        "model": str(model_path),
        "dest": str(dest),
        "bytes": dest.stat().st_size,
        "sampleRate": sample_rate,
    }


if __name__ == "__main__":
    try:
        with redirect_stdout(sys.stderr):
            kind = sys.argv[1]
            if kind == "inspect":
                result = inspect(sys.argv[2])
            elif kind == "synthesize":
                job = json.loads(Path(sys.argv[2]).read_text(encoding="utf-8"))
                result = synthesize(job)
            else:
                raise ModelError("INVALID_INPUT", f"未知操作：{kind}")
    except ModelError as exc:
        result = {"error": {"code": exc.code, "message": str(exc)}}
    except (ImportError, FileNotFoundError, PermissionError) as exc:
        result = {"error": {"code": "CONFIG_MISSING", "message": str(exc)}}
    except Exception as exc:
        result = {"error": {"code": "PROVIDER_FORMAT", "message": str(exc)}}
    print(json.dumps(result, ensure_ascii=False, allow_nan=False))
