#!/usr/bin/env python3
"""Explicit local model adapters. No engine fallback and no authored narration."""
import importlib.metadata
import json
import sys


def align(job):
    import whisperx
    model, metadata = whisperx.load_align_model(
        language_code=job["locale"], device="cpu", model_name=job["model"]
    )
    audio = whisperx.load_audio(job["audio"])
    result = whisperx.align(
        [{"start": 0, "end": job["duration"], "text": job["text"]}],
        model, metadata, audio, "cpu", return_char_alignments=True,
    )
    words = [w for w in result["word_segments"] if "start" in w and "end" in w]
    if not words:
        raise ValueError("Alignment produced no timed words")
    segments, pending, start, end = [], [], None, None
    for word in words:
        pending.append(word["word"])
        start = word["start"] if start is None else start
        end = word["end"]
        if word["word"].endswith(tuple("。！？.!?；;")):
            segments.append({"text": " ".join(pending), "start": start, "end": end})
            pending, start = [], None
    if pending:
        segments.append({"text": " ".join(pending), "start": start, "end": end})
    return {"backend": "whisperx", "version": importlib.metadata.version("whisperx"),
            "model": job["model"], "segments": segments}


def embed(job):
    import torch
    from transformers import AutoModel, AutoTokenizer
    kwargs = {"revision": job["revision"]} if job.get("revision") else {}
    tokenizer = AutoTokenizer.from_pretrained(job["model"], **kwargs)
    model = AutoModel.from_pretrained(job["model"], **kwargs).eval()
    vectors = []
    with torch.inference_mode():
        for offset in range(0, len(job["texts"]), 16):
            batch = tokenizer(job["texts"][offset:offset + 16], padding=True,
                              truncation=True, max_length=512, return_tensors="pt")
            hidden = model(**batch).last_hidden_state
            mask = batch["attention_mask"].unsqueeze(-1).expand(hidden.size()).float()
            pooled = (hidden * mask).sum(1) / mask.sum(1).clamp(min=1e-9)
            pooled = torch.nn.functional.normalize(pooled, p=2, dim=1)
            vectors.extend(pooled.tolist())
    return {"model": job["model"], "revision": getattr(model.config, "_commit_hash", None)
            or job.get("revision") or "local", "vectors": vectors}


if __name__ == "__main__":
    with open(sys.argv[2], encoding="utf-8") as file:
        job = json.load(file)
    result = {"align": align, "embed": embed}[sys.argv[1]](job)
    print(json.dumps(result, ensure_ascii=False))
