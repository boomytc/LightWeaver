import path from "node:path";
import { z, MediaAssetVersion } from "../contracts/index.ts";
export function inferKind(
  name: string,
): z.infer<typeof MediaAssetVersion>["kind"] {
  return /\.(mp4|mov|mkv|webm|avi)$/i.test(name)
    ? "video"
    : /\.(wav|mp3|m4a|flac|ogg)$/i.test(name)
      ? "audio"
      : /\.(png|jpe?g|webp|svg|gif)$/i.test(name)
        ? "image"
        : /\.(srt|vtt|ass)$/i.test(name)
          ? "subtitle"
          : "document";
}
export function mimeFor(name: string): string {
  const ext = path.extname(name).toLowerCase();
  return (
    {
      ".mp4": "video/mp4",
      ".mov": "video/quicktime",
      ".webm": "video/webm",
      ".wav": "audio/wav",
      ".mp3": "audio/mpeg",
      ".m4a": "audio/mp4",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".svg": "image/svg+xml",
      ".webp": "image/webp",
      ".srt": "application/x-subrip",
      ".vtt": "text/vtt",
    }[ext] || "application/octet-stream"
  );
}
