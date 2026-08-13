import { z } from "zod";

export const deploymentMode = z.enum(["self_hosted", "managed"]);

export const entitlementCapabilityKey = z.enum([
  "core.balance_read",
  "core.refund",
  "core.reconciliation",
  "core.checkout_independence",
  "core.export",
  "core.promised_reward_redemption",
  "programme.v2",
  "rewards.expanded",
  "vip.advanced",
  "referrals",
  "campaigns",
  "notifications",
  "storefront.experience",
  "analytics",
  "ecosystem.api",
  "migration",
  "enterprise.identity",
  "managed.billing",
]);

export const entitlementSource = z.enum([
  "protected_value_path",
  "tenant_override",
  "percentage_rollout",
  "deployment_default",
]);

const exactNonNegativeInteger = z
  .string()
  .regex(/^(?:0|[1-9][0-9]*)$/u)
  .refine((value) => BigInt(value) <= 9_223_372_036_854_775_807n, {
    message: "limit exceeds PostgreSQL bigint",
  });

export const entitlementReadV1 = z
  .object({
    schemaVersion: z.literal("1"),
    organizationId: z.uuid(),
    deploymentMode,
    catalogueVersion: z.number().int().positive(),
    capabilityKey: entitlementCapabilityKey,
    enabled: z.boolean(),
    protectedValuePath: z.boolean(),
    limitValue: exactNonNegativeInteger.nullable(),
    rolloutBasisPoints: z.number().int().min(0).max(10_000),
    source: entitlementSource,
    effectiveFrom: z.iso.datetime({ offset: true }),
    effectiveUntil: z.iso.datetime({ offset: true }).nullable(),
  })
  .superRefine((value, context) => {
    if (value.protectedValuePath && !value.enabled) {
      context.addIssue({
        code: "custom",
        path: ["enabled"],
        message: "protected value paths must remain enabled",
      });
    }
    if (
      value.effectiveUntil !== null &&
      Date.parse(value.effectiveUntil) <= Date.parse(value.effectiveFrom)
    ) {
      context.addIssue({
        code: "custom",
        path: ["effectiveUntil"],
        message: "effectiveUntil must be after effectiveFrom",
      });
    }
  });

export const entitlementSnapshotV1 = z.object({
  schemaVersion: z.literal("1"),
  organizationId: z.uuid(),
  deploymentMode,
  catalogueVersion: z.number().int().positive(),
  capabilities: z.array(entitlementReadV1).max(64),
});

export type DeploymentMode = z.infer<typeof deploymentMode>;
export type EntitlementCapabilityKey = z.infer<typeof entitlementCapabilityKey>;
export type EntitlementReadV1 = z.infer<typeof entitlementReadV1>;
export type EntitlementSnapshotV1 = z.infer<typeof entitlementSnapshotV1>;
