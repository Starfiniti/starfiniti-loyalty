import "server-only";
import { readFileSync } from "node:fs";

type SigningMaterial = Record<string, string>;

let cachedPath: string | undefined;
let cachedMaterial: SigningMaterial | undefined;

export function getWooCommerceSigningKey(reference: string): Uint8Array {
  const materialPath = process.env.WOOCOMMERCE_SIGNING_MATERIAL_FILE;
  if (!materialPath) throw new Error("signing_material_unavailable");

  if (!cachedMaterial || cachedPath !== materialPath) {
    const parsed: unknown = JSON.parse(readFileSync(materialPath, "utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("signing_material_unavailable");
    }
    cachedMaterial = parsed as SigningMaterial;
    cachedPath = materialPath;
  }

  const encoded = cachedMaterial[reference];
  if (typeof encoded !== "string") throw new Error("signing_key_unavailable");
  const key = Buffer.from(encoded, "base64");
  if (key.byteLength < 32) throw new Error("signing_key_unavailable");
  return key;
}
