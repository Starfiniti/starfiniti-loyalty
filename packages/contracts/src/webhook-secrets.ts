import { createHash, randomBytes } from "node:crypto";

export type IssuedWebhookSigningSecretV1 = Readonly<{
  secret: string;
  fingerprintSha256: string;
  hint: string;
}>;

export function issueWebhookSigningSecretV1(
  bytes: Uint8Array = randomBytes(32),
): IssuedWebhookSigningSecretV1 {
  if (bytes.byteLength !== 32) {
    throw new RangeError("Webhook signing secrets must contain 32 bytes");
  }
  const material = Buffer.from(bytes);
  const encoded = material.toString("base64");
  return {
    secret: `whsec_${encoded}`,
    fingerprintSha256: createHash("sha256").update(material).digest("hex"),
    hint: encoded.replace(/=+$/u, "").slice(-6),
  };
}
