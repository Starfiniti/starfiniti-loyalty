import { describe, expect, it } from "vitest";
import { hasEntitlement, parseEntitlementSnapshot } from "./entitlements";

const organizationId = "82000000-0000-4000-8000-000000000100";
const row = {
  schema_version: "1",
  organization_public_id: organizationId,
  deployment_mode: "managed",
  catalogue_version: 1,
  capability_key: "programme.v2",
  enabled: true,
  protected_value_path: false,
  limit_value: "9007199254740993",
  rollout_basis_points: 10_000,
  source: "tenant_override",
  effective_from: "2026-08-14T00:00:00+00:00",
  effective_until: null,
} as const;

describe("server-authoritative entitlement snapshots", () => {
  it("parses exact limits and provides fail-closed capability lookup", () => {
    const snapshot = parseEntitlementSnapshot([row], organizationId);
    expect(snapshot.capabilities[0]?.limitValue).toBe("9007199254740993");
    expect(hasEntitlement(snapshot, "programme.v2")).toBe(true);
    expect(hasEntitlement(snapshot, "campaigns")).toBe(false);
  });

  it("rejects empty, cross-tenant, inconsistent, and duplicate snapshots", () => {
    expect(() => parseEntitlementSnapshot([], organizationId)).toThrow(
      "entitlement_snapshot_empty",
    );
    expect(() =>
      parseEntitlementSnapshot(
        [
          {
            ...row,
            organization_public_id: "83000000-0000-4000-8000-000000000100",
          },
        ],
        organizationId,
      ),
    ).toThrow("entitlement_snapshot_inconsistent");
    expect(() =>
      parseEntitlementSnapshot(
        [row, { ...row, deployment_mode: "self_hosted" }],
        organizationId,
      ),
    ).toThrow("entitlement_snapshot_inconsistent");
    expect(() => parseEntitlementSnapshot([row, row], organizationId)).toThrow(
      "entitlement_snapshot_inconsistent",
    );
  });

  it("rejects browser-like malformed authority fields", () => {
    expect(() =>
      parseEntitlementSnapshot(
        [{ ...row, enabled: "true", rollout_basis_points: 10_001 }],
        organizationId,
      ),
    ).toThrow();
  });
});
