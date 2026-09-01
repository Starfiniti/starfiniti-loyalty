import { describe, expect, it } from "vitest";
import {
  canonicalizeMigrationApplicationV1,
  fingerprintMigrationIdentityV1,
  previewMigrationDryRunV1,
} from "./migration-v1";

const sha256 = (value: string): string => {
  const words = Array.from({ length: 8 }, (_, index) => {
    let state = 2_166_136_261 ^ index;
    for (const character of value) {
      state ^= character.codePointAt(0) ?? 0;
      state = Math.imul(state, 16_777_619);
    }
    return (state >>> 0).toString(16).padStart(8, "0");
  });
  return words.join("");
};

const document = {
  schemaVersion: "1" as const,
  source: {
    system: "woorewards" as const,
    exportId: "export-2026-08-26",
    exportSha256: "a".repeat(64),
    exportedAt: "2026-08-26T08:00:00Z",
  },
  programmeGroupId: "bf2247d8-893e-49ae-8363-8423928e9cc1",
  programmeVersionId: "bf2247d8-893e-49ae-8363-8423928e9cc2",
  expiryPolicy: {
    mode: "apply_default" as const,
    expiresAt: "2027-08-26T08:00:00Z",
  },
  rows: [
    {
      sourceRowId: "row-1",
      identity: { kind: "email" as const, value: "one@example.test" },
      balance: { availablePoints: "100", pendingPoints: "0", lots: [] },
      tier: null,
      referral: null,
      sourceHistory: [],
    },
    {
      sourceRowId: "row-2",
      identity: {
        kind: "woocommerce_customer_id" as const,
        value: "42",
      },
      balance: { availablePoints: "250", pendingPoints: "0", lots: [] },
      tier: { sourceTierCode: "gold", qualifiedAt: null },
      referral: null,
      sourceHistory: [],
    },
  ],
};

const resolutions = document.rows.map((row, index) => ({
  sourceRowId: row.sourceRowId,
  identitySha256: fingerprintMigrationIdentityV1(row.identity, sha256),
  outcome: "matched_existing" as const,
  basis:
    row.identity.kind === "woocommerce_customer_id"
      ? ("verified_woocommerce_id" as const)
      : ("explicit_customer" as const),
  targetCustomerId:
    index === 0
      ? "bf2247d8-893e-49ae-8363-8423928e9cc3"
      : "bf2247d8-893e-49ae-8363-8423928e9cc4",
}));

describe("canonical migration dry run", () => {
  it("emits stable exact application documents after input reordering", () => {
    expect(
      canonicalizeMigrationApplicationV1({
        document: { ...document, rows: [...document.rows].reverse() },
        resolutions: [...resolutions].reverse(),
      }),
    ).toEqual(canonicalizeMigrationApplicationV1({ document, resolutions }));
  });

  it("produces a deterministic, fully reconciled approval fingerprint", () => {
    const first = previewMigrationDryRunV1({ document, resolutions }, sha256);
    const reordered = previewMigrationDryRunV1(
      {
        document: { ...document, rows: [...document.rows].reverse() },
        resolutions: [...resolutions].reverse(),
      },
      sha256,
    );

    expect(first).toEqual(reordered);
    expect(first).toMatchObject({
      status: "valid",
      rowCount: 2,
      matchedCount: 2,
      createCount: 0,
      unresolvedCount: 0,
      availablePoints: "350",
      pendingPoints: "0",
      issueCounts: {},
      issues: [],
    });
  });

  it("invalidates changed identity evidence and never returns the raw identity", () => {
    const result = previewMigrationDryRunV1(
      {
        document,
        resolutions: [
          { ...resolutions[0]!, identitySha256: "f".repeat(64) },
          resolutions[1]!,
        ],
      },
      sha256,
    );

    expect(result.status).toBe("invalid");
    expect(result.issueCounts).toEqual({ identity_fingerprint_mismatch: 1 });
    expect(JSON.stringify(result)).not.toContain("one@example.test");
  });

  it("fails closed for unresolved and ambiguous identities", () => {
    const result = previewMigrationDryRunV1(
      {
        document,
        resolutions: [
          {
            ...resolutions[0]!,
            outcome: "unresolved",
            basis: null,
            targetCustomerId: null,
          },
          {
            ...resolutions[1]!,
            outcome: "ambiguous",
            basis: null,
            targetCustomerId: null,
          },
        ],
      },
      sha256,
    );

    expect(result).toMatchObject({
      status: "invalid",
      matchedCount: 0,
      unresolvedCount: 2,
      issueCounts: { unresolved_identity: 1, ambiguous_identity: 1 },
    });
  });

  it("rejects duplicate source identities and duplicate target customers", () => {
    const firstRow = document.rows[0]!;
    const secondRow = document.rows[1]!;
    const duplicatedDocument = {
      ...document,
      rows: [
        firstRow,
        {
          ...secondRow,
          identity: firstRow.identity,
        },
      ],
    };
    const duplicateResolutions = duplicatedDocument.rows.map((row) => ({
      sourceRowId: row.sourceRowId,
      identitySha256: fingerprintMigrationIdentityV1(row.identity, sha256),
      outcome: "matched_existing" as const,
      basis: "explicit_customer" as const,
      targetCustomerId: "bf2247d8-893e-49ae-8363-8423928e9cc3",
    }));
    const result = previewMigrationDryRunV1(
      { document: duplicatedDocument, resolutions: duplicateResolutions },
      sha256,
    );

    expect(result.status).toBe("invalid");
    expect(result.issueCounts).toEqual({
      duplicate_source_identity: 2,
      duplicate_target_customer: 2,
    });
  });

  it("binds the approval digest to balance and mapping changes", () => {
    const baseline = previewMigrationDryRunV1(
      { document, resolutions },
      sha256,
    );
    const changedBalance = previewMigrationDryRunV1(
      {
        document: {
          ...document,
          rows: [
            {
              ...document.rows[0]!,
              balance: {
                ...document.rows[0]!.balance,
                availablePoints: "101",
              },
            },
            document.rows[1]!,
          ],
        },
        resolutions,
      },
      sha256,
    );
    const changedTarget = previewMigrationDryRunV1(
      {
        document,
        resolutions: [
          {
            ...resolutions[0]!,
            targetCustomerId: "bf2247d8-893e-49ae-8363-8423928e9cc5",
          },
          resolutions[1]!,
        ],
      },
      sha256,
    );

    expect(changedBalance.engineSha256).not.toBe(baseline.engineSha256);
    expect(changedTarget.engineSha256).not.toBe(baseline.engineSha256);
  });

  it("rejects a non-cryptographic digest provider", () => {
    expect(() =>
      previewMigrationDryRunV1({ document, resolutions }, () => "bad"),
    ).toThrow("invalid digest");
  });
});
