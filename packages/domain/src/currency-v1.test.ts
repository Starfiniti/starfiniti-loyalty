import { describe, expect, it } from "vitest";
import type { CurrencyConversionContextV1 } from "@starfiniti/contracts/currency";
import {
  convertCurrencyMinorAmountV1,
  convertCurrencyMinorBatchV1,
} from "./currency-v1";

function context(
  sourceMinorUnitDigits: number,
  baseMinorUnitDigits: number,
  rateNumerator: string,
  rateDenominator: string,
): CurrencyConversionContextV1 {
  return {
    version: "1",
    policy: {
      version: "1",
      policyVersionId: "94000000-0000-4000-8000-000000000001",
      revision: 1,
      programmeVersionId: "94000000-0000-4000-8000-000000000002",
      state: "enabled",
      providerKey: "verified-test-feed",
      sourceCurrencyCode: "USD",
      sourceMinorUnitDigits,
      baseCurrencyCode: "EUR",
      baseMinorUnitDigits,
      maxRateAgeSeconds: 86_400,
      roundingMode: "half_away_from_zero",
      effectiveFrom: "2026-08-25T00:00:00.000Z",
    },
    snapshot: {
      version: "1",
      rateSnapshotId: "94000000-0000-4000-8000-000000000003",
      providerKey: "verified-test-feed",
      providerRateReference: "fixture-rate",
      sourceCurrencyCode: "USD",
      sourceMinorUnitDigits,
      baseCurrencyCode: "EUR",
      baseMinorUnitDigits,
      rateNumerator,
      rateDenominator,
      observedAt: "2026-08-26T08:00:00.000Z",
      validFrom: "2026-08-26T08:00:00.000Z",
      validUntil: "2026-08-27T08:00:00.000Z",
      payloadSha256: "b".repeat(64),
    },
  };
}

describe("exact currency conversion", () => {
  it("converts exact two-decimal values without floating point", () => {
    expect(
      convertCurrencyMinorAmountV1({
        amountKey: "line:1:gross",
        sourceAmountMinor: "12345",
        context: context(2, 2, "85", "100"),
      }),
    ).toMatchObject({
      sourceAmountMinor: "12345",
      baseAmountMinor: "10493",
      exactNumerator: "104932500",
      exactDenominator: "10000",
      roundingDeltaNumerator: "-2500",
    });
  });

  it("rounds exact ties away from zero", () => {
    expect(
      convertCurrencyMinorAmountV1({
        amountKey: "line:1:paid",
        sourceAmountMinor: "1",
        context: context(0, 0, "1", "2"),
      }).baseAmountMinor,
    ).toBe("1");
  });

  it("supports zero, three, and six decimal precision", () => {
    const cases = [
      [0, 3, "2", "1", "7", "14000"],
      [3, 0, "1", "2", "1000", "1"],
      [6, 6, "3", "2", "900719925474", "1351079888211"],
    ] as const;
    for (const [
      sourceDigits,
      baseDigits,
      numerator,
      denominator,
      amount,
      expected,
    ] of cases) {
      expect(
        convertCurrencyMinorAmountV1({
          amountKey: "order:amount",
          sourceAmountMinor: amount,
          context: context(sourceDigits, baseDigits, numerator, denominator),
        }).baseAmountMinor,
      ).toBe(expected);
    }
  });

  it("preserves monotonicity across a deterministic property sample", () => {
    const conversionContext = context(2, 3, "137", "113");
    let previous = -1n;
    for (let source = 0n; source <= 10_000n; source += 37n) {
      const converted = BigInt(
        convertCurrencyMinorAmountV1({
          amountKey: "sample:amount",
          sourceAmountMinor: source.toString(),
          context: conversionContext,
        }).baseAmountMinor,
      );
      expect(converted).toBeGreaterThanOrEqual(previous);
      previous = converted;
    }
  });

  it("rejects duplicate keys, invalid ratios, and bigint overflow", () => {
    expect(() =>
      convertCurrencyMinorBatchV1({
        context: context(2, 2, "1", "1"),
        amounts: [
          { amountKey: "line:1:gross", sourceAmountMinor: "1" },
          { amountKey: "line:1:gross", sourceAmountMinor: "2" },
        ],
      }),
    ).toThrow(/Duplicate/u);
    expect(() =>
      convertCurrencyMinorAmountV1({
        amountKey: "line:1:gross",
        sourceAmountMinor: "1",
        context: context(2, 2, "0", "1"),
      }),
    ).toThrow(/positive/u);
    expect(() =>
      convertCurrencyMinorAmountV1({
        amountKey: "line:1:gross",
        sourceAmountMinor: "9223372036854775807",
        context: context(0, 6, "999999999", "1"),
      }),
    ).toThrow(/Converted amount/u);
  });
});
