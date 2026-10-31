import fs from "node:fs";
import path from "node:path";
import { z, Digest } from "../contracts/index.ts";
import { Store } from "../store/index.ts";
import { Artifacts } from "../artifacts/index.ts";
import { processRun } from "./process.ts";
import { probe } from "./probe.ts";
import {
  dHashFromGray,
  lumaPlane,
  rgbMean,
  quadFromRgb,
  hashToHex,
  hashFromHex,
  type FrameHash,
} from "../match-visual.ts";
import { parseSceneLog, type SceneIndex } from "../match-scene.ts";
import { MATCH_SETTINGS } from "../match-settings.ts";

const Rgb = z.tuple([z.number(), z.number(), z.number()]);
const Hashes = z.array(
  z.object({
    t: z.number(),
    hash: z.string().regex(/^[a-f0-9]{16}$/),
    mean: Rgb,
    quad: z.tuple([Rgb, Rgb, Rgb, Rgb]),
  }),
);
const Scenes = z.object({
  duration: z.number(),
  boundaries: z.array(z.object({ time: z.number(), score: z.number() })),
});
export async function visualFacts(
  store: Store,
  sourceDigest: z.infer<typeof Digest>,
  workDir: string,
  signal: AbortSignal,
  window?: { startUs: number; durationUs: number },
): Promise<{ hashes: FrameHash[]; scenes: SceneIndex }> {
  const artifacts = new Artifacts(store),
    version = (
      await processRun("ffmpeg", ["-version"], { signal })
    ).stdout.split("\n")[0];
  const key = artifacts.key("visual-dhash-scenes-v3", {
    sourceDigest,
    window,
    settings: MATCH_SETTINGS,
    version,
  });
  const cached = artifacts.lookup(key);
  const Result = z.object({ hashes: Hashes, scenes: Scenes });
  if (cached) {
    const r = store.jsonBlob(cached.digest, Result);
    return {
      hashes: r.hashes.map((h) => ({ ...h, hash: hashFromHex(h.hash) })),
      scenes: r.scenes,
    };
  }
  const fact = await probe(store.blobPath(sourceDigest), signal),
    duration = fact.durationUs / 1e6;
  const from = (window?.startUs || 0) / 1e6,
    span = window ? window.durationUs / 1e6 : duration;
  const rawFile = path.join(
      workDir,
      `hashes-${sourceDigest.slice(0, 12)}-${window?.startUs || 0}.rgb`,
    ),
    cfg = MATCH_SETTINGS;
  const args = [
    "-ss",
    String(from),
    "-t",
    String(span),
    "-i",
    store.blobPath(sourceDigest),
  ];
  await processRun(
    "ffmpeg",
    [
      "-v",
      "error",
      "-y",
      ...args,
      "-vf",
      `fps=${1 / cfg.frameInterval},crop=iw*(1-${2 * cfg.cropSide}):ih*(1-${cfg.cropTop + cfg.cropBottom}):iw*${cfg.cropSide}:ih*${cfg.cropTop},scale=9:8,format=rgb24`,
      "-f",
      "rawvideo",
      rawFile,
    ],
    { signal },
  );
  const raw = fs.readFileSync(rawFile),
    hashes: FrameHash[] = [];
  for (
    let offset = 0, index = 0;
    offset + 216 <= raw.length;
    offset += 216, index++
  ) {
    const pixels = raw.subarray(offset, offset + 216);
    hashes.push({
      t: from + index * cfg.frameInterval,
      hash: dHashFromGray(lumaPlane(pixels)),
      mean: rgbMean(pixels),
      quad: quadFromRgb(pixels),
    });
  }
  const sceneLog = await processRun(
    "ffmpeg",
    [
      "-hide_banner",
      ...args,
      "-vf",
      `select='gt(scene,${cfg.sceneThreshold})',metadata=print`,
      "-an",
      "-f",
      "null",
      "-",
    ],
    { signal },
  );
  const scenes = Scenes.parse({
    duration,
    boundaries: parseSceneLog(sceneLog.stderr).map((b) => ({
      ...b,
      time: from + b.time,
    })),
  });
  const result = {
    hashes: hashes.map((h) => ({ ...h, hash: hashToHex(h.hash) })),
    scenes,
  };
  artifacts.record({
    operation: "visual-dhash-scenes-v3",
    cacheKey: key,
    generation: "default",
    digest: store.putJson(result),
    mime: "application/json",
    dependencies: [sourceDigest],
    provenance: { sourceDigest, window },
    verified: true,
  });
  fs.rmSync(rawFile, { force: true });
  return { hashes, scenes };
}
