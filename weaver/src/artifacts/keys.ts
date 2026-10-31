import { digest } from "../store/index.ts";
export function ttsKey(inputs: {
  text: string;
  style: string;
  locale: string;
  voiceVersion: string;
  reference: string;
  referenceText: string;
  binding: string;
  ffmpeg: string;
}) {
  return digest({
    operation: "tts-v3",
    inputs: { ...inputs, normalization: "wav-pcm-s24-48000-stereo-v1" },
  });
}
