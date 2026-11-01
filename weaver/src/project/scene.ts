import {
  AssetId,
  Locale,
  Scene,
  SceneId,
  type ProjectDocument,
  type MediaAssetVersion,
} from "../contracts/index.ts";
import { WeaverError } from "../contracts/errors.ts";
import { digest } from "../store/index.ts";

type SceneKind = "card" | "still" | "clip";

type ExactSeconds = {
  readonly microseconds: number;
  readonly numerator: bigint;
  readonly denominator: bigint;
};

export type SceneAddInput = {
  readonly projectId: string;
  readonly expectedRevision: string;
  readonly requestId: string;
  readonly kind: string;
  readonly duration: string;
  readonly locale?: string;
  readonly label?: string;
  readonly headline?: string;
  readonly body?: string;
  readonly source?: string;
  readonly start?: string;
  readonly sceneId?: string;
};

function invalid(
  message: string,
  details: unknown,
  hints: string[] = [],
): never {
  throw new WeaverError("INVALID_INPUT", message, details, hints);
}

function parseExactSeconds(
  value: string,
  name: string,
  allowZero: boolean,
): ExactSeconds {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(value);
  if (!match)
    invalid(`--${name} 必须是非负秒数，最多六位小数`, { flag: name, value }, [
      `示例: --${name} 3.5`,
    ]);
  const whole = match[1],
    rawFraction = match[2] || "",
    fraction = rawFraction.replace(/0+$/, "");
  if (!whole || fraction.length > 6)
    invalid(
      `--${name} 的秒数不能小于一微秒`,
      { flag: name, value, precision: "microseconds" },
      ["最多使用六位小数"],
    );
  const scale = 10n ** BigInt(fraction.length),
    wholeValue = BigInt(whole),
    fractionalValue = fraction.length ? BigInt(fraction) : 0n,
    numerator = wholeValue * scale + fractionalValue,
    microseconds = (numerator * 1_000_000n + scale / 2n) / scale;
  if (!allowZero && numerator === 0n)
    invalid(`--${name} 必须大于零`, { flag: name, value });
  if (microseconds > BigInt(Number.MAX_SAFE_INTEGER))
    invalid(`--${name} 超出安全整数范围`, { flag: name, value });
  return {
    microseconds: Number(microseconds),
    numerator,
    denominator: scale,
  };
}

function secondsToFrames(
  seconds: ExactSeconds,
  fps: { readonly num: number; readonly den: number },
  value: string,
): number {
  const numerator = seconds.numerator * BigInt(fps.num),
    denominator = seconds.denominator * BigInt(fps.den),
    frames = (numerator + denominator / 2n) / denominator;
  if (frames < 1n || frames > BigInt(Number.MAX_SAFE_INTEGER))
    invalid(`--duration ${value} 无法转换为有效整数帧`, { value, fps }, [
      "增加时长或调整项目帧率",
    ]);
  return Number(frames);
}

function fixedFrames(
  document: ProjectDocument,
  seconds: ExactSeconds,
  value: string,
): number {
  const fps = document.profiles[0]?.fps;
  if (!fps)
    invalid("项目缺少输出 profile，无法计算场景帧数", {
      projectId: document.id,
    });
  if (
    document.profiles.some(
      (profile) =>
        BigInt(profile.fps.num) * BigInt(fps.den) !==
        BigInt(fps.num) * BigInt(profile.fps.den),
    )
  )
    invalid(
      "项目输出 profile 的帧率不一致，无法用一个秒数生成统一场景时长",
      { projectId: document.id },
      ["统一 profile 帧率，或使用 project apply 提交显式帧数"],
    );
  return secondsToFrames(seconds, fps, value);
}

function sceneKind(value: string): SceneKind {
  if (value === "card" || value === "still" || value === "clip") return value;
  return invalid("--kind 只接受 card、still 或 clip", { value }, [
    "运行 weaver scene add --help 查看示例",
  ]);
}

function requireText(value: string | undefined, name: string): string {
  if (!value?.trim()) return invalid(`缺少必填参数: --${name}`, { flag: name });
  return value;
}

export function sceneFromInput(
  input: SceneAddInput,
  document: ProjectDocument,
  assets: () => MediaAssetVersion[],
): Scene {
  const projectId = document.id,
    kind = sceneKind(input.kind),
    duration = parseExactSeconds(input.duration, "duration", false),
    localeValue = input.locale || document.locales[0],
    localeResult = Locale.safeParse(localeValue);
  if (!localeResult.success)
    invalid("--locale 不是合法语言标签", localeResult.error.issues, [
      "使用项目已有的 BCP 47 风格标签，例如 zh 或 en",
    ]);
  if (!document.locales.includes(localeResult.data))
    invalid(
      "--locale 不在项目语言中",
      { locale: localeResult.data, locales: document.locales },
      ["使用项目已有语言，或先修改项目的 locales"],
    );

  const sceneId = SceneId.parse(
      input.sceneId || `scene-${digest(input.requestId).slice(0, 32)}`,
    ),
    unusedForKind = [
      kind !== "card" && input.headline ? "--headline" : "",
      kind !== "card" && input.body ? "--body" : "",
      kind === "card" && input.source ? "--source" : "",
      kind !== "clip" && input.start ? "--start" : "",
    ].filter(Boolean);
  if (unusedForKind.length)
    invalid(
      `${kind} 场景不支持 ${unusedForKind.join(", ")}`,
      { kind, flags: unusedForKind },
      ["运行 weaver scene add --help 查看各场景类型的参数"],
    );

  let scene: Scene;
  if (kind === "card") {
    const headline = requireText(input.headline, "headline"),
      points = (input.body || "")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
    scene = Scene.parse({
      id: sceneId,
      kind: "card",
      label: input.label?.trim() || headline,
      cardSpec: {
        template: points.length ? "points" : "title",
        version: "2",
        copy: {
          [localeResult.data]: {
            kicker: "",
            headline,
            lede: "",
            points,
            tags: [],
          },
        },
      },
      timing: {
        kind: "fixed",
        frames: fixedFrames(document, duration, input.duration),
      },
    });
  } else {
    const sourceId = AssetId.parse(requireText(input.source, "source")),
      asset = assets().find((candidate) => candidate.assetId === sourceId);
    if (!asset)
      throw new WeaverError(
        "NOT_FOUND",
        "源素材不在该项目的当前修订中",
        {
          projectId,
          source: sourceId,
          expectedRevision: input.expectedRevision,
        },
        ["运行 project context 查看当前精确素材引用"],
      );
    const expectedKind = kind === "still" ? "image" : "video";
    if (asset.kind !== expectedKind)
      invalid(`${kind} 场景要求 ${expectedKind} 素材，收到 ${asset.kind}`, {
        source: sourceId,
        actualKind: asset.kind,
        expectedKind,
      });
    const mediaRef = {
      assetId: asset.assetId,
      version: asset.version,
    };
    if (kind === "still")
      scene = Scene.parse({
        id: sceneId,
        kind,
        label: input.label?.trim() || asset.name,
        image: mediaRef,
        framing: {},
        timing: {
          kind: "fixed",
          frames: fixedFrames(document, duration, input.duration),
        },
      });
    else {
      const start = parseExactSeconds(input.start || "0", "start", true),
        end = start.microseconds + duration.microseconds;
      if (!Number.isSafeInteger(end))
        invalid("源片时间窗超出安全整数范围", {
          startUs: start.microseconds,
          durationUs: duration.microseconds,
        });
      scene = Scene.parse({
        id: sceneId,
        kind,
        label: input.label?.trim() || asset.name,
        source: mediaRef,
        sourceRange: {
          startUs: start.microseconds,
          durationUs: duration.microseconds,
        },
        framing: {},
        playback: {
          kind: "source",
          audio: { kind: "original" },
        },
      });
    }
  }

  return scene;
}
