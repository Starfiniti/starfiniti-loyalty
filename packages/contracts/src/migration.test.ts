import { describe, expect, it } from "vitest";
import {
  applyMigrationOpeningBalanceCommandV1,
  canonicalMigrationDocumentV1,
  compensateMigrationBatchCommandV1,
  migrationDryRunResultV1,
  migrationIdentityResolutionV1,
  recordMigrationDryRunCommandV1,
} from "./migration";

const baseDocument = {
  schemaVersion: "1" as const,
  source: {
    system: "wployalty" as const,
    exportId: "wployalty-export-2026-08-26",
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
      sourceRowId: "row-0001",
      identity: { kind: "email" as const, value: "member@example.test" },
      balance: { availablePoints: "250", pendingPoints: "0", lots: [] },
      tier: null,
      referral: { sourceReferralId: "ref-opaque-1", state: "active" as const },
      sourceHistory: [],
    },
  ],
};

describe("migration contracts", () => {
  it("accepts a bounded vendor-neutral document without caller tenant authority", () => {
    expect(canonicalMigrationDocumentV1.safeParse(baseDocument).success).toBe(
      true,
    );
    expect(
      canonicalMigrationDocumentV1.safeParse({
        ...baseDocument,
        organizationId: "bf2247d8-893e-49ae-8363-8423928e9cc9",
      }).success,
    ).toBe(false);
  });

  it("requires exact source lots to reconcile to both balance buckets", () => {
    const exact = {
      ...baseDocument,
      expiryPolicy: { mode: "preserve_exact" as const },
      rows: [
        {
          ...baseDocument.rows[0],
          balance: {
            availablePoints: "250",
            pendingPoints: "10",
            lots: [
              {
                sourceLotId: "available-1",
                bucket: "available" as const,
                points: "250",
                availableAt: "2026-06-01T08:00:00Z",
                expiresAt: "2027-06-01T08:00:00Z",
              },
              {
                sourceLotId: "pending-1",
                bucket: "pending" as const,
                points: "10",
                availableAt: "2026-09-01T08:00:00Z",
                expiresAt: "2027-09-01T08:00:00Z",
              },
            ],
          },
        },
      ],
    };
    expect(canonicalMigrationDocumentV1.safeParse(exact).success).toBe(true);
    expect(
      canonicalMigrationDocumentV1.safeParse({
        ...exact,
        rows: [
          {
            ...exact.rows[0]!,
            balance: { ...exact.rows[0]!.balance, availablePoints: "251" },
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("keeps row references opaque and requires pending availability evidence", () => {
    expect(
      canonicalMigrationDocumentV1.safeParse({
        ...baseDocument,
        rows: [
          {
            ...baseDocument.rows[0]!,
            sourceRowId: "member@example.test",
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      canonicalMigrationDocumentV1.safeParse({
        ...baseDocument,
        rows: [
          {
            ...baseDocument.rows[0]!,
            balance: {
              ...baseDocument.rows[0]!.balance,
              pendingPoints: "1",
            },
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("rejects a batch whose exact row values overflow the database total", () => {
    expect(
      canonicalMigrationDocumentV1.safeParse({
        ...baseDocument,
        rows: [
          {
            ...baseDocument.rows[0]!,
            sourceRowId: "row-0001",
            balance: {
              availablePoints: "9223372036854775807",
              pendingPoints: "0",
              lots: [],
            },
          },
          {
            ...baseDocument.rows[0]!,
            sourceRowId: "row-0002",
            balance: {
              availablePoints: "1",
              pendingPoints: "0",
              lots: [],
            },
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("does not allow email matching to become target authority", () => {
    const common = {
      sourceRowId: "row-0001",
      identitySha256: "b".repeat(64),
    };
    expect(
      migrationIdentityResolutionV1.safeParse({
        ...common,
        outcome: "matched_existing",
        basis: "explicit_customer",
        targetCustomerId: "bf2247d8-893e-49ae-8363-8423928e9cc3",
      }).success,
    ).toBe(true);
    expect(
      migrationIdentityResolutionV1.safeParse({
        ...common,
        outcome: "matched_existing",
        basis: "email_match",
        targetCustomerId: "bf2247d8-893e-49ae-8363-8423928e9cc3",
      }).success,
    ).toBe(false);
  });

  it("rejects an approval result whose counts or status do not reconcile", () => {
    const result = {
      schemaVersion: "1" as const,
      status: "valid" as const,
      sourceSystem: "wployalty" as const,
      sourceExportSha256: "a".repeat(64),
      canonicalDocumentSha256: "b".repeat(64),
      resolutionSha256: "c".repeat(64),
      engineSha256: "d".repeat(64),
      rowCount: 1,
      matchedCount: 1,
      createCount: 0,
      unresolvedCount: 0,
      availablePoints: "250",
      pendingPoints: "0",
      issueCounts: {},
      issues: [],
    };
    expect(migrationDryRunResultV1.safeParse(result).success).toBe(true);
    expect(
      migrationDryRunResultV1.safeParse({
        ...result,
        unresolvedCount: 1,
      }).success,
    ).toBe(false);
    expect(
      migrationDryRunResultV1.safeParse({
        ...result,
        status: "invalid",
      }).success,
    ).toBe(false);
    expect(
      migrationDryRunResultV1.safeParse({
        ...result,
        issueCounts: { ambiguous_identity: 1 },
      }).success,
    ).toBe(false);
  });

  it("binds persistence to public programme selectors and a strict result", () => {
    const command = {
      schemaVersion: "1" as const,
      programmeGroupId: baseDocument.programmeGroupId,
      programmeVersionId: baseDocument.programmeVersionId,
      result: {
        schemaVersion: "1" as const,
        status: "invalid" as const,
        sourceSystem: "wployalty" as const,
        sourceExportSha256: "a".repeat(64),
        canonicalDocumentSha256: "b".repeat(64),
        resolutionSha256: "c".repeat(64),
        engineSha256: "d".repeat(64),
        rowCount: 1,
        matchedCount: 0,
        createCount: 0,
        unresolvedCount: 1,
        availablePoints: "250",
        pendingPoints: "0",
        issueCounts: { unresolved_identity: 1 },
        issues: [
          { code: "unresolved_identity" as const, sourceRowId: "row-0001" },
        ],
      },
      idempotencyKey: "migration-dry-run-1",
      correlationId: "bf2247d8-893e-49ae-8363-8423928e9cc4",
    };
    expect(recordMigrationDryRunCommandV1.safeParse(command).success).toBe(
      true,
    );
    expect(
      recordMigrationDryRunCommandV1.safeParse({
        ...command,
        actorId: "forged-owner",
      }).success,
    ).toBe(false);
  });

  it("requires a complete approved resolution set before value application", () => {
    const common = {
      schemaVersion: "1" as const,
      dryRunId: "bf2247d8-893e-49ae-8363-8423928e9cc4",
      approvalSha256: "e".repeat(64),
      document: baseDocument,
      commerceConnectionId: null,
      idempotencyKey: "migration-application-1",
      correlationId: "bf2247d8-893e-49ae-8363-8423928e9cc5",
    };
    expect(
      applyMigrationOpeningBalanceCommandV1.safeParse({
        ...common,
        resolutions: [
          {
            sourceRowId: "row-0001",
            identitySha256: "b".repeat(64),
            outcome: "create_new",
            basis: "explicit_create",
            targetCustomerId: null,
          },
        ],
      }).success,
    ).toBe(true);
    expect(
      applyMigrationOpeningBalanceCommandV1.safeParse({
        ...common,
        resolutions: [
          {
            sourceRowId: "row-0001",
            identitySha256: "b".repeat(64),
            outcome: "unresolved",
            basis: null,
            targetCustomerId: null,
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("requires a store selector for verified WooCommerce authority", () => {
    expect(
      applyMigrationOpeningBalanceCommandV1.safeParse({
        schemaVersion: "1",
        dryRunId: "bf2247d8-893e-49ae-8363-8423928e9cc4",
        approvalSha256: "e".repeat(64),
        document: {
          ...baseDocument,
          rows: [
            {
              ...baseDocument.rows[0]!,
              identity: { kind: "woocommerce_customer_id", value: "42" },
            },
          ],
        },
        resolutions: [
          {
            sourceRowId: "row-0001",
            identitySha256: "b".repeat(64),
            outcome: "matched_existing",
            basis: "verified_woocommerce_id",
            targetCustomerId: "bf2247d8-893e-49ae-8363-8423928e9cc3",
          },
        ],
        commerceConnectionId: null,
        idempotencyKey: "migration-application-1",
        correlationId: "bf2247d8-893e-49ae-8363-8423928e9cc5",
      }).success,
    ).toBe(false);
  });

  it("keeps compensating corrections bounded and caller-authority free", () => {
    expect(
      compensateMigrationBatchCommandV1.safeParse({
        schemaVersion: "1",
        batchId: "bf2247d8-893e-49ae-8363-8423928e9cc4",
        reason: "Rollback approved migration canary",
        idempotencyKey: "migration-correction-1",
        correlationId: "bf2247d8-893e-49ae-8363-8423928e9cc5",
      }).success,
    ).toBe(true);
    expect(
      compensateMigrationBatchCommandV1.safeParse({
        schemaVersion: "1",
        batchId: "bf2247d8-893e-49ae-8363-8423928e9cc4",
        reason: "Rollback approved migration canary",
        idempotencyKey: "migration-correction-1",
        correlationId: "bf2247d8-893e-49ae-8363-8423928e9cc5",
        organizationId: "bf2247d8-893e-49ae-8363-8423928e9cc6",
      }).success,
    ).toBe(false);
  });
});
