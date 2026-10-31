import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bundle } from "@remotion/bundler";
import {
  renderMedia,
  selectComposition,
  makeCancelSignal,
} from "@remotion/renderer";
import { CardRenderInput } from "@lightweaver/weaver/contracts";
import { adapterInfo } from "./adapter-info";

const [input, dest] = process.argv.slice(2);
if (input === "--describe") {
  process.stdout.write(JSON.stringify(adapterInfo()) + "\n");
  process.exit(0);
}
if (!input || !dest) throw new Error("用法: weaver-card input.json output.mp4");
const props = CardRenderInput.parse(JSON.parse(fs.readFileSync(input, "utf8")));
if (
  props.adapterFingerprint &&
  props.adapterFingerprint !== adapterInfo().fingerprint
)
  throw new Error(
    "CARD_ADAPTER_CHANGED: 卡片实现或字体/浏览器已改变，请重新构建",
  );
const { cancel, cancelSignal } = makeCancelSignal();
process.on("SIGTERM", cancel);
process.on("SIGINT", cancel);
const prebuiltSite = process.env.LIGHTWEAVER_CARD_SITE || "";
const serveUrl = prebuiltSite
  ? prebuiltSite
  : await bundle({
      entryPoint: fileURLToPath(new URL("./card-entry.tsx", import.meta.url)),
      outDir: path.join(path.dirname(dest), "card-bundle"),
      enableCaching: false,
    });
const chrome =
  process.env.LIGHTWEAVER_CHROME ||
  (process.env.LIGHTWEAVER_PACKAGED === "1"
    ? undefined
    : fs.existsSync("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")
      ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
      : undefined);
if (process.env.LIGHTWEAVER_PACKAGED === "1" && !chrome)
  throw new Error("卡片浏览器未随包提供");
const composition = await selectComposition({
  serveUrl,
  id: "Card",
  inputProps: props,
  browserExecutable: chrome,
  logLevel: "error",
});
await renderMedia({
  serveUrl,
  composition,
  inputProps: props,
  codec: "h264",
  outputLocation: dest,
  muted: true,
  enforceAudioTrack: false,
  pixelFormat: "yuv420p",
  colorSpace: "bt709",
  browserExecutable: chrome,
  cancelSignal,
  concurrency: 2,
  logLevel: "error",
  crf: props.output.crf,
});
process.stdout.write(
  JSON.stringify({ file: dest, frames: props.durationFrames, silent: true }) +
    "\n",
);
