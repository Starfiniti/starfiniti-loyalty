import "server-only";
import { readFileSync } from "node:fs";

type SigningMaterial = Record<string, string>;

let cachedPath: string | undefined;
let cachedMaterial: SigningMaterial | undefined;

function loadSigningMaterial(): SigningMaterial {
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

  return cachedMaterial;
}

export function getWooCommerceSigningKey(reference: string): Uint8Array {
  const material = loadSigningMaterial();

  const encoded = material[reference];
  if (typeof encoded !== "string" || !/^[A-Za-z0-9+/]+={0,2}$/u.test(encoded)) {
    throw new Error("signing_key_unavailable");
  }
  const key = Buffer.from(encoded, "base64");
  if (key.byteLength < 32) throw new Error("signing_key_unavailable");
  return key;
}

export function getWooCommerceSigningPoolReferences(): readonly string[] {
  return Object.entries(loadSigningMaterial())
    .filter(([reference, encoded]) => {
      if (
        !/^pool:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}:v1$/u.test(
          reference,
        )
      ) {
        return false;
      }
      return (
        /^[A-Za-z0-9+/]+={0,2}$/u.test(encoded) &&
        Buffer.from(encoded, "base64").byteLength >= 32
      );
    })
    .map(([reference]) => reference)
    .sort();
}
