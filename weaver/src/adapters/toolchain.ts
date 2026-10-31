import fs from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { z, Digest } from "../contracts/index.ts";
import { WeaverError } from "../contracts/errors.ts";
import { processRun } from "../media/process.ts";
import { digest } from "../store/index.ts";

const fileHashes = new Map<
  string,
  { signature: string; digest: z.infer<typeof Digest> }
>();
export async function fileDigest(
  file: string,
): Promise<z.infer<typeof Digest>> {
  const stat = fs.statSync(file, { bigint: true }),
    signature = `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeNs}:${stat.ctimeNs}`;
  const cached = fileHashes.get(file);
  if (cached?.signature === signature) return cached.digest;
  const hash = createHash("sha256");
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  const value = Digest.parse(hash.digest("hex"));
  fileHashes.set(file, { signature, digest: value });
  return value;
}
export async function localModelDigest(
  file: string,
): Promise<z.infer<typeof Digest>> {
  if (!fs.existsSync(file))
    throw new WeaverError("CONFIG_MISSING", "本地模型或绑定文件不存在");
  if (fs.statSync(file).isFile()) return fileDigest(file);
  const files: [string, z.infer<typeof Digest>][] = [];
  const parents = new Set<string>();
  const visit = async (dir: string): Promise<void> => {
    const real = fs.realpathSync(dir);
    if (parents.has(real))
      throw new WeaverError("INVALID_INPUT", "本地模型目录存在循环软链");
    parents.add(real);
    for (const e of fs
      .readdirSync(dir, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name))) {
      const p = path.join(dir, e.name);
      const stat = e.isSymbolicLink() ? fs.statSync(p) : e;
      if (stat.isDirectory()) await visit(p);
      else if (stat.isFile() && !/\.pyc$/.test(e.name))
        files.push([path.relative(file, p), await fileDigest(p)]);
    }
    parents.delete(real);
  };
  await visit(file);
  return digest(files);
}
export async function toolVersion(
  command: string,
  signal?: AbortSignal,
): Promise<string> {
  return (
    await processRun(command, ["-version"], { timeoutMs: 5000, signal })
  ).stdout.split("\n")[0];
}
