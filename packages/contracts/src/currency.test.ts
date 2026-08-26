import { describe, expect, it } from "vitest";
import {
  configureProgrammeCurrencyPolicyCommandV1,
  currencyConversionBatchV1,
  currencyConversionContextV1,
  currencyRateSnapshotV1,
  programmeCurrencyPoliciesV1,
} from "./currency";

const policy = {
  version: "1" as const,
  policyVersionId: "93000000-0000-4000-8000-000000000001",
  revision: 1,
  programmeVersionId: "93000000-0000-4000-8000-000000000002",
  state: "enabled" as const,
  providerKey: "verified-test-feed",
  sourceCurrencyCode: "USD",
  sourceMinorUnitDigits: 2,
  baseCurrencyCode: "EUR",
  baseMinorUnitDigits: 2,
  maxRateAgeSeconds: 86_400,
  roundingMode: "half_away_from_zero" as const,
  effectiveFrom: "2026-08-25T00:00:00.000Z",
};

const snapshot = {
  version: "1" as const,
  rateSnapshotId: "93000000-0000-4000-8000-000000000003",
  providerKey: "verified-test-feed",
  providerRateReference: "rate-2026-08-26-usd-eur",
  sourceCurrencyCode: "USD",
  sourceMinorUnitDigits: 2,
  baseCurrencyCode: "EUR",
  baseMinorUnitDigits: 2,
  rateNumerator: "85",
  rateDenominator: "100",
  observedAt: "2026-08-26T08:00:00.000Z",
  validFrom: "2026-08-26T08:00:00.000Z",
  validUntil: "2026-08-27T08:00:00.000Z",
  payloadSha256: "a".repeat(64),
};

describe("currency conversion contracts", () => {
  it("accepts an exact policy-bound provider snapshot", () => {
    expect(
      currencyConversionContextV1.parse({
        version: "1",
        policy,
        snapshot,
      }).snapshot.rateNumerator,
    ).toBe("85");
  });

  it("rejects look-ahead validity, direction drift, and provider drift", () => {
    expect(
      currencyRateSnapshotV1.safeParse({
        ...snapshot,
        observedAt: "2026-08-26T09:00:00.000Z",
      }).success,
    ).toBe(false);
    expect(
      currencyConversionContextV1.safeParse({
        version: "1",
        policy,
        snapshot: { ...snapshot, sourceCurrencyCode: "GBP" },
      }).success,
    ).toBe(false);
    expect(
      currencyConversionContextV1.safeParse({
        version: "1",
        policy,
        snapshot: { ...snapshot, providerKey: "other-feed" },
      }).success,
    ).toBe(false);
  });

  it("requires unique bounded atomic amount evidence", () => {
    const amount = {
      amountKey: "line:1:gross",
      sourceAmountMinor: "100",
      baseAmountMinor: "85",
      exactNumerator: "850000",
      exactDenominator: "10000",
      roundingDeltaNumerator: "0",
    };
    expect(
      currencyConversionBatchV1.parse({
        version: "1",
        context: { version: "1", policy, snapshot },
        amounts: [amount],
      }).amounts,
    ).toHaveLength(1);
    expect(
      currencyConversionBatchV1.safeParse({
        version: "1",
        context: { version: "1", policy, snapshot },
        amounts: [amount, amount],
      }).success,
    ).toBe(false);
  });

  it("accepts bounded merchant policy commands without tenant authority", () => {
    expect(
      configureProgrammeCurrencyPolicyCommandV1.parse({
        version: "1",
        programmeVersionId: policy.programmeVersionId,
        sourceCurrencyCode: "USD",
        sourceMinorUnitDigits: 2,
        providerKey: "approved-provider",
        maxRateAgeSeconds: 86_400,
        state: "enabled",
        expectedRevision: 2,
        idempotencyKey: "currency-policy:configure:one",
        correlationId: "96000000-0000-4000-8000-000000000005",
      }),
    ).not.toHaveProperty("organizationId");
    expect(
      configureProgrammeCurrencyPolicyCommandV1.safeParse({
        version: "1",
        programmeVersionId: policy.programmeVersionId,
        sourceCurrencyCode: "usd",
        sourceMinorUnitDigits: 2,
        providerKey: "approved-provider",
        maxRateAgeSeconds: 86_400,
        state: "enabled",
        expectedRevision: 2,
        idempotencyKey: "currency-policy:configure:one",
        correlationId: "96000000-0000-4000-8000-000000000005",
      }).success,
    ).toBe(false);
  });

  it("fails closed on duplicate or cross-version current policies", () => {
    expect(
      programmeCurrencyPoliciesV1.parse({
        version: "1",
        programmeVersionId: policy.programmeVersionId,
        policies: [policy],
      }).policies,
    ).toHaveLength(1);
    expect(
      programmeCurrencyPoliciesV1.safeParse({
        version: "1",
        programmeVersionId: policy.programmeVersionId,
        policies: [policy, { ...policy, policyVersionId: crypto.randomUUID() }],
      }).success,
    ).toBe(false);
    expect(
      programmeCurrencyPoliciesV1.safeParse({
        version: "1",
        programmeVersionId: policy.programmeVersionId,
        policies: [{ ...policy, programmeVersionId: crypto.randomUUID() }],
      }).success,
    ).toBe(false);
  });
});
