import { parseAssetRef, type Asset } from "./schema.ts";

/** 片子上的 recipe、library:method.*、method.* 都收成 apply 用的 id。 */
export function recipeIdOf(ref: string): string {
  const trimmed = ref.trim();
  if (!trimmed) return "";
  const parsed = parseAssetRef(trimmed);
  const raw = parsed?.id ?? trimmed;
  return raw.replace(/^method\./, "");
}

export function methodNameOf(asset: Pick<Asset, "id" | "label">): string {
  return (asset.label ?? recipeIdOf(asset.id)).trim();
}
