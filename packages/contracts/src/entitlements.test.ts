import { describe, expect, it } from "vitest";
import { entitlementReadV1, entitlementSnapshotV1 } from "./entitlements";

const protectedRead = {
  schemaVersion: "1",
  organizationId: "11111111-1111-4111-8111-111111111111",
  deploymentMode: "self_hosted",
  catalogueVersion: 1,
  capabilityKey: "core.balance_read",
  enabled: true,
  protectedValuePath: true,
  limitValue: null,
  rolloutBasisPoints: 10_000,
  source: "protected_value_path",
  effectiveFrom: "2026-08-13T00:00:00.000Z",
  effectiveUntil: null,
} as const;

describe("entitlement contracts", () => {
  it("accepts exact bigint limits without converting them to JavaScript numbers", () => {
    const parsed = entitlementReadV1.parse({
      ...protectedRead,
      capabilityKey: "analytics",
      protectedValuePath: false,
      limitValue: "9007199254740993",
      source: "deployment_default",
    });
    expect(parsed.limitValue).toBe("9007199254740993");
  });

  it("rejects a disabled protected value path", () => {
    expect(() =>
      entitlementReadV1.parse({ ...protectedRead, enabled: false }),
    ).toThrow(/protected value paths/u);
  });

  it("rejects negative, fractional, unsafe, or numeric limits", () => {
    for (const limitValue of ["-1", "1.5", "9223372036854775808", 12]) {
      expect(() =>
        entitlementReadV1.parse({
          ...protectedRead,
          capabilityKey: "analytics",
          protectedValuePath: false,
          limitValue,
          source: "deployment_default",
        }),
      ).toThrow();
    }
  });

  it("rejects inverted effective periods", () => {
    expect(() =>
      entitlementReadV1.parse({
        ...protectedRead,
        effectiveUntil: "2026-08-12T00:00:00.000Z",
      }),
    ).toThrow(/effectiveUntil/u);
  });

  it("bounds a versioned tenant snapshot", () => {
    expect(
      entitlementSnapshotV1.parse({
        schemaVersion: "1",
        organizationId: protectedRead.organizationId,
        deploymentMode: "self_hosted",
        catalogueVersion: 1,
        capabilities: [protectedRead],
      }).capabilities,
    ).toHaveLength(1);
  });
});
