import { z } from "../contracts/index.ts";
import { WeaverError } from "../contracts/errors.ts";

const Event = z.object({
  type: z.string(),
  audio: z.string().optional(),
  delta: z.string().optional(),
  error: z.unknown().optional(),
});
const invalid = (message: string): never => {
  throw new WeaverError("PROVIDER_FORMAT", message);
};

/** ModelBest speech-v1 is SSE carrying pieces of one WAV, including a terminal event. */
export async function readSpeechWav(response: Response): Promise<Buffer> {
  if (!response.body) return invalid("语音服务没有响应流");
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  const chunks: Buffer[] = [];
  let pending = "",
    data: string[] = [],
    eventName = "",
    done = false,
    bytes = 0;
  const flush = () => {
    if (!data.length) {
      eventName = "";
      return;
    }
    const body = data.join("\n");
    data = [];
    if (body === "[DONE]") {
      if (eventName === "error") invalid("语音服务报告流错误");
      eventName = "";
      return;
    }
    let raw: unknown;
    try {
      raw = JSON.parse(body);
    } catch {
      return invalid("语音事件不是有效 JSON");
    }
    const event = Event.safeParse(raw);
    if (!event.success) return invalid("语音事件不符合协议");
    if (
      eventName === "error" ||
      event.data.error !== undefined ||
      event.data.type === "error" ||
      event.data.type.endsWith(".error")
    )
      invalid("语音服务报告错误，未保存音频");
    eventName = "";
    if (event.data.type === "speech.audio.done") {
      done = true;
      return;
    }
    if (event.data.type !== "speech.audio.delta") return;
    if (done) return invalid("语音结束事件之后仍有音频");
    const encoded = event.data.audio || event.data.delta;
    if (!encoded) return;
    if (
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
        encoded,
      )
    )
      return invalid("语音事件的 base64 无效");
    const chunk = Buffer.from(encoded, "base64");
    bytes += chunk.length;
    if (bytes > 256 * 1024 * 1024) return invalid("语音响应超过 256 MiB");
    chunks.push(chunk);
  };
  const line = (value: string) => {
    const clean = value.replace(/\r$/, "");
    if (!clean) flush();
    else if (clean.startsWith("event:")) eventName = clean.slice(6).trim();
    else if (clean.startsWith("data:"))
      data.push(clean.slice(5).replace(/^ /, ""));
  };
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      pending += part.value;
      let boundary: number;
      while ((boundary = pending.indexOf("\n")) >= 0) {
        line(pending.slice(0, boundary));
        pending = pending.slice(boundary + 1);
      }
      if (
        pending.length > 4 * 1024 * 1024 ||
        data.reduce((n, s) => n + s.length, 0) > 4 * 1024 * 1024
      )
        invalid("语音事件过大");
    }
    if (pending) line(pending);
    flush();
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  if (!done || !chunks.length) return invalid("语音流未完整结束或没有音频");
  return finalizeWav(Buffer.concat(chunks));
}

function finalizeWav(wav: Buffer): Buffer {
  if (
    wav.length < 44 ||
    wav.toString("ascii", 0, 4) !== "RIFF" ||
    wav.toString("ascii", 8, 12) !== "WAVE"
  )
    return invalid("语音响应不是 WAV");
  let offset = 12,
    blockAlign = 0,
    hasData = false;
  while (offset + 8 <= wav.length) {
    const id = wav.toString("ascii", offset, offset + 4),
      size = wav.readUInt32LE(offset + 4),
      body = offset + 8;
    if (id === "data" && size === 0xffffffff)
      wav.writeUInt32LE(wav.length - body, offset + 4);
    const actual = wav.readUInt32LE(offset + 4);
    if (body + actual > wav.length) return invalid("WAV 数据不完整");
    if (id === "fmt ") {
      if (
        actual < 16 ||
        !wav.readUInt16LE(body + 2) ||
        !wav.readUInt32LE(body + 4)
      )
        return invalid("WAV 格式无效");
      blockAlign = wav.readUInt16LE(body + 12);
    }
    if (id === "data") {
      if (!blockAlign || !actual || actual % blockAlign)
        return invalid("WAV 音频帧无效");
      hasData = true;
    }
    offset = body + actual + (actual % 2);
  }
  if (!hasData || offset !== wav.length) return invalid("WAV 缺少完整音频帧");
  if (wav.readUInt32LE(4) === 0xffffffff) wav.writeUInt32LE(wav.length - 8, 4);
  if (wav.readUInt32LE(4) !== wav.length - 8)
    return invalid("WAV 容器长度不匹配");
  return wav;
}
