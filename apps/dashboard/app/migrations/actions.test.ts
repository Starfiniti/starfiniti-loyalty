import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  revalidatePath: vi.fn(),
  state: {
    membershipRole: "owner",
    migrationEnabled: true,
  },
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    schema: () => ({ rpc: mocks.rpc }),
  }),
}));
vi.mock("@/lib/server/tenant-context", () => ({
  getAuthenticatedTenantState: async () => ({
    kind: "ready",
    context: {
      organization: {
        id: 1,
        public_id: "bf2247d8-893e-49ae-8363-8423928e9cc1",
        name: "Test",
        slug: "test",
        status: "active",
      },
      membershipRole: mocks.state.membershipRole,
      workspace: null,
      programmeGroup: {
        id: 2,
        public_id: "bf2247d8-893e-49ae-8363-8423928e9cc2",
        organization_id: 1,
        name: "Rewards",
        slug: "rewards",
        status: "active",
      },
      availableOrganizations: [],
    },
  }),
}));
vi.mock("@/lib/server/entitlements", () => ({
  getEntitlementSnapshot: async () => ({
    schemaVersion: "1",
    organizationId: "bf2247d8-893e-49ae-8363-8423928e9cc1",
    deploymentMode: "self_hosted",
    catalogueVersion: 1,
    capabilities: [
      {
        schemaVersion: "1",
        organizationId: "bf2247d8-893e-49ae-8363-8423928e9cc1",
        deploymentMode: "self_hosted",
        catalogueVersion: 1,
        capabilityKey: "migration",
        enabled: mocks.state.migrationEnabled,
        protectedValuePath: false,
        limitValue: null,
        rolloutBasisPoints: 10000,
        source: "local_control",
        effectiveFrom: "2026-08-26T00:00:00Z",
        effectiveUntil: null,
      },
    ],
  }),
}));
vi.mock("@/lib/server/programme", () => ({
  getMerchantProgrammeState: async () => ({
    programme: { id: "bf2247d8-893e-49ae-8363-8423928e9cc3" },
    audit: [],
    versions: [
      {
        id: "bf2247d8-893e-49ae-8363-8423928e9cc4",
        status: "published",
      },
    ],
  }),
}));

import {
  applyMigrationOpeningBalance,
  compensateMigrationBatch,
  inspectMigrationSource,
  recordMigrationDryRun,
} from "./actions";

const csv = "email,points\nmember@example.test,250\n";

function sourceForm(): FormData {
  const form = new FormData();
  form.set(
    "sourceFile",
    new File([csv], "wployalty.csv", { type: "text/csv" }),
  );
  form.set("sourceSystem", "wployalty");
  form.set("exportId", "wployalty-export-1");
  form.set("exportedAt", "2026-08-26T08:00:00.000Z");
  form.set("expiryMode", "apply_default");
  form.set("expiresAt", "2027-08-26T08:00:00.000Z");
  return form;
}

describe("migration merchant actions", () => {
  beforeEach(() => {
    mocks.rpc.mockReset();
    mocks.revalidatePath.mockReset();
    mocks.state.membershipRole = "owner";
    mocks.state.migrationEnabled = true;
  });

  it("inspects a strict source transiently without a database write", async () => {
    const result = await inspectMigrationSource(sourceForm());
    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") return;
    expect(result.inspection).toMatchObject({
      sourceSystem: "wployalty",
      adapterId: "wployalty_csv_v1",
      rowCount: 1,
      availablePoints: "250",
      pendingPoints: "0",
    });
    expect(result.inspection.rows[0]?.identity).toEqual({
      kind: "email",
      value: "member@example.test",
    });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("returns fixed parser issues and never records an invalid source shape", async () => {
    const form = sourceForm();
    form.set(
      "sourceFile",
      new File(["email,points\nmember@example.test,=250\n"], "unsafe.csv"),
    );
    const result = await inspectMigrationSource(form);
    expect(result).toMatchObject({
      kind: "invalid",
      issueCount: 2,
      issues: [
        { rowNumber: 2, code: "formula_like_value", field: "points" },
        { rowNumber: 2, code: "invalid_points", field: "points" },
      ],
    });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("records and applies one exact re-presented source without browser value authority", async () => {
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "record_migration_dry_run_v1") {
        return {
          data: [
            {
              dry_run_public_id: "bf2247d8-893e-49ae-8363-8423928e9cc5",
              outcome: "created",
              dry_run_status: "valid",
              approval_sha256: "e".repeat(64),
            },
          ],
          error: null,
        };
      }
      if (name === "apply_migration_opening_balance_v1") {
        return {
          data: [
            {
              batch_public_id: "bf2247d8-893e-49ae-8363-8423928e9cc6",
              outcome: "created",
              customer_count: 1,
              created_customer_count: 1,
              available_points: "250",
              pending_points: "0",
            },
          ],
          error: null,
        };
      }
      return { data: null, error: { code: "unexpected" } };
    });
    const inspected = await inspectMigrationSource(sourceForm());
    expect(inspected.kind).toBe("ready");
    if (inspected.kind !== "ready") return;
    const sourceRowId = inspected.inspection.rows[0]!.sourceRowId;
    const dryForm = sourceForm();
    dryForm.set("operationId", "bf2247d8-893e-49ae-8363-8423928e9cc7");
    dryForm.set(
      "mappings",
      JSON.stringify([
        { sourceRowId, decision: "create_new", targetCustomerId: null },
      ]),
    );
    const dryRun = await recordMigrationDryRun(dryForm);
    expect(dryRun.kind).toBe("ready");
    if (dryRun.kind !== "ready") return;
    expect(dryRun.result).toMatchObject({
      status: "valid",
      rowCount: 1,
      createCount: 1,
      availablePoints: "250",
    });

    const applyForm = sourceForm();
    applyForm.set("operationId", "bf2247d8-893e-49ae-8363-8423928e9cc8");
    applyForm.set("mappings", dryForm.get("mappings")!);
    applyForm.set("confirmation", "approved");
    applyForm.set("dryRunId", dryRun.receipt.dryRunId);
    applyForm.set("approvalSha256", dryRun.receipt.approvalSha256);
    applyForm.set("expectedEngineSha256", dryRun.result.engineSha256);
    applyForm.set("expectedSourceSha256", dryRun.result.sourceExportSha256);
    const applied = await applyMigrationOpeningBalance(applyForm);
    expect(applied).toMatchObject({
      kind: "success",
      batchId: "bf2247d8-893e-49ae-8363-8423928e9cc6",
    });
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
    const applicationCall = mocks.rpc.mock.calls[1];
    expect(applicationCall?.[1]).not.toHaveProperty("organization_id");
    expect(applicationCall?.[1]).not.toHaveProperty("actor_user_id");
    expect(applicationCall?.[1]).not.toHaveProperty("points");
  });

  it("fails before parsing when live role or entitlement cannot write", async () => {
    mocks.state.membershipRole = "auditor";
    const roleResult = await inspectMigrationSource(sourceForm());
    expect(roleResult).toMatchObject({ kind: "error" });
    mocks.state.membershipRole = "owner";
    mocks.state.migrationEnabled = false;
    const entitlementResult = await inspectMigrationSource(sourceForm());
    expect(entitlementResult).toMatchObject({ kind: "error" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("keeps compensating correction available after entitlement disable", async () => {
    mocks.state.migrationEnabled = false;
    mocks.rpc.mockResolvedValue({
      data: [
        {
          correction_batch_public_id: "bf2247d8-893e-49ae-8363-8423928e9cc5",
          original_batch_public_id: "bf2247d8-893e-49ae-8363-8423928e9cc6",
          outcome: "created",
          corrected_points: "250",
        },
      ],
      error: null,
    });
    const form = new FormData();
    form.set("batchId", "bf2247d8-893e-49ae-8363-8423928e9cc6");
    form.set("reason", "Correct the approved pilot import");
    form.set("confirmation", "correct");
    form.set("operationId", "bf2247d8-893e-49ae-8363-8423928e9cc7");
    const result = await compensateMigrationBatch(
      { kind: "idle", message: "" },
      form,
    );
    expect(result).toMatchObject({ kind: "success" });
    expect(mocks.rpc).toHaveBeenCalledWith(
      "compensate_migration_batch_v1",
      expect.objectContaining({
        target_batch_public_id: "bf2247d8-893e-49ae-8363-8423928e9cc6",
      }),
    );
  });
});
