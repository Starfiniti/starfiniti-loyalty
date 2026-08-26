import { z } from "zod";

const currencyCode = z.string().regex(/^[A-Z]{3}$/u);
const minorUnitDigits = z.number().int().min(0).max(6);
const nonNegativeInteger = z.string().regex(/^(?:0|[1-9][0-9]{0,18})$/u);
const positiveRatioInteger = z.string().regex(/^[1-9][0-9]{0,99}$/u);
const signedRatioInteger = z.string().regex(/^-?(?:0|[1-9][0-9]{0,99})$/u);
const providerKey = z.string().regex(/^[a-z][a-z0-9_.-]{0,79}$/u);

export const currencyRoundingModeV1 = z.literal("half_away_from_zero");

export const currencyConversionPolicyV1 = z
  .object({
    version: z.literal("1"),
    policyVersionId: z.uuid(),
    revision: z.number().int().positive(),
    programmeVersionId: z.uuid(),
    state: z.enum(["enabled", "disabled"]),
    providerKey,
    sourceCurrencyCode: currencyCode,
    sourceMinorUnitDigits: minorUnitDigits,
    baseCurrencyCode: currencyCode,
    baseMinorUnitDigits: minorUnitDigits,
    maxRateAgeSeconds: z.number().int().min(60).max(604_800),
    roundingMode: currencyRoundingModeV1,
    effectiveFrom: z.iso.datetime({ offset: true }),
  })
  .strict()
  .superRefine((policy, context) => {
    if (policy.sourceCurrencyCode === policy.baseCurrencyCode) {
      context.addIssue({
        code: "custom",
        path: ["sourceCurrencyCode"],
        message: "Conversion policy source must differ from its base currency",
      });
    }
  });

export const currencyRateSnapshotV1 = z
  .object({
    version: z.literal("1"),
    rateSnapshotId: z.uuid(),
    providerKey,
    providerRateReference: z.string().trim().min(1).max(255),
    sourceCurrencyCode: currencyCode,
    sourceMinorUnitDigits: minorUnitDigits,
    baseCurrencyCode: currencyCode,
    baseMinorUnitDigits: minorUnitDigits,
    rateNumerator: positiveRatioInteger,
    rateDenominator: positiveRatioInteger,
    observedAt: z.iso.datetime({ offset: true }),
    validFrom: z.iso.datetime({ offset: true }),
    validUntil: z.iso.datetime({ offset: true }),
    payloadSha256: z.string().regex(/^[a-f0-9]{64}$/u),
  })
  .strict()
  .superRefine((snapshot, context) => {
    const observedAt = Date.parse(snapshot.observedAt);
    const validFrom = Date.parse(snapshot.validFrom);
    const validUntil = Date.parse(snapshot.validUntil);
    if (observedAt > validFrom) {
      context.addIssue({
        code: "custom",
        path: ["observedAt"],
        message: "Rate observation cannot follow the start of its validity",
      });
    }
    if (validFrom >= validUntil) {
      context.addIssue({
        code: "custom",
        path: ["validUntil"],
        message: "Rate validity must be a non-empty half-open interval",
      });
    }
  });

export const currencyConversionContextV1 = z
  .object({
    version: z.literal("1"),
    policy: currencyConversionPolicyV1,
    snapshot: currencyRateSnapshotV1,
  })
  .strict()
  .superRefine((value, context) => {
    const policy = value.policy;
    const snapshot = value.snapshot;
    const matchingFields = [
      "providerKey",
      "sourceCurrencyCode",
      "sourceMinorUnitDigits",
      "baseCurrencyCode",
      "baseMinorUnitDigits",
    ] as const;
    for (const field of matchingFields) {
      if (policy[field] !== snapshot[field]) {
        context.addIssue({
          code: "custom",
          path: ["snapshot", field],
          message: `Rate snapshot ${field} must match the policy`,
        });
      }
    }
  });

export const currencyConversionAmountV1 = z
  .object({
    amountKey: z.string().regex(/^[a-z][a-z0-9:._-]{0,254}$/u),
    sourceAmountMinor: nonNegativeInteger,
    baseAmountMinor: nonNegativeInteger,
    exactNumerator: positiveRatioInteger.or(z.literal("0")),
    exactDenominator: positiveRatioInteger,
    roundingDeltaNumerator: signedRatioInteger,
  })
  .strict();

export const currencyConversionBatchV1 = z
  .object({
    version: z.literal("1"),
    context: currencyConversionContextV1,
    amounts: z.array(currencyConversionAmountV1).min(1).max(500),
  })
  .strict()
  .superRefine((batch, context) => {
    const keys = batch.amounts.map((amount) => amount.amountKey);
    if (new Set(keys).size !== keys.length) {
      context.addIssue({
        code: "custom",
        path: ["amounts"],
        message: "Currency conversion amount keys must be unique",
      });
    }
  });

export const currencyConversionEvidenceSummaryV1 = z
  .object({
    version: z.literal("1"),
    evidenceId: z.uuid(),
    policyVersionId: z.uuid(),
    rateSnapshotId: z.uuid(),
    providerKey,
    providerRateReference: z.string().trim().min(1).max(255),
    sourceCurrencyCode: currencyCode,
    sourceMinorUnitDigits: minorUnitDigits,
    baseCurrencyCode: currencyCode,
    baseMinorUnitDigits: minorUnitDigits,
    rateNumerator: positiveRatioInteger,
    rateDenominator: positiveRatioInteger,
    observedAt: z.iso.datetime({ offset: true }),
    roundingMode: currencyRoundingModeV1,
  })
  .strict();

export const programmeCurrencyPoliciesV1 = z
  .object({
    version: z.literal("1"),
    programmeVersionId: z.uuid(),
    policies: z.array(currencyConversionPolicyV1).max(180),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.policies.some(
        (policy) => policy.programmeVersionId !== value.programmeVersionId,
      )
    ) {
      context.addIssue({
        code: "custom",
        path: ["policies"],
        message: "Every currency policy must belong to the requested version",
      });
    }
    const sourceCurrencies = value.policies.map(
      (policy) => policy.sourceCurrencyCode,
    );
    if (new Set(sourceCurrencies).size !== sourceCurrencies.length) {
      context.addIssue({
        code: "custom",
        path: ["policies"],
        message: "Current currency policies must have unique source currencies",
      });
    }
  });

export const configureProgrammeCurrencyPolicyCommandV1 = z
  .object({
    version: z.literal("1"),
    programmeVersionId: z.uuid(),
    sourceCurrencyCode: currencyCode,
    sourceMinorUnitDigits: minorUnitDigits,
    providerKey,
    maxRateAgeSeconds: z.number().int().min(60).max(604_800),
    state: z.enum(["enabled", "disabled"]),
    expectedRevision: z.number().int().nonnegative(),
    idempotencyKey: z.string().trim().min(1).max(255),
    correlationId: z.uuid(),
  })
  .strict();

export const configureProgrammeCurrencyPolicyResultV1 = z
  .object({
    resourceId: z.uuid(),
    outcome: z.enum(["created", "duplicate"]),
    revision: z.number().int().positive(),
    state: z.enum(["enabled", "disabled"]),
  })
  .strict();

export type CurrencyRoundingModeV1 = z.infer<typeof currencyRoundingModeV1>;
export type CurrencyConversionPolicyV1 = z.infer<
  typeof currencyConversionPolicyV1
>;
export type CurrencyRateSnapshotV1 = z.infer<typeof currencyRateSnapshotV1>;
export type CurrencyConversionContextV1 = z.infer<
  typeof currencyConversionContextV1
>;
export type CurrencyConversionAmountV1 = z.infer<
  typeof currencyConversionAmountV1
>;
export type CurrencyConversionBatchV1 = z.infer<
  typeof currencyConversionBatchV1
>;
export type CurrencyConversionEvidenceSummaryV1 = z.infer<
  typeof currencyConversionEvidenceSummaryV1
>;
export type ProgrammeCurrencyPoliciesV1 = z.infer<
  typeof programmeCurrencyPoliciesV1
>;
export type ConfigureProgrammeCurrencyPolicyCommandV1 = z.infer<
  typeof configureProgrammeCurrencyPolicyCommandV1
>;
export type ConfigureProgrammeCurrencyPolicyResultV1 = z.infer<
  typeof configureProgrammeCurrencyPolicyResultV1
>;
