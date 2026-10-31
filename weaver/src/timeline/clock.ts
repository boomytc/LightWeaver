import {
  Frames,
  Samples,
  Microseconds,
  type OutputProfile,
} from "../contracts/index.ts";

export type Rational = { n: bigint; d: bigint };
const gcd = (a: bigint, b: bigint): bigint => (b ? gcd(b, a % b) : a);
export function rational(n: bigint, d: bigint): Rational {
  const g = gcd(n < 0 ? -n : n, d);
  return { n: n / g, d: d / g };
}
export function add(a: Rational, b: Rational): Rational {
  return rational(a.n * b.d + b.n * a.d, a.d * b.d);
}
export function round(a: Rational): number {
  return Number((a.n * 2n + a.d) / (a.d * 2n));
}
export function ceil(a: Rational): number {
  return Number((a.n + a.d - 1n) / a.d);
}
export function usSeconds(us: number): Rational {
  return rational(BigInt(us), 1000000n);
}
export function frameSeconds(
  frames: number,
  fps: OutputProfile["fps"],
): Rational {
  return rational(BigInt(frames) * BigInt(fps.den), BigInt(fps.num));
}
export function secondsFrames(
  seconds: Rational,
  fps: OutputProfile["fps"],
  up = false,
): ReturnType<typeof Frames.parse> {
  const r = rational(seconds.n * BigInt(fps.num), seconds.d * BigInt(fps.den));
  return Frames.parse(up ? ceil(r) : round(r));
}
export function frameSamples(
  frames: number,
  fps: OutputProfile["fps"],
): ReturnType<typeof Samples.parse> {
  return Samples.parse(
    round(rational(BigInt(frames) * BigInt(fps.den) * 48000n, BigInt(fps.num))),
  );
}
export function frameUs(
  frames: number,
  fps: OutputProfile["fps"],
): ReturnType<typeof Microseconds.parse> {
  return Microseconds.parse(
    round(
      rational(BigInt(frames) * BigInt(fps.den) * 1000000n, BigInt(fps.num)),
    ),
  );
}
