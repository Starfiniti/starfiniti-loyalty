import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { merchantActivitySourceV1 } from "./activity";

const safeOpaqueReference = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .regex(/^[^\u0000-\u001f\u007f]+$/u);
const safeIdempotencyKey = z
  .string()
  .trim()
  .min(1)
  .max(255)
  .regex(/^[A-Za-z0-9._:-]+$/u);
const activityCode = z.string().regex(/^[a-z][a-z0-9_-]{0,79}$/u);
const resourceSelector = z.string().trim().min(1).max(255);
const credentialTokenPattern = /^sflt_v1_([0-9a-f]{32})_([A-Za-z0-9_-]{43})$/u;

export const serviceAccountScopeV1 = z.enum([
  "activities:write",
  "customers:write",
]);

export const createServiceAccountCommandV1 = z
  .object({
    version: z.literal("1"),
    workspaceId: z.uuid(),
    programmeId: z.uuid(),
    displayName: safeOpaqueReference,
    scopes: z
      .array(serviceAccountScopeV1)
      .min(1)
      .max(2)
      .refine((values) => new Set(values).size === values.length, {
        message: "Service-account scopes must be unique",
      }),
    requestsPerMinute: z.number().int().min(10).max(6_000),
    idempotencyKey: safeIdempotencyKey,
    correlationId: z.uuid(),
  })
  .strict();

export const issueServiceCredentialCommandV1 = z
  .object({
    version: z.literal("1"),
    serviceAccountId: z.uuid(),
    overlapSeconds: z.number().int().min(0).max(86_400),
    idempotencyKey: safeIdempotencyKey,
    correlationId: z.uuid(),
  })
  .strict();

export const revokeServiceCredentialCommandV1 = z
  .object({
    version: z.literal("1"),
    serviceAccountId: z.uuid(),
    credentialId: z.uuid(),
    reason: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .regex(/^[^\u0000-\u001f\u007f]+$/u),
    idempotencyKey: safeIdempotencyKey,
    correlationId: z.uuid(),
  })
  .strict();

export const serviceAccountCredentialReadV1 = z
  .object({
    id: z.uuid(),
    secretHint: z.string().regex(/^[A-Za-z0-9_-]{6}$/u),
    status: z.enum(["active", "retiring", "expired", "revoked"]),
    validUntil: z.iso.datetime({ offset: true }).nullable(),
    createdAt: z.iso.datetime({ offset: true }),
    revokedAt: z.iso.datetime({ offset: true }).nullable(),
  })
  .strict();

export const serviceAccountReadV1 = z
  .object({
    id: z.uuid(),
    workspaceId: z.uuid(),
    workspaceName: safeOpaqueReference,
    programmeId: z.uuid(),
    programmeName: safeOpaqueReference,
    displayName: safeOpaqueReference,
    scopes: z.array(serviceAccountScopeV1).min(1).max(2),
    requestsPerMinute: z.number().int().min(10).max(6_000),
    status: z.enum(["active", "revoked"]),
    createdAt: z.iso.datetime({ offset: true }),
    credentials: z.array(serviceAccountCredentialReadV1).max(100),
  })
  .strict();

export const serviceAccountsDocumentV1 = z
  .object({
    version: z.literal("1"),
    serviceAccounts: z.array(serviceAccountReadV1).max(100),
  })
  .strict();

export const serviceAccountMutationResultV1 = z
  .object({
    resourceId: z.uuid(),
    outcome: z.enum(["created", "duplicate"]),
  })
  .strict();

export const serviceCredentialMutationResultV1 = z
  .object({
    resourceId: z.uuid(),
    secretHint: z.string().regex(/^[A-Za-z0-9_-]{6}$/u),
    outcome: z.enum(["created", "duplicate"]),
    priorValidUntil: z.iso.datetime({ offset: true }).nullable(),
  })
  .strict();

export const serviceCustomerUpsertCommandV1 = z
  .object({
    version: z.literal("1"),
    externalCustomerId: safeOpaqueReference,
    idempotencyKey: safeIdempotencyKey,
    correlationId: z.uuid(),
  })
  .strict();

export const serviceActivityCommandV1 = z
  .object({
    version: z.literal("1"),
    externalCustomerId: safeOpaqueReference,
    eventId: safeIdempotencyKey,
    occurredAt: z.iso.datetime({ offset: true }),
    source: merchantActivitySourceV1,
    activityCode,
    productId: resourceSelector.nullable(),
    categoryIds: z.array(resourceSelector).max(100),
    idempotencyKey: safeIdempotencyKey,
    correlationId: z.uuid(),
  })
  .strict()
  .superRefine((payload, context) => {
    const canonicalCode =
      payload.source === "custom_activity" ? null : payload.source;
    if (canonicalCode !== null && payload.activityCode !== canonicalCode) {
      context.addIssue({
        code: "custom",
        message: "Built-in activity sources require their canonical code",
        path: ["activityCode"],
      });
    }
    if (
      payload.source === "verified_product_review" &&
      payload.productId === null
    ) {
      context.addIssue({
        code: "custom",
        message: "Verified product reviews require a product selector",
        path: ["productId"],
      });
    }
    if (
      payload.source !== "verified_product_review" &&
      (payload.productId !== null || payload.categoryIds.length > 0)
    ) {
      context.addIssue({
        code: "custom",
        message: "Only verified product reviews may include product selectors",
        path: ["productId"],
      });
    }
  });

export type ServiceAccountScopeV1 = z.infer<typeof serviceAccountScopeV1>;
export type CreateServiceAccountCommandV1 = z.infer<
  typeof createServiceAccountCommandV1
>;
export type IssueServiceCredentialCommandV1 = z.infer<
  typeof issueServiceCredentialCommandV1
>;
export type RevokeServiceCredentialCommandV1 = z.infer<
  typeof revokeServiceCredentialCommandV1
>;
export type ServiceCustomerUpsertCommandV1 = z.infer<
  typeof serviceCustomerUpsertCommandV1
>;
export type ServiceActivityCommandV1 = z.infer<typeof serviceActivityCommandV1>;
export type ServiceAccountReadV1 = z.infer<typeof serviceAccountReadV1>;
export type ServiceAccountsDocumentV1 = z.infer<
  typeof serviceAccountsDocumentV1
>;

export type ParsedServiceCredential = Readonly<{
  credentialId: string;
  tokenSha256: string;
  hint: string;
}>;

export function issueServiceCredentialToken(
  credentialId: string,
  secret: Uint8Array = randomBytes(32),
): Readonly<{ token: string; tokenSha256: string; hint: string }> {
  const parsedId = z.uuid().parse(credentialId).replaceAll("-", "");
  if (secret.byteLength !== 32) {
    throw new RangeError("Service credential secrets must contain 32 bytes");
  }
  const encodedSecret = Buffer.from(secret).toString("base64url");
  const token = `sflt_v1_${parsedId}_${encodedSecret}`;
  return {
    token,
    tokenSha256: sha256(token),
    hint: encodedSecret.slice(-6),
  };
}

export function parseServiceBearerAuthorization(
  authorization: string | null,
): ParsedServiceCredential | null {
  if (authorization === null || !authorization.startsWith("Bearer ")) {
    return null;
  }
  const token = authorization.slice(7);
  const match = credentialTokenPattern.exec(token);
  if (!match) return null;
  const compactId = match[1]!;
  const credentialId = [
    compactId.slice(0, 8),
    compactId.slice(8, 12),
    compactId.slice(12, 16),
    compactId.slice(16, 20),
    compactId.slice(20),
  ].join("-");
  if (!z.uuid().safeParse(credentialId).success) return null;
  return {
    credentialId,
    tokenSha256: sha256(token),
    hint: match[2]!.slice(-6),
  };
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
